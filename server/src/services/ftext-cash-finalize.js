import {randomUUID} from 'node:crypto';
import {lockActiveSaleProducts} from '../lib/inventory-sale-product-lock.js';
import {ftextSettingsHash} from './ftext-installation.js';
import {validateFtextCashResult} from './ftext-cash-requests.js';
const fail=message=>{throw Object.assign(new Error(message),{status:409,code:'FTEXT_CASH_FINALIZE_REVIEW'})};
export async function finalizeFtextCashRequest(db,id,scope,{context,reserveStock}={}){
 if(typeof context!=='function')throw new Error('A current authenticated installation context is required.');
 return db.$transaction(async tx=>{
  // All creation/report/finalization writers lock device before request/product.
  const current=await context(tx,scope,{requireOnline:false});
  const row=(await tx.$queryRaw`SELECT * FROM "FtextCashRequest" WHERE "id"=${id} AND "companyId"=${scope.companyId} AND "storeId"=${scope.storeId} AND "terminalPos"=${scope.terminalPos} FOR UPDATE`)[0];
  if(!row||row.settingsHash!==ftextSettingsHash(current.settings)||row.lifecycleGeneration!==current.settings.lifecycleGeneration)fail('Η εντολή ανήκει σε διαφορετική εγκατάσταση ή κατάσταση καταστήματος.');
  if(row.status==='SALE_COMMITTED')return {saleId:row.saleId,replay:true};
  if(row.status!=='CONFIRMED'||!row.resultHash||row.result?.outcome!=='CONFIRMED')fail('Η φορολογική απόδειξη δεν έχει επιβεβαιωθεί.');
  validateFtextCashResult(row.result,row);
  const saved=row.checkoutJson,items=saved?.resolvedItems,summary=saved?.baseSummary;
  if(!items?.length||!summary||saved.paymentMethod!=='CASH'||Number(summary.total)!==Number(row.total)||Number(summary.discount||0)!==0)fail('Το αρχικό καλάθι δεν συμφωνεί με την απόδειξη.');
  const existing=(await tx.$queryRaw`SELECT "id" FROM "Sale" WHERE "companyId"=${scope.companyId} AND "storeId"=${scope.storeId} AND "clientTransactionId"=${row.clientTransactionId} LIMIT 1`)[0];
  // An unrelated existing business sale is NOT evidence this receipt committed.
  if(existing)fail('Υπάρχει ήδη διαφορετική καταχώριση με το ίδιο αναγνωριστικό. Απαιτείται έλεγχος.');
  const shift=(await tx.$queryRaw`SELECT "id" FROM "CashShiftSession" WHERE "id"=${row.sessionId} AND "companyId"=${scope.companyId} AND "storeId"=${scope.storeId} AND "terminalPos"=${scope.terminalPos} AND "status"='OPEN' FOR UPDATE`)[0];
  if(!shift)fail('Η αρχική βάρδια δεν είναι πλέον ανοικτή. Η απόδειξη διατηρήθηκε για έλεγχο.');
  await lockActiveSaleProducts(tx,{companyId:scope.companyId,storeId:scope.storeId,productIds:items.map(i=>i.productId)});
  const saleId=randomUUID();
  await tx.$executeRaw`INSERT INTO "Sale" ("id","companyId","storeId","operatorEmployeeId","fiscalStatus","subtotal","discount","total","status","source","clientTransactionId","saleFingerprint","duplicateConfirmed","transactionMode","operationChannel","audience") VALUES (${saleId},${scope.companyId},${scope.storeId},${saved.operatorEmployeeId||null},'ISSUED',${summary.subtotal},0,${row.total},'COMPLETED','POS',${row.clientTransactionId},${row.requestHash},false,'NORMAL','COUNTER','NORMAL')`;
  const stock=reserveStock||(await import('../routes/store-pos.js')).reserveSharedStock;
  for(const item of items){
   const lineId=randomUUID();await tx.$executeRaw`INSERT INTO "SaleLine" ("id","saleId","productId","description","quantity","unitPrice","discount","vatRate","lineTotal","scannedBarcode") VALUES (${lineId},${saleId},${item.productId},${item.name},${item.quantity},${item.effectiveUnitPrice},0,${item.vatRate},${item.lineTotal},${item.barcode||null})`;
   await stock(tx,{...scope,productId:item.productId,quantity:item.quantity,productName:item.name,saleId,saleLineId:lineId,priceSource:item.priceSource,actorId:saved.actorId,actorName:saved.actorName});
  }
  await tx.$executeRaw`INSERT INTO "Payment" ("id","saleId","method","amount") VALUES (${randomUUID()},${saleId},'CASH',${row.total})`;
  await tx.$executeRaw`INSERT INTO "StoreTransaction" ("id","companyId","storeId","sessionId","type","amount","description","actorId","actorName") VALUES (${randomUUID()},${scope.companyId},${scope.storeId},${row.sessionId},'SALE_CASH',${row.total},${'POS πώληση '+saleId+' · ΜΕΤΡΗΤΑ'},${saved.actorId},${saved.actorName})`;
  await tx.$executeRaw`INSERT INTO "StoreOperatorAudit" ("id","companyId","storeId","operatorId","actorId","eventType","details") VALUES (${randomUUID()},${scope.companyId},${scope.storeId},${saved.actorId},${saved.actorId},'POS_SALE_COMPLETED',${JSON.stringify({source:'FTEXT_CASH',requestId:row.id,saleId,terminalPos:scope.terminalPos,sessionId:row.sessionId,total:Number(row.total),receipt:row.result})}::jsonb)`;
  await tx.$executeRaw`UPDATE "FtextCashRequest" SET "status"='SALE_COMMITTED',"saleId"=${saleId},"updatedAt"=NOW() WHERE "id"=${row.id} AND "status"='CONFIRMED'`;
  return {saleId,replay:false};
 },{timeout:20000,maxWait:5000});
}
