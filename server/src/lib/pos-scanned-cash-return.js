import crypto from 'node:crypto';
import {z} from 'zod';
import {scannedCashReturnPlan} from '../../../shared/pos-package-return.mjs';
import {readStockPackage,changePackageStock,packageLock,packageError} from './pos-stock-packages.js';
export const scannedReturnItems=z.object({items:z.array(z.object({productId:z.string().min(1).max(200),quantity:z.number().finite().positive().max(999999),barcode:z.string().max(100).nullable().optional()})).min(1).max(200)}).strict();
export const scannedReturnSchema=scannedReturnItems.extend({requestId:z.string().uuid(),quoteHash:z.string().regex(/^[a-f0-9]{64}$/),sessionId:z.string().min(1),confirmed:z.literal(true)}).strict();
export const scannedReturnStatements=[`CREATE TABLE IF NOT EXISTS "PosScannedCashReturn"("id" TEXT PRIMARY KEY,"companyId" TEXT NOT NULL,"storeId" TEXT NOT NULL,"terminalPos" TEXT NOT NULL,"actorId" TEXT NOT NULL,"requestHash" TEXT NOT NULL,"resultJson" JSONB NOT NULL,"createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW())`];
const hash=value=>crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
export function assertScannedReturnScope({companyId,storeId,terminalPos,user}){
 if(!companyId||!storeId||!terminalPos||!user?.id||user.companyId!==companyId||user.staffAccess)throw packageError('Δεν έχεις δικαίωμα επιστροφής.',403);
 if(user.tokenType==='STORE_OPERATOR'){
  if(user.storeId!==storeId||!user.permissions?.includes('RETURN_ITEMS')||!user.permissions?.includes('POS_CASH'))throw packageError('Χρειάζονται δικαιώματα επιστροφής ειδών και μετρητών.',403);
 }else if(!(['OWNER','SUPER_ADMIN'].includes(user.role)||user.isSuperAdmin||user.platformRole==='SUPER_ADMIN'))throw packageError('Δεν έχεις δικαίωμα επιστροφής.',403);
}
export async function quoteScannedCashReturn(db,scope,input){
 assertScannedReturnScope(scope);const body=scannedReturnItems.parse(input),{companyId,storeId,terminalPos}=scope;
 const shift=(await db.$queryRaw`SELECT "id" FROM "CashShiftSession" WHERE "companyId"=${companyId} AND "storeId"=${storeId} AND "terminalPos"=${terminalPos} AND "status"='OPEN' ORDER BY "openedAt" DESC LIMIT 1 FOR SHARE`)[0];
 if(!shift)throw packageError('Δεν υπάρχει ανοικτή βάρδια αυτού του POS.');
 const ids=[...new Set(body.items.map(i=>i.productId))];
 const products=await db.$queryRaw`SELECT p."id",p."name",p."unit",p."isSet",p."isRecipe",p."trackStock",COALESCE(sp."salePrice",p."salePrice") AS "salePrice",COALESCE(vd."vatRate",p."vatRate") AS "vatRate" FROM "Product" p JOIN "StoreProduct" sp ON sp."productId"=p."id" AND sp."storeId"=${storeId} AND sp."active"=TRUE JOIN "Store" s ON s."id"=sp."storeId" AND s."companyId"=p."companyId" AND s."active"=TRUE LEFT JOIN "ManagementVatDepartment" vd ON vd."id"=COALESCE(sp."vatDepartmentIdOverride",p."vatDepartmentId") AND vd."companyId"=p."companyId" WHERE p."companyId"=${companyId} AND p."active"=TRUE AND p."id"=ANY(${ids}::text[])`;
 if(products.length!==ids.length)throw packageError('Ένα είδος δεν είναι ενεργό στο επιλεγμένο κατάστημα.');
 const byId=new Map(products.map(p=>[p.id,p]));const prepared=[];
 for(const item of body.items){
  const p=byId.get(item.productId);
  if(p.isSet||p.isRecipe)throw packageError('Η απευθείας επιστροφή SET ή παρασκευής χρειάζεται έλεγχο της σύνθεσης.');
  const config=await readStockPackage(db,{companyId,storeId,productId:p.id});
  let storePrice=Number(p.salePrice);
  if(item.barcode){const code=(await db.$queryRaw`SELECT "salePrice" FROM "ProductBarcode" WHERE "productId"=${p.id} AND "barcode"=${item.barcode}`)[0];if(!code)throw packageError('Το barcode δεν ανήκει στο είδος.');if(!config&&code.salePrice!=null)storePrice=Number(code.salePrice);}
  const baking=await db.$queryRaw`SELECT "productId" FROM "StoreBakingPolicy" WHERE "companyId"=${companyId} AND "storeId"=${storeId} AND "productId"=${p.id} LIMIT 1`;
  if(baking.length)throw packageError('Για είδος ψημένων χρησιμοποίησε την επιστροφή της αρχικής συναλλαγής.');
  if(config){const base=(await db.$queryRaw`SELECT p."id" FROM "Product" p JOIN "StoreProduct" sp ON sp."productId"=p."id" AND sp."storeId"=${storeId} AND sp."active"=TRUE WHERE p."companyId"=${companyId} AND p."id"=${config.baseProductId} AND p."active"=TRUE AND p."trackStock"=TRUE`)[0];if(!base)throw packageError('Το βασικό είδος συσκευασίας δεν είναι διαθέσιμο.');}
  prepared.push({productId:p.id,name:p.name,quantity:item.quantity,storePrice,vatRate:Number(p.vatRate),trackStock:config?true:p.trackStock,...(config?{baseProductId:config.baseProductId,unitsPerPackage:Number(config.unitsPerPackage)}:{})});
 }
 let plan;try{plan=scannedCashReturnPlan(prepared)}catch(e){throw packageError(e.message,400)}
 const items=plan.items.map((line,i)=>({...line,name:prepared[i].name,vatRate:prepared[i].vatRate,trackStock:prepared[i].trackStock}));
 const result={...plan,items,sessionId:shift.id,terminalPos};
 return {...result,quoteHash:hash(result)};
}
export async function recordScannedCashReturn(db,scope,input){
 assertScannedReturnScope(scope);const body=scannedReturnSchema.parse(input),{companyId,storeId,terminalPos,user}=scope,requestHash=hash(body);
 return db.$transaction(async tx=>{
  await tx.$queryRaw`SELECT (pg_advisory_xact_lock(hashtext(${`scanned-return:${body.requestId}`})) IS NULL) AS locked`;
  const previous=(await tx.$queryRaw`SELECT * FROM "PosScannedCashReturn" WHERE "id"=${body.requestId}`)[0];
  if(previous){if(previous.companyId!==companyId||previous.storeId!==storeId||previous.terminalPos!==terminalPos||previous.actorId!==user.id||previous.requestHash!==requestHash)throw packageError('Η ταυτότητα επιστροφής ανήκει σε άλλη ενέργεια.');return {...previous.resultJson,replayed:true};}
  await packageLock(tx,storeId);
  const quote=await quoteScannedCashReturn(tx,scope,{items:body.items});
  if(quote.sessionId!==body.sessionId||quote.quoteHash!==body.quoteHash)throw packageError('Η βάρδια, η τιμή ή το είδος άλλαξε. Κλείσε και άνοιξε ξανά την επιβεβαίωση.');
  const saleId=crypto.randomUUID(),amount=quote.refundCents/100,who=user.fullName||user.email||'Χειριστής';
  await tx.$executeRaw`INSERT INTO "Sale"("id","companyId","storeId","operatorEmployeeId","fiscalStatus","subtotal","discount","total","status","source","occurredAt","transactionMode","reversalKind","operationChannel") VALUES(${saleId},${companyId},${storeId},${user.employeeId||null},'NON_FISCAL',${-amount},0,${-amount},'COMPLETED','POS_REVERSAL',NOW(),'SCANNED_CASH_RETURN','RETURN_ITEMS','COUNTER')`;
  for(const line of quote.items){
   const lineId=crypto.randomUUID();
   await tx.$executeRaw`INSERT INTO "SaleLine"("id","saleId","productId","description","quantity","unitPrice","discount","vatRate","lineTotal") VALUES(${lineId},${saleId},${line.productId},${line.name},${-line.quantity},${line.unitCents/100},0,${line.vatRate},${-line.totalCents/100})`;
   if(line.stockProductId!==line.productId){await changePackageStock(tx,{companyId,storeId,productId:line.productId,quantity:line.quantity,saleId,lineId,restore:true});}
   else if(line.trackStock){
    const updated=await tx.$executeRaw`UPDATE "StoreProduct" sp SET "currentStock"=COALESCE(sp."currentStock",0)+${line.stockQuantity},"updatedAt"=NOW() FROM "Product" p WHERE sp."storeId"=${storeId} AND sp."productId"=${line.productId} AND sp."active"=TRUE AND p."id"=sp."productId" AND p."companyId"=${companyId} AND p."active"=TRUE AND p."trackStock"=TRUE`;
    if(updated!==1)throw packageError('Το είδος αποθέματος άλλαξε. Δεν καταχωρίστηκε επιστροφή.');
    await tx.$executeRaw`INSERT INTO "StockMovement"("id","storeId","productId","movementType","quantity","unitCost","sourceType","sourceId","note","createdByUserId","idempotencyKey") VALUES(${crypto.randomUUID()},${storeId},${line.productId},'RETURN',${line.stockQuantity},${null},'POS_CUSTOMER_RETURN',${saleId},'Επιστροφή πελάτη με μετρητά',${null},${`cash-return:${lineId}`})`;
   }
  }
  await tx.$executeRaw`INSERT INTO "Payment"("id","saleId","method","amount") VALUES(${crypto.randomUUID()},${saleId},'CASH',${-amount})`;
  const description=`POS ΕΠΙΣΤΡΟΦΗ ΠΕΛΑΤΗ ${saleId} · ΜΕΤΡΗΤΑ · χωρίς αρχική απόδειξη`;
  await tx.$executeRaw`INSERT INTO "StoreTransaction"("id","companyId","storeId","sessionId","type","amount","description","actorId","actorName") VALUES(${crypto.randomUUID()},${companyId},${storeId},${quote.sessionId},'SALE_CASH',${-amount},${description},${user.id},${who})`;
  const result={ok:true,saleId,sessionId:quote.sessionId,total:-amount,refundCents:quote.refundCents,stock:quote.stock,paymentMethod:'CASH',transactionMode:'SCANNED_CASH_RETURN',fiscalStatus:'NON_FISCAL'};
  const details=JSON.stringify({...result,items:quote.items,requestId:body.requestId,terminalPos,actorName:who,originalReceiptProvided:false});
  await tx.$executeRaw`INSERT INTO "PosSaleActionAudit"("id","companyId","storeId","saleId","actionType","reason","actorId","actorName","details") VALUES(${crypto.randomUUID()},${companyId},${storeId},${saleId},'SCANNED_CASH_RETURN','Επιστροφή από πελάτη',${user.id},${who},${details}::jsonb)`;
  await tx.$executeRaw`INSERT INTO "StoreOperatorAudit"("id","companyId","storeId","operatorId","actorId","eventType","details") VALUES(${crypto.randomUUID()},${companyId},${storeId},${user.operatorId||user.id},${user.id},'POS_RETURN_COMPLETED',${details}::jsonb)`;
  await tx.$executeRaw`INSERT INTO "PosScannedCashReturn"("id","companyId","storeId","terminalPos","actorId","requestHash","resultJson") VALUES(${body.requestId},${companyId},${storeId},${terminalPos},${user.id},${requestHash},${JSON.stringify(result)}::jsonb)`;
  return result;
 });
}
// A cancellation tombstone reconciles an uncertain response and blocks a late
// POST with the same request identity. If already committed, return its result.
export async function cancelScannedCashReturn(db,scope,input){
 assertScannedReturnScope(scope);const body=scannedReturnSchema.parse(input),requestHash=hash(body),{companyId,storeId,terminalPos,user}=scope;
 return db.$transaction(async tx=>{
  await tx.$queryRaw`SELECT (pg_advisory_xact_lock(hashtext(${`scanned-return:${body.requestId}`})) IS NULL) AS locked`;
  const old=(await tx.$queryRaw`SELECT * FROM "PosScannedCashReturn" WHERE "id"=${body.requestId}`)[0];
  if(old){if(old.companyId!==companyId||old.storeId!==storeId||old.terminalPos!==terminalPos||old.actorId!==user.id||old.requestHash!==requestHash)throw packageError('Η ταυτότητα επιστροφής ανήκει σε άλλη ενέργεια.');return {...old.resultJson,replayed:true};}
  const result={ok:true,cancelled:true};
  await tx.$executeRaw`INSERT INTO "PosScannedCashReturn"("id","companyId","storeId","terminalPos","actorId","requestHash","resultJson") VALUES(${body.requestId},${companyId},${storeId},${terminalPos},${user.id},${requestHash},${JSON.stringify(result)}::jsonb)`;
  return result;
 });
}
