import {randomUUID,createHash} from 'node:crypto';
import {z} from 'zod';
import {performance} from 'node:perf_hooks';
import {resolveProductCardVat} from './product-card-vat.js';

const fail=(message,status=400)=>{throw Object.assign(new Error(message),{status})};
const schema=z.object({storeId:z.string().min(1),requestId:z.string().uuid(),productIds:z.array(z.string().min(1)).max(500).default([]),allProducts:z.literal(true).optional(),allowPosPriceChange:z.boolean().optional(),categoryId:z.string().min(1).optional(),subcategoryId:z.string().min(1).nullable().optional(),vatDepartmentId:z.string().min(1).optional(),vatRate:z.number().finite().min(0).max(100).optional(),priceMode:z.enum(['SET','INCREASE_PERCENT','DECREASE_PERCENT','INCREASE_AMOUNT','DECREASE_AMOUNT']).optional(),priceValue:z.number().finite().min(0).max(999999).optional(),active:z.boolean().optional(),expectedPrices:z.record(z.number().finite().min(0)).optional(),setItem:z.object({confirmed:z.literal(true),relatedProductId:z.string().min(1),quantity:z.number().finite().positive().max(100),salePrice:z.number().finite().min(0).max(999999),clearPreparationFee:z.boolean().default(false)}).strict().optional()}).strict();
export function bulkCardPrice(old,mode,value){
 const result=mode==='SET'?value:mode==='INCREASE_PERCENT'?old*(1+value/100):mode==='DECREASE_PERCENT'?old*(1-value/100):mode==='INCREASE_AMOUNT'?old+value:old-value;
 if(!Number.isFinite(result)||result<0||result>999999)fail('Η νέα τιμή πρέπει να είναι από 0 έως 999999 €.');
 return Math.round((result+Number.EPSILON)*100)/100;
}
export async function saveInventoryBulkCard(db,user,input){
 const body=schema.parse(input),company=user?.companyId,requestedIds=[...new Set(body.productIds)].sort();
 let ids=requestedIds;
 if(body.allProducts){
  if(body.allowPosPriceChange===undefined||requestedIds.length||Object.keys(body).some(key=>!['storeId','requestId','productIds','allProducts','allowPosPriceChange'].includes(key)))fail('Η επιλογή όλων των ειδών επιτρέπεται μόνο για την άδεια αλλαγής τιμής POS.');
 }else if(!ids.length)fail('Επίλεξε πρώτα είδη.');
 if(!company||user.tokenType==='STORE_OPERATOR'||!['SUPER_ADMIN','OWNER','ADMIN','MANAGER'].includes(user.role)||(user.storeId&&user.storeId!==body.storeId))fail('Δεν επιτρέπεται το επιλεγμένο κατάστημα.',403);
 if(body.vatRate!==undefined&&!body.vatDepartmentId)fail('Επίλεξε πραγματικό Τμήμα ΦΠΑ.');
 if(body.subcategoryId&&!body.categoryId)fail('Επίλεξε πρώτα κατηγορία.');
 if(body.priceMode&&body.priceValue===undefined||!body.priceMode&&body.priceValue!==undefined)fail('Επίλεξε τρόπο και τιμή αλλαγής.');
 if(!body.categoryId&&body.subcategoryId===undefined&&!body.vatDepartmentId&&!body.priceMode&&body.active===undefined&&body.allowPosPriceChange===undefined&&!body.setItem)fail('Διάλεξε τουλάχιστον μία αλλαγή.');
 const fingerprint=createHash('sha256').update(JSON.stringify({...body,productIds:ids})).digest('hex');
 // Error-only phase evidence. Never log product/company/store/request IDs, the
 // request, SQL, audit contents or provider error messages. Business semantics,
 // transaction options and existing lock/replay behavior stay unchanged.
 const permissionOnly=body.allowPosPriceChange!==undefined&&Object.keys(body).every(key=>['storeId','requestId','productIds','allProducts','allowPosPriceChange'].includes(key));
 const started=permissionOnly?performance.now():0,loopStart=permissionOnly?performance.eventLoopUtilization():null,phases=[];
 let phase='transaction-start',phaseStarted=started,selectedCount=null;
 const mark=next=>{if(permissionOnly){const now=performance.now();phases.push({phase,ms:Math.round(now-phaseStarted)});phase=next;phaseStarted=now;}};
 return db.$transaction(async tx=>{
  mark('advisory-lock');
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${company+':inventory-bulk:'+body.storeId}))`;
  mark('store-check');
  if(!await tx.store.findFirst({where:{id:body.storeId,companyId:company,active:true},select:{id:true}}))fail('Μη έγκυρο κατάστημα.',403);
  mark('replay-read');
  const replay=(await tx.$queryRaw`SELECT "details" FROM "StoreOperatorAudit" WHERE "companyId"=${company} AND "storeId"=${body.storeId} AND "eventType"='INVENTORY_BULK_CARD' AND "details"->>'requestId'=${body.requestId} LIMIT 1`)[0];
  if(replay){if(replay.details.fingerprint!==fingerprint||replay.details.actorId!==user.id)fail('Το αίτημα έχει ήδη διαφορετικά στοιχεία.',409);mark('commit');return {ok:true,changed:replay.details.changed,idempotent:true};}
  mark('membership-lock');
  const rows=await tx.$queryRaw`SELECT p."id",p."categoryId",p."subcategoryId",p."vatDepartmentId",p."vatRate",p."isSet",p."allowPosPriceChange",COALESCE(sp."salePrice",p."salePrice",0) AS "salePrice",sp."active" FROM "Product" p JOIN "StoreProduct" sp ON sp."productId"=p."id" AND sp."storeId"=${body.storeId} WHERE p."companyId"=${company} AND (${body.allProducts===true} OR p."id"=ANY(${ids}::text[])) ORDER BY p."id" FOR UPDATE OF p,sp`;
  selectedCount=rows.length;
  if(body.allProducts)ids=rows.map(row=>row.id);
  if(!ids.length)fail('Δεν υπάρχουν είδη στο επιλεγμένο κατάστημα.');
  if(rows.length!==ids.length)fail('Κάποιο είδος δεν ανήκει στο επιλεγμένο κατάστημα.',409);
  if(body.categoryId&&!(await tx.$queryRaw`SELECT "id" FROM "ProductCategory" WHERE "id"=${body.categoryId} AND "companyId"=${company} AND "active"=true FOR SHARE`)[0])fail('Η κατηγορία δεν είναι ενεργή στην εταιρεία.');
  if(body.subcategoryId&&!(await tx.$queryRaw`SELECT "id" FROM "ProductSubcategory" WHERE "id"=${body.subcategoryId} AND "categoryId"=${body.categoryId} AND "companyId"=${company} AND "active"=true FOR SHARE`)[0])fail('Η υποκατηγορία δεν ανήκει στην κατηγορία.');
  let setBefore=null;
  if(body.setItem){
   const item=body.setItem;
   if(ids.includes(item.relatedProductId))fail('Το συνοδευτικό δεν μπορεί να είναι ένα από τα κύρια είδη.');
   const related=(await tx.$queryRaw`SELECT p."id",p."isSet",COALESCE(sp."salePrice",p."salePrice",0) AS "salePrice" FROM "Product" p JOIN "StoreProduct" sp ON sp."productId"=p."id" AND sp."storeId"=${body.storeId} WHERE p."companyId"=${company} AND p."id"=${item.relatedProductId} AND p."active"=true AND sp."active"=true FOR SHARE OF p,sp`)[0];
   if(!related||related.isSet)fail('Επίλεξε ενεργό απλό συνοδευτικό του ίδιου καταστήματος.');
   if(Number(related.salePrice)!==item.salePrice)fail('Η τιμή του συνοδευτικού άλλαξε. Ανανέωσε την επιλογή.',409);
   if((await tx.$queryRaw`SELECT "productId" FROM "StoreProduct" WHERE "productId"=ANY(${ids}::text[]) AND "storeId"<>${body.storeId} LIMIT 1`)[0])fail('Η σύνθεση SET είναι κοινή. Η επιλογή περιλαμβάνει είδη άλλου καταστήματος.',409);
   const links=await tx.$queryRaw`SELECT * FROM "ProductSetItem" WHERE "companyId"=${company} AND "productId"=ANY(${ids}::text[]) ORDER BY "id" FOR UPDATE`;
   const settings=item.clearPreparationFee?await tx.$queryRaw`SELECT * FROM "PreparationProductSettings" WHERE "companyId"=${company} AND "productId"=ANY(${ids}::text[]) ORDER BY "productId" FOR UPDATE`:[];
   if(settings.some(row=>Number(row.environmentalFee)!==0&&Math.abs(Number(row.environmentalFee)-item.salePrice*item.quantity)>0.000001))fail('Υπάρχει διαφορετική εισφορά παρασκευής. Έλεγξε την πριν από την αλλαγή.',409);
   setBefore={links,settings};
   const relationIds=ids.map(()=>randomUUID());
   await tx.$executeRaw`INSERT INTO "ProductSetItem" ("id","companyId","productId","relatedProductId","quantity","salePrice","updatedBy","updatedByName") SELECT v."id",${company},v."productId",${item.relatedProductId},${item.quantity},${item.salePrice},${user.id},${user.fullName||'BackOffice'} FROM unnest(${ids}::text[],${relationIds}::text[]) AS v("productId","id") ON CONFLICT ("companyId","productId","relatedProductId") DO UPDATE SET "quantity"=EXCLUDED."quantity","salePrice"=EXCLUDED."salePrice","updatedBy"=EXCLUDED."updatedBy","updatedByName"=EXCLUDED."updatedByName","updatedAt"=NOW()`;
   await tx.$executeRaw`UPDATE "Product" SET "isSet"=true,"updatedAt"=NOW() WHERE "companyId"=${company} AND "id"=ANY(${ids}::text[]) AND "isSet"=false`;
   if(item.clearPreparationFee)await tx.$executeRaw`UPDATE "PreparationProductSettings" SET "environmentalFee"=0,"updatedAt"=NOW() WHERE "companyId"=${company} AND "productId"=ANY(${ids}::text[]) AND "environmentalFee"<>0`;
  }
  const vat=body.vatDepartmentId?await resolveProductCardVat(tx,company,body.vatDepartmentId,body.vatRate):null,changes=[];
  mark('permission-update');
  if(body.allowPosPriceChange!==undefined)await tx.$executeRaw`UPDATE "Product" SET "allowPosPriceChange"=${body.allowPosPriceChange},"updatedAt"=NOW() WHERE "companyId"=${company} AND "id"=ANY(${ids}::text[]) AND "allowPosPriceChange" IS DISTINCT FROM ${body.allowPosPriceChange}`;
  mark('audit-build');
  for(const row of rows){
   let nextPrice;
   if(body.priceMode){if(body.expectedPrices?.[row.id]!==Number(row.salePrice))fail('Η τιμή άλλαξε. Ανανέωσε την επιλογή πριν την καταχώρηση.',409);nextPrice=bulkCardPrice(Number(row.salePrice),body.priceMode,body.priceValue);}
   if(body.categoryId)await tx.$executeRaw`UPDATE "Product" SET "categoryId"=${body.categoryId},"subcategoryId"=${body.subcategoryId??null},"updatedAt"=NOW() WHERE "companyId"=${company} AND "id"=${row.id}`;
   else if(body.subcategoryId===null)await tx.$executeRaw`UPDATE "Product" SET "subcategoryId"=NULL,"updatedAt"=NOW() WHERE "companyId"=${company} AND "id"=${row.id}`;
   if(vat)await tx.$executeRaw`UPDATE "Product" SET "vatDepartmentId"=${vat.id},"vatRate"=${vat.vatRate},"vatVerified"=true,"updatedAt"=NOW() WHERE "companyId"=${company} AND "id"=${row.id}`;
   if(nextPrice!==undefined&&nextPrice!==Number(row.salePrice)){
    await tx.$executeRaw`UPDATE "StoreProduct" SET "salePrice"=${nextPrice},"updatedAt"=NOW() WHERE "storeId"=${body.storeId} AND "productId"=${row.id}`;
    await tx.$executeRaw`INSERT INTO "ProductPriceHistory" ("id","companyId","productId","storeId","oldPrice","newPrice","changeType","createdByUserId") VALUES (${randomUUID()},${company},${row.id},${body.storeId},${Number(row.salePrice)},${nextPrice},'INVENTORY_BULK_CARD',${user.id})`;
   }
   if(body.active!==undefined)await tx.$executeRaw`UPDATE "StoreProduct" SET "active"=${body.active},"updatedAt"=NOW() WHERE "storeId"=${body.storeId} AND "productId"=${row.id}`;
   changes.push({productId:row.id,before:row,after:{categoryId:body.categoryId,subcategoryId:body.categoryId?body.subcategoryId??null:body.subcategoryId,vatDepartmentId:vat?.id,vatRate:vat?.vatRate,salePrice:nextPrice,active:body.active,allowPosPriceChange:body.allowPosPriceChange,setItem:body.setItem}});
  }
  mark('audit-write');
  await tx.$executeRaw`INSERT INTO "StoreOperatorAudit" ("id","companyId","storeId","operatorId","actorId","eventType","details") VALUES (${randomUUID()},${company},${body.storeId},${user.id},${user.id},'INVENTORY_BULK_CARD',${JSON.stringify({requestId:body.requestId,fingerprint,actorId:user.id,allProducts:body.allProducts===true,changed:ids.length,changes,...(body.setItem?{setBefore,setItem:body.setItem}:{})})}::jsonb)`;
  mark('commit');
  return {ok:true,changed:ids.length};
 }).catch(error=>{
  if(permissionOnly&&['P2028','P2024'].includes(error?.code)){
   try{
    const now=performance.now(),loop=performance.eventLoopUtilization(loopStart);
    console.warn('INVENTORY_BULK_PERMISSION_TIMEOUT',JSON.stringify({version:1,code:error.code,phase,totalMs:Math.round(now-started),phases:[...phases,{phase,ms:Math.round(now-phaseStarted)}].slice(-9),allProducts:body.allProducts===true,requestedCount:requestedIds.length,selectedCount,eventLoop:{activeMs:Math.round(loop.active),idleMs:Math.round(loop.idle),utilization:Math.round(loop.utilization*10000)/10000}}));
   }catch{/* Diagnostic delivery must never replace the original failure. */}
  }
  throw error;
 });
}
