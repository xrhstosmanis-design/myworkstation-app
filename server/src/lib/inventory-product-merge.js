import {randomUUID,createHash} from 'node:crypto';
import {z} from 'zod';
import {resolveProductCardVat} from './product-card-vat.js';
const fail=(message,status=409)=>{throw Object.assign(new Error(message),{status})};
const selection=z.object({storeId:z.string().min(1),productIds:z.array(z.string().min(1)).min(2).max(4),targetId:z.string().min(1)});
const hash=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
function access(user,body){if(!user?.companyId||user.tokenType==='STORE_OPERATOR'||!['OWNER','SUPER_ADMIN'].includes(user.role)||(user.storeId&&user.storeId!==body.storeId))fail('Δεν επιτρέπεται η συγχώνευση στο κατάστημα.',403);if(new Set(body.productIds).size!==body.productIds.length||!body.productIds.includes(body.targetId))fail('Επίλεξε 2–4 διαφορετικά είδη και ποιο θα κρατηθεί.',400)}
async function preview(tx,user,body){
 const company=user.companyId,ids=[...body.productIds].sort();
 if(!await tx.store.findFirst({where:{id:body.storeId,companyId:company,active:true},select:{id:true}}))fail('Μη έγκυρο κατάστημα.',403);
 const rows=await tx.$queryRaw`SELECT p."id",p."name",p."sku",p."unit",p."vatDepartmentId",p."vatRate",p."costPrice",p."trackStock",p."isSet",p."isRecipe",p."eDeliveryEnabled",p."efoodEnabled",p."woltEnabled",p."updatedAt",sp."updatedAt" AS "storeUpdatedAt",COALESCE(sp."salePrice",p."salePrice",0) AS "salePrice",sp."currentStock" FROM "Product" p JOIN "StoreProduct" sp ON sp."productId"=p."id" AND sp."storeId"=${body.storeId} WHERE p."companyId"=${company} AND p."id"=ANY(${ids}::text[]) AND p."active"=true AND sp."active"=true ORDER BY p."id" FOR UPDATE OF p,sp`;
 if(rows.length!==ids.length)fail('Η επιλογή άλλαξε ή περιέχει ανενεργό είδος. Ανανέωσε.');
 const target=rows.find(r=>r.id===body.targetId),blockers=[];
 const department=target.vatDepartmentId?await resolveProductCardVat(tx,company,target.vatDepartmentId,Number(target.vatRate)):null;
 if(!department)blockers.push('Συμπλήρωσε πρώτα ενεργό Τμήμα ΦΠΑ στο είδος που κρατάς.');
 if(rows.some(r=>r.unit!==target.unit||Number(r.vatRate)!==Number(target.vatRate)||(r.vatDepartmentId&&r.vatDepartmentId!==target.vatDepartmentId)))blockers.push('Τα είδη πρέπει να έχουν ίδια μονάδα και συμβατό Τμήμα ΦΠΑ.');
 if(rows.some(r=>r.trackStock!==target.trackStock||r.isSet||r.isRecipe||r.eDeliveryEnabled||r.efoodEnabled||r.woltEnabled))blockers.push('Δεν υποστηρίζονται διαφορετική παρακολούθηση stock, SET, συνταγές ή είδη delivery.');
 const others=await tx.$queryRaw`SELECT "productId","storeId" FROM "StoreProduct" WHERE "productId"=ANY(${ids}::text[]) AND "storeId"<>${body.storeId}`;
 if(others.length)blockers.push('Υπάρχει σύνδεση με άλλο κατάστημα. Η συγχώνευση αυτής της επιλογής χρειάζεται κεντρικό έλεγχο.');
 const composition=await tx.$queryRaw`SELECT "id" FROM "ProductSetItem" WHERE "companyId"=${company} AND ("productId"=ANY(${ids}::text[]) OR "relatedProductId"=ANY(${ids}::text[])) UNION ALL SELECT "id" FROM "PreparationRecipeLine" WHERE "companyId"=${company} AND ("productId"=ANY(${ids}::text[]) OR "ingredientProductId"=ANY(${ids}::text[]))`;
 if(composition.length)blockers.push('Υπάρχει σύνθεση ή συνταγή που χρησιμοποιεί επιλεγμένο είδος.');
 // Preserve live selling/counting workflows: merging is an explicit maintenance action.
 if((await tx.$queryRaw`SELECT "id" FROM "CashShiftSession" WHERE "companyId"=${company} AND "storeId"=${body.storeId} AND "status"='OPEN' LIMIT 1`).length)blockers.push('Κλείσε πρώτα τις βάρδιες POS του καταστήματος και συγχρόνισε τα τερματικά.');
 if((await tx.$queryRaw`SELECT "id" FROM "Stocktake" WHERE "companyId"=${company} AND "storeId"=${body.storeId} AND "status"='DRAFT' LIMIT 1`).length)blockers.push('Υπάρχει ανοικτή απογραφή στο κατάστημα.');
 if((await tx.$queryRaw`SELECT l."id" FROM "PurchaseDocumentLine" l JOIN "PurchaseDocument" d ON d."id"=l."purchaseDocumentId" WHERE d."companyId"=${company} AND d."storeId"=${body.storeId} AND d."status"='DRAFT' AND l."productId"=ANY(${ids}::text[]) LIMIT 1`).length)blockers.push('Υπάρχει πρόχειρο παραστατικό με επιλεγμένο είδος.');
 if((await tx.$queryRaw`SELECT l."id" FROM "PurchaseOrderLine" l JOIN "PurchaseOrder" o ON o."id"=l."orderId" WHERE o."companyId"=${company} AND o."storeId"=${body.storeId} AND o."status" NOT IN ('FINAL','INVOICED','CANCELLED') AND l."productId"=ANY(${ids}::text[]) LIMIT 1`).length)blockers.push('Υπάρχει ανοικτή παραγγελία με επιλεγμένο είδος.');
 const barcodes=await tx.$queryRaw`SELECT "id","productId","barcode","unitMultiplier","salePrice","updatedAt" FROM "ProductBarcode" WHERE "productId"=ANY(${ids}::text[]) ORDER BY "id" FOR UPDATE`;
 if(barcodes.some(b=>Number(b.unitMultiplier)!==1))blockers.push('Υπάρχει barcode συσκευασίας. Απαιτείται έλεγχος μετατροπής μονάδων.');
 if(new Set(barcodes.map(b=>b.barcode)).size!==barcodes.length)blockers.push('Υπάρχουν ίδια barcode σε διαφορετικές καρτέλες. Διόρθωσέ τα πρώτα.');
 const foreignBarcodes=barcodes.length?await tx.$queryRaw`SELECT pb."id" FROM "ProductBarcode" pb JOIN "Product" p ON p."id"=pb."productId" WHERE p."companyId"=${company} AND NOT (p."id"=ANY(${ids}::text[])) AND pb."barcode"=ANY(${barcodes.map(b=>b.barcode)}::text[]) LIMIT 1`:[];
 if(foreignBarcodes.length)blockers.push('Barcode χρησιμοποιείται σε τρίτη καρτέλα.');
 const suppliers=await tx.$queryRaw`SELECT "id","productId","supplierId","supplierCode","active","updatedAt" FROM "SupplierProductLink" WHERE "companyId"=${company} AND "productId"=ANY(${ids}::text[]) ORDER BY "id" FOR UPDATE`;
 if(new Set(suppliers.map(s=>s.supplierId)).size!==suppliers.length)blockers.push('Περισσότερες καρτέλες συνδέονται με τον ίδιο προμηθευτή. Απαιτείται έλεγχος κωδικών.');
 const mappings=await tx.$queryRaw`SELECT "id","productId","updatedAt" FROM "SupplierProductMapping" WHERE "companyId"=${company} AND "productId"=ANY(${ids}::text[]) ORDER BY "id" FOR UPDATE`;
 if((await tx.$queryRaw`SELECT "id" FROM "OnlineOrder" WHERE "companyId"=${company} AND "storeId"=${body.storeId} AND "status" NOT IN ('DELIVERED','CANCELLED') LIMIT 1`).length)blockers.push('Υπάρχει ανοικτή online παραγγελία στο κατάστημα.');
 if((await tx.$queryRaw`SELECT to_regclass('"TableOrder"')::text AS "tableName"`)[0]?.tableName&&(await tx.$queryRaw`SELECT "id" FROM "TableOrder" WHERE "companyId"=${company} AND "storeId"=${body.storeId} AND "status" NOT IN ('PAID','CANCELLED') LIMIT 1`).length)blockers.push('Υπάρχει ανοικτή παραγγελία τραπεζιού στο κατάστημα.');
 if((await tx.$queryRaw`SELECT "productId" FROM "StoreBakedBalance" WHERE "companyId"=${company} AND "storeId"=${body.storeId} AND "productId"=ANY(${ids}::text[]) AND "enabled"=true LIMIT 1`).length)blockers.push('Υπάρχει ενεργή διαχείριση ψημένων ειδών.');
 const stock=rows.reduce((sum,r)=>sum+Number(r.currentStock||0),0);
 if(!Number.isFinite(stock))fail('Μη έγκυρο απόθεμα.');
 const state={storeId:body.storeId,targetId:body.targetId,rows,barcodes,suppliers,mappings,blockers};
 return {rows:rows.map(r=>({...r,salePrice:Number(r.salePrice),currentStock:Number(r.currentStock||0),vatRate:Number(r.vatRate)})),barcodes:barcodes.map(b=>({barcode:b.barcode,productId:b.productId,salePrice:b.salePrice==null?null:Number(b.salePrice)})),targetId:target.id,combinedStock:stock,blockers,previewHash:hash(state),state};
}
export async function previewInventoryMerge(db,user,input){const body=selection.strict().parse(input);access(user,body);return db.$transaction(async tx=>{const {state,...result}=await preview(tx,user,body);return result})}
export async function confirmInventoryMerge(db,user,input){
 const body=selection.extend({requestId:z.string().uuid(),previewHash:z.string().length(64),confirm:z.literal(true),reason:z.string().trim().min(3).max(300)}).strict().parse(input);access(user,body);
 const fingerprint=hash({...body,productIds:[...body.productIds].sort()});
 return db.$transaction(async tx=>{
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${user.companyId+':product-sku'}))`;
  const previous=(await tx.$queryRaw`SELECT "details" FROM "StoreOperatorAudit" WHERE "companyId"=${user.companyId} AND "storeId"=${body.storeId} AND "eventType"='INVENTORY_PRODUCT_MERGE' AND "details"->>'requestId'=${body.requestId} LIMIT 1`)[0];
  if(previous){if(previous.details.fingerprint!==fingerprint||previous.details.actorId!==user.id)fail('Το αίτημα συγχώνευσης έχει διαφορετικά στοιχεία.');return {...previous.details.result,idempotent:true};}
  const p=await preview(tx,user,body);
  if(p.blockers.length)fail(p.blockers.join(' '));
  if(p.previewHash!==body.previewHash)fail('Τα στοιχεία άλλαξαν. Άνοιξε ξανά την προεπισκόπηση.');
  const sources=p.state.rows.filter(r=>r.id!==body.targetId),sourceIds=sources.map(r=>r.id),mergeId=randomUUID();
  for(const source of sources){
   const quantity=Number(source.currentStock||0);
   await tx.$executeRaw`UPDATE "StoreProduct" SET "currentStock"=0,"active"=false,"updatedAt"=NOW() WHERE "storeId"=${body.storeId} AND "productId"=${source.id}`;
   await tx.$executeRaw`UPDATE "Product" SET "active"=false,"updatedAt"=NOW() WHERE "companyId"=${user.companyId} AND "id"=${source.id}`;
   if(quantity!==0){
    await tx.$executeRaw`INSERT INTO "StockMovement" ("id","storeId","productId","movementType","quantity","unitCost","sourceType","sourceId","note","createdByUserId") VALUES (${randomUUID()},${body.storeId},${source.id},'ADJUSTMENT',${-quantity},${Number(source.costPrice||0)},'PRODUCT_MERGE',${mergeId+":"+source.id},${body.reason},${user.id})`;
    await tx.$executeRaw`INSERT INTO "StockMovement" ("id","storeId","productId","movementType","quantity","unitCost","sourceType","sourceId","note","createdByUserId") VALUES (${randomUUID()},${body.storeId},${body.targetId},'ADJUSTMENT',${quantity},${Number(source.costPrice||0)},'PRODUCT_MERGE',${mergeId+":"+source.id},${body.reason},${user.id})`;
   }
  }
  await tx.$executeRaw`UPDATE "StoreProduct" SET "currentStock"=${p.combinedStock},"updatedAt"=NOW() WHERE "storeId"=${body.storeId} AND "productId"=${body.targetId}`;
  await tx.$executeRaw`UPDATE "ProductBarcode" SET "productId"=${body.targetId},"updatedAt"=NOW() WHERE "productId"=ANY(${sourceIds}::text[])`;
  await tx.$executeRaw`UPDATE "SupplierProductLink" SET "productId"=${body.targetId},"updatedAt"=NOW() WHERE "companyId"=${user.companyId} AND "productId"=ANY(${sourceIds}::text[])`;
  await tx.$executeRaw`UPDATE "SupplierProductMapping" SET "productId"=${body.targetId},"updatedAt"=NOW() WHERE "companyId"=${user.companyId} AND "productId"=ANY(${sourceIds}::text[])`;
  const result={ok:true,targetId:body.targetId,merged:sourceIds.length,combinedStock:p.combinedStock,mergeId};
  await tx.$executeRaw`INSERT INTO "StoreOperatorAudit" ("id","companyId","storeId","operatorId","actorId","eventType","details") VALUES (${randomUUID()},${user.companyId},${body.storeId},${user.id},${user.id},'INVENTORY_PRODUCT_MERGE',${JSON.stringify({requestId:body.requestId,fingerprint,actorId:user.id,sourceIds,reason:body.reason,before:p.state,result,historyPreserved:true})}::jsonb)`;
  return result;
 },{isolationLevel:'Serializable'});
}
