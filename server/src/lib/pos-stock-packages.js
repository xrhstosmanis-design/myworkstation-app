import crypto from 'node:crypto';
import {z} from 'zod';
import {packageStockLine} from '../../../shared/pos-package-return.mjs';
export const packageSchema=z.object({baseProductId:z.string().min(1),unitsPerPackage:z.number().int().min(2).max(100000)}).strict();
export const packageStatements=[
 `CREATE TABLE IF NOT EXISTS "StoreStockPackage" ("companyId" TEXT NOT NULL,"storeId" TEXT NOT NULL,"productId" TEXT NOT NULL,"baseProductId" TEXT NOT NULL,"unitsPerPackage" INTEGER NOT NULL CHECK("unitsPerPackage">1),"updatedBy" TEXT NOT NULL,"updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),PRIMARY KEY("storeId","productId"),CHECK("productId"<>"baseProductId"))`,
 `CREATE TABLE IF NOT EXISTS "PosPackageStockPosting" ("id" TEXT PRIMARY KEY,"companyId" TEXT NOT NULL,"storeId" TEXT NOT NULL,"saleId" TEXT NOT NULL,"lineId" TEXT NOT NULL,"productId" TEXT NOT NULL,"baseProductId" TEXT NOT NULL,"unitsPerPackage" INTEGER NOT NULL,"quantity" NUMERIC(14,4) NOT NULL,"createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),UNIQUE("storeId","lineId"))`,
 `CREATE OR REPLACE FUNCTION "mws_guard_package_stock"() RETURNS trigger AS $$ BEGIN
   IF EXISTS(SELECT 1 FROM "StoreStockPackage" x WHERE x."storeId"=NEW."storeId" AND x."productId"=NEW."productId") THEN
     IF (TG_OP='INSERT' AND COALESCE(NEW."currentStock",0)<>0) OR (TG_OP='UPDATE' AND COALESCE(NEW."currentStock",0)<>COALESCE(OLD."currentStock",0)) THEN
       RAISE EXCEPTION 'Το απόθεμα συσκευασίας τηρείται στο βασικό είδος. Καταχώρησε τα τεμάχια στο βασικό είδος.' USING ERRCODE='23514';
     END IF;
   END IF; RETURN NEW; END $$ LANGUAGE plpgsql`,
 `DROP TRIGGER IF EXISTS "mws_guard_package_stock_change" ON "StoreProduct"`,
 `CREATE TRIGGER "mws_guard_package_stock_change" BEFORE INSERT OR UPDATE OF "currentStock" ON "StoreProduct" FOR EACH ROW EXECUTE FUNCTION "mws_guard_package_stock"()`
];
export const packageError=(message,status=409)=>Object.assign(new Error(message),{status});
export async function packageLock(db,storeId){await db.$queryRaw`SELECT (pg_advisory_xact_lock(hashtext(${`stock-package:${storeId}`})) IS NULL) AS locked`;}
export async function readStockPackage(db,{companyId,storeId,productId}){
 // Compatibility with isolated fixtures and pre-bootstrap databases.
 const exists=await db.$queryRaw`SELECT to_regclass('"StoreStockPackage"')::text AS name`;
 if(!exists[0]?.name)return null;
 return (await db.$queryRaw`SELECT * FROM "StoreStockPackage" WHERE "companyId"=${companyId} AND "storeId"=${storeId} AND "productId"=${productId}`)[0]||null;
}
export async function saveStockPackage(db,scope,input){
 const body=packageSchema.parse(input),{companyId,storeId,productId,user}=scope;
 if(!companyId||!storeId||!productId||!user?.id||user.companyId!==companyId||user.staffAccess||!(['OWNER','SUPER_ADMIN'].includes(user.role)||user.isSuperAdmin||user.platformRole==='SUPER_ADMIN'))throw packageError('Δεν έχεις δικαίωμα ρύθμισης συσκευασίας.',403);
 if(productId===body.baseProductId)throw packageError('Επίλεξε διαφορετικό βασικό είδος.',400);
 return db.$transaction(async tx=>{
  await packageLock(tx,storeId);
  const rows=await tx.$queryRaw`SELECT p."id",p."name",p."unit",p."isSet",p."isRecipe",p."trackStock" FROM "Product" p JOIN "StoreProduct" sp ON sp."productId"=p."id" AND sp."storeId"=${storeId} AND sp."active"=TRUE JOIN "Store" s ON s."id"=sp."storeId" AND s."companyId"=p."companyId" AND s."active"=TRUE WHERE p."companyId"=${companyId} AND p."active"=TRUE AND p."id" IN (${productId},${body.baseProductId}) FOR UPDATE OF sp`;
  if(rows.length!==2)throw packageError('Τα δύο είδη πρέπει να είναι ενεργά στο επιλεγμένο κατάστημα.');
  const parent=rows.find(r=>r.id===productId),base=rows.find(r=>r.id===body.baseProductId);
  if(parent.isSet||parent.isRecipe||base.isSet||base.isRecipe||!base.trackStock||!['PIECE','PCS'].includes(base.unit)||!['PIECE','PCS','PACKAGE'].includes(parent.unit))throw packageError('Χρειάζεται βασικό είδος σε τεμάχια με απόθεμα και απλή συσκευασία χωρίς SET ή συνταγή.');
  const nesting=await tx.$queryRaw`SELECT "productId" FROM "StoreStockPackage" WHERE "companyId"=${companyId} AND "storeId"=${storeId} AND ("productId"=${body.baseProductId} OR "baseProductId"=${productId}) LIMIT 1`;
  if(nesting.length)throw packageError('Δεν επιτρέπεται συσκευασία μέσα σε άλλη συσκευασία.');
  const baked=await tx.$queryRaw`SELECT "productId" FROM "StoreBakingPolicy" WHERE "companyId"=${companyId} AND "storeId"=${storeId} AND "productId" IN (${productId},${body.baseProductId}) LIMIT 1`;
  if(baked.length)throw packageError('Τα είδη αυτά έχουν κανόνα ψημένων και δεν μπορούν να συνδεθούν ως συσκευασία.');
  const previous=await readStockPackage(tx,scope);
  if(!previous){const sold=await tx.$queryRaw`SELECT l."id" FROM "SaleLine" l JOIN "Sale" s ON s."id"=l."saleId" WHERE l."productId"=${productId} AND s."companyId"=${companyId} AND s."storeId"=${storeId} LIMIT 1`;if(sold.length)throw packageError('Δημιούργησε νέο είδος συσκευασίας. Το επιλεγμένο είδος έχει ήδη ιστορικό πωλήσεων.');}
  if(previous&&(previous.baseProductId!==body.baseProductId||Number(previous.unitsPerPackage)!==body.unitsPerPackage))throw packageError('Η σύνθεση αποθηκευμένης συσκευασίας παραμένει σταθερή. Δημιούργησε νέο είδος για διαφορετική συσκευασία.');
  // Avoid converting existing stock into an unrelated base quantity.
  const stock=await tx.$queryRaw`SELECT "currentStock" FROM "StoreProduct" WHERE "storeId"=${storeId} AND "productId"=${productId}`;
  if(Number(stock[0]?.currentStock||0)!==0)throw packageError('Το είδος συσκευασίας πρέπει να έχει μηδενικό ανεξάρτητο στοκ. Το απόθεμα διατηρείται στο βασικό είδος.');
  await tx.$executeRaw`INSERT INTO "StoreStockPackage"("companyId","storeId","productId","baseProductId","unitsPerPackage","updatedBy") VALUES(${companyId},${storeId},${productId},${body.baseProductId},${body.unitsPerPackage},${user.id}) ON CONFLICT("storeId","productId") DO NOTHING`;
  if(!previous)await tx.$executeRaw`INSERT INTO "StoreOperatorAudit"("id","companyId","storeId","operatorId","actorId","eventType","details") VALUES(${crypto.randomUUID()},${companyId},${storeId},${user.id},${user.id},'STOCK_PACKAGE_CONFIGURED',${JSON.stringify({productId,...body,actorName:user.fullName||user.email||'Ιδιοκτήτης'})}::jsonb)`;
  return {ok:true,...body};
 });
}
export async function changePackageStock(tx,scope){
 const {companyId,storeId,productId,quantity,saleId,lineId,restore=false,originalLineId=null}=scope;
 const exists=await tx.$queryRaw`SELECT to_regclass('"StoreStockPackage"')::text AS name`;
 if(!exists[0]?.name)return null;
 await packageLock(tx,storeId);
 const config=originalLineId
  ? (await tx.$queryRaw`SELECT * FROM "PosPackageStockPosting" WHERE "companyId"=${companyId} AND "storeId"=${storeId} AND "lineId"=${originalLineId} AND "quantity"<0`)[0]
  : await readStockPackage(tx,scope);
 if(!config)return null;
 const plan=packageStockLine({productId,baseProductId:config.baseProductId,unitsPerPackage:Number(config.unitsPerPackage),quantity:Math.abs(Number(quantity)),storePrice:0});
 if(!saleId||!lineId)throw packageError('Λείπει η ταυτότητα κίνησης συσκευασίας.');
 const delta=(restore?1:-1)*plan.stockQuantity;
 const old=await tx.$queryRaw`SELECT "quantity","saleId" FROM "PosPackageStockPosting" WHERE "companyId"=${companyId} AND "storeId"=${storeId} AND "lineId"=${lineId}`;
 if(old.length){if(Number(old[0].quantity)!==delta||old[0].saleId!==saleId)throw packageError('Η κίνηση συσκευασίας άλλαξε.');return {reserved:true,warning:null,replayed:true};}
 const changed=await tx.$queryRaw`UPDATE "StoreProduct" sp SET "currentStock"=COALESCE(sp."currentStock",0)+${delta},"updatedAt"=NOW() FROM "Product" p WHERE sp."storeId"=${storeId} AND sp."productId"=${config.baseProductId} AND sp."active"=TRUE AND p."id"=sp."productId" AND p."companyId"=${companyId} AND p."active"=TRUE AND p."trackStock"=TRUE RETURNING sp."currentStock"`;
 if(!changed.length)throw packageError('Το βασικό είδος της συσκευασίας δεν είναι διαθέσιμο στην αποθήκη.');
 await tx.$executeRaw`INSERT INTO "PosPackageStockPosting"("id","companyId","storeId","saleId","lineId","productId","baseProductId","unitsPerPackage","quantity") VALUES(${crypto.randomUUID()},${companyId},${storeId},${saleId},${lineId},${productId},${config.baseProductId},${Number(config.unitsPerPackage)},${delta})`;
 await tx.$executeRaw`INSERT INTO "StockMovement"("id","storeId","productId","movementType","quantity","unitCost","sourceType","sourceId","note","createdByUserId","idempotencyKey") VALUES(${crypto.randomUUID()},${storeId},${config.baseProductId},${restore?'RETURN':'SALE'},${delta},${null},${restore?'POS_PACKAGE_RETURN':'POS_SALE'},${saleId},${`Συσκευασία ${productId} × ${Math.abs(Number(quantity))} · ${config.unitsPerPackage} τεμάχια`},${null},${`package:${lineId}`})`;
 return {reserved:true,warning:Number(changed[0].currentStock)<0?{code:'NEGATIVE_STOCK_RECORDED',productId:config.baseProductId,nextStock:Number(changed[0].currentStock)}:null,baseProductId:config.baseProductId};
}
export async function packageCatalog(db,{companyId,storeId},products){
 const exists=await db.$queryRaw`SELECT to_regclass('"StoreStockPackage"')::text AS name`;
 if(!exists[0]?.name)return products;
 const rows=await db.$queryRaw`SELECT x."productId",x."baseProductId",x."unitsPerPackage",COALESCE(sp."currentStock",0) AS "baseStock" FROM "StoreStockPackage" x LEFT JOIN "StoreProduct" sp ON sp."storeId"=x."storeId" AND sp."productId"=x."baseProductId" WHERE x."companyId"=${companyId} AND x."storeId"=${storeId}`;
 const byId=new Map(rows.map(r=>[r.productId,r]));
 return products.map(p=>{const x=byId.get(p.id);return x?{...p,currentStock:Math.floor(Number(x.baseStock)/Number(x.unitsPerPackage)),barcodeOptions:(p.barcodeOptions||[]).map(b=>({...b,salePrice:null})),stockPackage:{baseProductId:x.baseProductId,unitsPerPackage:Number(x.unitsPerPackage)}}:p});
}

