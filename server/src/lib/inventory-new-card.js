import crypto from 'node:crypto';
import {requireStaffGrant} from '../services/backoffice-staff-access.js';
import {z} from 'zod';
import {resolveProductCardVat} from './product-card-vat.js';

const nullableNumber=z.coerce.number().min(0).nullable().optional();
export const newInventoryCardSchema=z.object({
 requestId:z.string().uuid(),storeId:z.string().min(1),name:z.string().trim().min(2).max(250),sku:z.string().trim().max(80).default(''),description:z.string().trim().max(1000).default(''),
 categoryId:z.string().min(1).nullable().optional(),subcategoryId:z.string().min(1).nullable().optional(),productCompanyId:z.string().min(1).nullable().optional(),
 unit:z.enum(['PIECE','KG','LITER','PACKAGE']),costPrice:z.coerce.number().min(0),salePrice:z.coerce.number().min(0),vatRate:z.coerce.number().min(0).max(100),vatVerified:z.boolean(),vatDepartmentId:z.string().min(1),
 staffPrice:nullableNumber,deliveryPrice:nullableNumber,minOrderQuantity:nullableNumber,capacity:nullableNumber,openingStock:z.coerce.number().min(0).max(100000000).default(0),
 active:z.boolean(),trackStock:z.boolean(),allowDiscount:z.boolean(),allowPosPriceChange:z.boolean(),freeSalePrice:z.boolean(),negativeStockWarning:z.boolean(),isSet:z.boolean(),isRecipe:z.boolean(),
 discountA:z.coerce.number().min(0).max(100),discountB:z.coerce.number().min(0).max(100),discountC:z.coerce.number().min(0).max(100),
 barcodes:z.array(z.object({barcode:z.string().trim().min(3).max(80),unitMultiplier:z.coerce.number().positive().max(100000),salePrice:nullableNumber,name:z.string().trim().max(120).nullable().optional()})).max(30),
 supplierCodes:z.array(z.object({supplierId:z.string().min(1),supplierCode:z.string().trim().max(120).default('')})).max(100)
});
const fail=(message,status=400)=>{throw Object.assign(new Error(message),{status})};
export async function createInventoryCard(db,user,input,context={}){
 const body=newInventoryCardSchema.parse(input),company=user?.companyId;
 if(!company)fail('Δεν υπάρχει ενεργή εταιρεία.',403);
 if(user.storeId&&user.storeId!==body.storeId)fail('Μη έγκυρο κατάστημα.',403);
 if(new Set(body.barcodes.map(x=>x.barcode)).size!==body.barcodes.length)fail('Το ίδιο barcode έχει καταχωριστεί περισσότερες από μία φορές.');
 if(new Set(body.supplierCodes.map(x=>x.supplierId)).size!==body.supplierCodes.length)fail('Ο ίδιος προμηθευτής έχει επιλεγεί περισσότερες από μία φορές.');
 const fingerprint=crypto.createHash('sha256').update(JSON.stringify(body)).digest('hex');
 return db.$transaction(async tx=>{
  if(user.staffAccess===true){
   await requireStaffGrant(tx,user,body.storeId,'products.create');
   if(body.openingStock!==0)await requireStaffGrant(tx,user,body.storeId,'products.opening-stock');
  }
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${company+':product-sku'}))`;
  const store=await tx.store.findFirst({where:{id:body.storeId,companyId:company,active:true},select:{id:true}});
  if(!store)fail('Μη έγκυρο κατάστημα.');
  const replay=await tx.$queryRaw`SELECT "details" FROM "StoreOperatorAudit" WHERE "companyId"=${company} AND "storeId"=${body.storeId} AND "eventType"='PRODUCT_CREATED' AND "details"->>'requestId'=${body.requestId} LIMIT 1`;
  if(replay[0]){if(replay[0].details?.fingerprint!==fingerprint)fail('Η ίδια καταχώρηση έχει ήδη διαφορετικά στοιχεία.',409);return {id:replay[0].details.productId,sku:replay[0].details.sku,idempotent:true};}
  const vat=await resolveProductCardVat(tx,company,body.vatDepartmentId,body.vatRate);
  if(body.categoryId&&!((await tx.$queryRaw`SELECT "id" FROM "ProductCategory" WHERE "id"=${body.categoryId} AND "companyId"=${company} AND "active"=true`)[0]))fail('Η κατηγορία δεν είναι έγκυρη.');
  if(body.subcategoryId&&!((await tx.$queryRaw`SELECT "id" FROM "ProductSubcategory" WHERE "id"=${body.subcategoryId} AND "categoryId"=${body.categoryId||''} AND "companyId"=${company} AND "active"=true`)[0]))fail('Η υποκατηγορία δεν ανήκει στην επιλεγμένη κατηγορία.');
  if(body.productCompanyId&&!((await tx.$queryRaw`SELECT "id" FROM "ManagementProductCompany" WHERE "id"=${body.productCompanyId} AND "companyId"=${company} AND "active"=true`)[0]))fail('Η εταιρεία προϊόντος δεν είναι έγκυρη.');
  const supplierIds=body.supplierCodes.map(x=>x.supplierId);
  if(supplierIds.length&&(await tx.$queryRaw`SELECT "id" FROM "Supplier" WHERE "companyId"=${company} AND "active"=true AND "id"=ANY(${supplierIds}::text[])`).length!==supplierIds.length)fail('Υπάρχει μη έγκυρος προμηθευτής.');
  const barcodeValues=body.barcodes.map(x=>x.barcode);
  if(barcodeValues.length&&(await tx.$queryRaw`SELECT pb."id" FROM "ProductBarcode" pb JOIN "Product" p ON p."id"=pb."productId" WHERE p."companyId"=${company} AND pb."barcode"=ANY(${barcodeValues}::text[]) LIMIT 1`)[0])fail('Το barcode χρησιμοποιείται ήδη σε άλλο προϊόν.',409);
  const rows=await tx.$queryRaw`SELECT COALESCE(MAX(CASE WHEN "sku" ~ '^[0-9]+$' THEN "sku"::bigint END),10000)+1 AS next FROM "Product" WHERE "companyId"=${company}`;
  const sku=body.sku||String(rows[0]?.next||10001);
  if((await tx.$queryRaw`SELECT "id" FROM "Product" WHERE "companyId"=${company} AND "sku"=${sku} LIMIT 1`)[0])fail('Ο κωδικός/SKU χρησιμοποιείται ήδη.',409);
  const id=crypto.randomUUID();
  await tx.$executeRaw`INSERT INTO "Product" ("id","companyId","categoryId","subcategoryId","productCompanyId","sku","name","description","unit","vatRate","vatVerified","salePrice","costPrice","trackStock","active","staffPrice","deliveryPrice","minOrderQuantity","capacity","allowDiscount","allowPosPriceChange","freeSalePrice","negativeStockWarning","isSet","isRecipe","discountA","discountB","discountC","vatDepartmentId") VALUES (${id},${company},${body.categoryId||null},${body.subcategoryId||null},${body.productCompanyId||null},${sku},${body.name},${body.description||null},${body.unit},${body.vatRate},${body.vatVerified},${body.salePrice},${body.costPrice},${body.trackStock},${body.active},${body.staffPrice??null},${body.deliveryPrice??null},${body.minOrderQuantity??null},${body.capacity??null},${body.allowDiscount},${body.allowPosPriceChange},${body.freeSalePrice},${body.negativeStockWarning},${body.isSet},${body.isRecipe},${body.discountA},${body.discountB},${body.discountC},${vat.id})`;
  for(const row of body.barcodes)await tx.$executeRaw`INSERT INTO "ProductBarcode" ("id","productId","barcode","unitMultiplier","salePrice","name") VALUES (${crypto.randomUUID()},${id},${row.barcode},${row.unitMultiplier},${row.salePrice??null},${row.name||null})`;
  for(const row of body.supplierCodes)await tx.$executeRaw`INSERT INTO "SupplierProductLink" ("id","companyId","supplierId","productId","supplierCode","active","source","updatedBy","updatedByName") VALUES (${crypto.randomUUID()},${company},${row.supplierId},${id},${row.supplierCode||null},true,'PRODUCT_CARD',${user.id},${context.origin==='POS'?context.actorName||user.fullName||'POS':user.fullName||'BackOffice'})`;
  await tx.$executeRaw`INSERT INTO "StoreProduct" ("id","storeId","productId","salePrice","currentStock","active") VALUES (${crypto.randomUUID()},${body.storeId},${id},${body.salePrice},${body.openingStock},${body.active})`;
  // A STORE_OPERATOR is a credential identity, never a User foreign key,
  // including when its text identifier happens to collide with a User id.
  if(body.openingStock!==0)await tx.$executeRaw`INSERT INTO "StockMovement" ("id","storeId","productId","movementType","quantity","unitCost","sourceType","sourceId","note","createdByUserId") VALUES (${crypto.randomUUID()},${body.storeId},${id},'MANUAL_ADJUSTMENT',${body.openingStock},${body.costPrice},'PRODUCT_CARD',${id},'Αρχικό απόθεμα νέου είδους',${user.tokenType==='STORE_OPERATOR'?null:user.id})`;
  await tx.$executeRaw`INSERT INTO "StoreOperatorAudit" ("id","companyId","storeId","operatorId","actorId","eventType","details") VALUES (${crypto.randomUUID()},${company},${body.storeId},${user.operatorId||user.id},${user.id},'PRODUCT_CREATED',${JSON.stringify({requestId:body.requestId,fingerprint,productId:id,productName:body.name,sku,vatDepartmentId:vat.id,vatRate:vat.vatRate,openingStock:body.openingStock,terminalPos:context.origin==='POS'?context.terminalPos||'POS':'BACKOFFICE',...(context.origin==='POS'?{origin:'POS',actorKind:user.tokenType==='STORE_OPERATOR'?'STORE_OPERATOR':'USER',employeeId:context.employeeId||null,actorName:context.actorName||user.fullName||null}:{})})}::jsonb)`;
  return {id,sku,idempotent:false};
 });
}
