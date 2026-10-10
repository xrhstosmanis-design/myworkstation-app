import {Router} from 'express';
import {z} from 'zod';
import crypto from 'crypto';
import {prisma} from '../prisma.js';
import {inventoryStocktakeScopeAllowed} from '../lib/inventory-stocktake-scope.js';
import {lockDraftInventoryStocktake} from '../lib/inventory-stocktake-draft.js';

const router=Router();
const roles=new Set(['SUPER_ADMIN','OWNER','ADMIN','MANAGER']);
const failure=(message,status=409)=>Object.assign(new Error(message),{status});
async function access(req){
 const user=req.user;
 const counter=user?.tokenType==='INVENTORY_COUNTER';
 if(!counter&&!roles.has(user?.role)&&!user?.isSuperAdmin)throw failure('Η δημιουργία είδους απαιτεί πρόσβαση απογραφής ή διαχειριστή.',403);
 if(counter&&(!user.permissions?.includes('INVENTORY_COUNT')||!user.grantId))throw failure('Η πρόσβαση απογραφής δεν είναι ενεργή.',403);
 const rows=await prisma.$queryRaw`SELECT "id","companyId","storeId","status" FROM "Stocktake" WHERE "id"=${req.params.stocktakeId} AND "companyId"=${user.companyId} LIMIT 1`;
 const st=rows[0];if(!inventoryStocktakeScopeAllowed(user,st))throw failure('Δεν βρέθηκε η απογραφή.',404);
 if(st.status!=='DRAFT')throw failure('Η απογραφή δεν είναι ανοικτή.');
 if(counter){
  const grants=await prisma.$queryRaw`SELECT "id" FROM "InventoryAccessGrant" WHERE "id"=${user.grantId} AND "stocktakeId"=${st.id} AND "revokedAt" IS NULL AND "expiresAt">NOW() AND "zoneId" IS NOT DISTINCT FROM ${user.zoneId||null}::text LIMIT 1`;
  if(!grants.length)throw failure('Η πρόσβαση απογραφής δεν είναι ενεργή.',403);
 }
 return st;
}
router.get('/stocktakes/:stocktakeId/new-product-options',async(req,res,next)=>{
 try{
  const st=await access(req);
  const [categories,vats]=await Promise.all([
   prisma.$queryRaw`SELECT "id","name" FROM "ProductCategory" WHERE "companyId"=${st.companyId} AND "active"=true ORDER BY "name"`,
   prisma.$queryRaw`SELECT "id","description","vatRate" FROM "ManagementVatDepartment" WHERE "companyId"=${st.companyId} AND "active"=true ORDER BY "vatRate","description"`,
  ]);
  res.json({categories,vats:vats.map(v=>({...v,vatRate:Number(v.vatRate)}))});
 }catch(e){next(e)}
});
router.post('/stocktakes/:stocktakeId/products',async(req,res,next)=>{
 try{
  const st=await access(req);
  const body=z.object({barcode:z.string().trim().min(3).max(80),name:z.string().trim().min(2).max(250),categoryId:z.string().min(1),vatDepartmentId:z.string().min(1),salePrice:z.coerce.number().min(0),costPrice:z.coerce.number().min(0).default(0),unit:z.enum(['PIECE','KG','LITER','PACKAGE']).default('PIECE')}).strict().parse(req.body||{});
  const result=await prisma.$transaction(async tx=>{
   await lockDraftInventoryStocktake(tx,st);
   // Same SKU lock as general product entry; all writes remain in this draft's store.
   await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${st.companyId+':product-sku'}))`;
   const category=await tx.$queryRaw`SELECT "id" FROM "ProductCategory" WHERE "id"=${body.categoryId} AND "companyId"=${st.companyId} AND "active"=true LIMIT 1`;
   if(!category.length)throw failure('Η κατηγορία δεν είναι έγκυρη.',400);
   const vats=await tx.$queryRaw`SELECT "id","vatRate" FROM "ManagementVatDepartment" WHERE "id"=${body.vatDepartmentId} AND "companyId"=${st.companyId} AND "active"=true LIMIT 1`;
   if(!vats.length)throw failure('Το τμήμα ΦΠΑ δεν είναι έγκυρο.',400);
   const existing=await tx.$queryRaw`SELECT "productId" FROM "ProductBarcode" WHERE "barcode"=${body.barcode} LIMIT 1`;
   if(existing.length)throw failure('Το barcode υπάρχει ήδη. Χρησιμοποίησε σύνδεση με υπάρχον είδος.');
   const next=await tx.$queryRaw`SELECT COALESCE(MAX(CASE WHEN "sku" ~ '^[0-9]+$' THEN "sku"::bigint END),10000)+1 AS next FROM "Product" WHERE "companyId"=${st.companyId}`;
   const productId=crypto.randomUUID(),lineId=crypto.randomUUID(),sku=String(next[0]?.next||10001);
   await tx.$executeRaw`INSERT INTO "Product" ("id","companyId","categoryId","vatDepartmentId","sku","name","unit","vatRate","vatVerified","salePrice","costPrice","trackStock","active") VALUES (${productId},${st.companyId},${body.categoryId},${body.vatDepartmentId},${sku},${body.name},${body.unit},${Number(vats[0].vatRate)},true,${body.salePrice},${body.costPrice},true,true)`;
   await tx.$executeRaw`INSERT INTO "ProductBarcode" ("id","productId","barcode","unitMultiplier") VALUES (${crypto.randomUUID()},${productId},${body.barcode},1)`;
   await tx.$executeRaw`INSERT INTO "StoreProduct" ("id","storeId","productId","salePrice","currentStock","active") VALUES (${crypto.randomUUID()},${st.storeId},${productId},${body.salePrice},0,true)`;
   await tx.$executeRaw`INSERT INTO "StocktakeLine" ("id","stocktakeId","productId","expectedQuantity","unitCost","zoneId") VALUES (${lineId},${st.id},${productId},0,${body.costPrice},${req.user.tokenType==='INVENTORY_COUNTER'?req.user.zoneId||null:null})`;
   const auditId=crypto.randomUUID();
   await tx.$executeRaw`INSERT INTO "InventoryCountEvent" ("id","companyId","storeId","stocktakeId","lineId","zoneId","eventType","previousQuantity","countedQuantity","expectedQuantity","actorId","actorName","source","clientEventId") VALUES (${auditId},${st.companyId},${st.storeId},${st.id},${lineId},${req.user.tokenType==='INVENTORY_COUNTER'?req.user.zoneId||null:null},'PRODUCT_CREATE',NULL,0,0,${req.user.id||req.user.grantId||null},${req.user.fullName||'Καταμετρητής'},${req.user.tokenType==='INVENTORY_COUNTER'?'QR_PIN':'BACKOFFICE'},${auditId})`;
   return {id:productId,sku,lineId,stocktakeId:st.id,auditId};
  });
  res.status(201).json(result);
 }catch(e){if(e?.code==='P2010'&&e?.meta?.code==='23505')return res.status(409).json({error:'Το barcode ή ο κωδικός υπάρχει ήδη. Ανανέωσε την απογραφή πριν συνεχίσεις.'});next(e)}
});
export default router;