export async function validatePackageSaleItems(db,{companyId,storeId},items){
 for(const item of items){
  const config=await readStockPackage(db,{companyId,storeId,productId:item.productId});if(!config)continue;
  try{packageStockLine({productId:item.productId,baseProductId:config.baseProductId,unitsPerPackage:Number(config.unitsPerPackage),quantity:Number(item.quantity),storePrice:0})}catch(e){throw packageError(e.message,400)}
  const base=await db.$queryRaw`SELECT p."id" FROM "Product" p JOIN "StoreProduct" sp ON sp."productId"=p."id" AND sp."storeId"=${storeId} AND sp."active"=TRUE WHERE p."id"=${config.baseProductId} AND p."companyId"=${companyId} AND p."active"=TRUE AND p."trackStock"=TRUE AND p."unit" IN ('PIECE','PCS')`;
  if(!base.length)throw packageError('Το βασικό είδος συσκευασίας δεν είναι διαθέσιμο.');
  const parent=await db.$queryRaw`SELECT "isSet","isRecipe" FROM "Product" WHERE "id"=${item.productId} AND "companyId"=${companyId}`;
  if(parent[0]?.isSet||parent[0]?.isRecipe)throw packageError('Το είδος συσκευασίας δεν μπορεί να έχει SET ή συνταγή.');
  const baked=await db.$queryRaw`SELECT "productId" FROM "StoreBakingPolicy" WHERE "companyId"=${companyId} AND "storeId"=${storeId} AND "productId" IN (${item.productId},${config.baseProductId}) LIMIT 1`;
  if(baked.length)throw packageError('Η συσκευασία δεν μπορεί να χρησιμοποιηθεί με κανόνα ψημένων.');
 }
}
