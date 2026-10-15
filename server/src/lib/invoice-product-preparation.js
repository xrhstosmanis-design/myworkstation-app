import crypto from 'node:crypto';
import {z} from 'zod';
import {catalogPatterns,rankCatalogMatches,plain} from '../../../shared/invoice-catalog-match.mjs';
import {productCardVatOptions,resolveProductCardVat} from './product-card-vat.js';
import {createInventoryCard} from './inventory-new-card.js';
const fail=(message,status=400)=>{throw Object.assign(new Error(message),{status})};
const digest=value=>crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
export const preparationVersion=row=>digest(row);
const schema=z.object({requestId:z.string().uuid(),storeId:z.string().min(1),version:z.string().length(64),reviewed:z.literal(true),mode:z.enum(['EXISTING','NEW']),productId:z.string().optional(),name:z.string().trim().min(2).max(250),barcode:z.string().trim().regex(/^(?:\d{6,18})?$/).default(''),categoryId:z.string().nullable().optional(),subcategoryId:z.string().nullable().optional(),vatDepartmentId:z.string().min(1),salePrice:z.coerce.number().min(0),allowPosPriceChange:z.boolean(),unit:z.enum(['PIECE','KG','LITER','PACKAGE'])}).strict();
async function lineScope(db,user,orderId,lineId,storeId,lock=false){
 if(!user?.companyId||!storeId||user.storeId&&user.storeId!==storeId)fail('Επίλεξε το σωστό κατάστημα.',403);
 const orders=lock?await db.$queryRaw`SELECT o.* FROM "PurchaseOrder" o JOIN "Store" s ON s."id"=o."storeId" AND s."companyId"=o."companyId" AND s."active"=true WHERE o."id"=${orderId} AND o."companyId"=${user.companyId} AND o."storeId"=${storeId} FOR UPDATE OF o`:await db.$queryRaw`SELECT o.* FROM "PurchaseOrder" o JOIN "Store" s ON s."id"=o."storeId" AND s."companyId"=o."companyId" AND s."active"=true WHERE o."id"=${orderId} AND o."companyId"=${user.companyId} AND o."storeId"=${storeId}`;
 const order=orders[0];if(!order)fail('Δεν βρέθηκε το πρόχειρο στο επιλεγμένο κατάστημα.',404);
 const lines=lock?await db.$queryRaw`SELECT * FROM "PurchaseOrderLine" WHERE "id"=${lineId} AND "orderId"=${orderId} FOR UPDATE`:await db.$queryRaw`SELECT * FROM "PurchaseOrderLine" WHERE "id"=${lineId} AND "orderId"=${orderId}`;
 if(!lines[0])fail('Δεν βρέθηκε η γραμμή.',404);
 return {order,line:lines[0],version:preparationVersion({order,line:lines[0]})};
}
function editable(order,line){if(order.status!=='NEW'||order.sourceType!=='POS_OCR_DRAFT'||line.productId)fail('Η γραμμή δεν είναι πλέον διαθέσιμη. Ανανέωσε το πρόχειρο.',409)}
async function exactIdentities(db,companyId,supplierId,line,barcode,name){
 return db.$queryRaw`SELECT DISTINCT p."id",p."name",p."active" FROM "Product" p WHERE p."companyId"=${companyId} AND ((${barcode}<>'' AND EXISTS(SELECT 1 FROM "ProductBarcode" b WHERE b."productId"=p."id" AND b."barcode"=${barcode})) OR (${String(line.supplierCode||'').trim()}<>'' AND EXISTS(SELECT 1 FROM "SupplierProductMapping" m WHERE m."companyId"=${companyId} AND m."supplierId"=${supplierId||''} AND m."productId"=p."id" AND UPPER(TRIM(m."supplierItemCode"))=UPPER(${String(line.supplierCode||'').trim()}))) OR (${String(line.supplierCode||'').trim()}<>'' AND EXISTS(SELECT 1 FROM "SupplierProductLink" sl WHERE sl."companyId"=${companyId} AND sl."supplierId"=${supplierId||''} AND sl."productId"=p."id" AND sl."active"=true AND UPPER(TRIM(sl."supplierCode"))=UPPER(${String(line.supplierCode||'').trim()}))) OR translate(upper(p."name"),'ΆΈΉΊΌΎΏΪΫ','ΑΕΗΙΟΥΩΙΥ')=${plain(name).trim()}) LIMIT 20`;
}
const pack=value=>[...plain(value).matchAll(/(\d+(?:[.,]\d+)?)\s*(KG|GR|G|ML|LT|L)\b/g)].map(x=>`${Number(x[1].replace(',','.'))*(['KG','LT','L'].includes(x[2])?1000:1)}${['ML','LT','L'].includes(x[2])?'ML':'G'}`).sort().join('|');
export async function previewInvoiceProduct(db,user,orderId,lineId,storeId){
 const scoped=await lineScope(db,user,orderId,lineId,storeId);editable(scoped.order,scoped.line);
 const {order,line,version}=scoped,companyId=user.companyId,patterns=catalogPatterns(line.description);
 const [categories,subcategories,vatDepartments,identities,candidates]=await Promise.all([
 db.$queryRaw`SELECT "id","name" FROM "ProductCategory" WHERE "companyId"=${companyId} AND "active"=true ORDER BY "name"`,
 db.$queryRaw`SELECT "id","categoryId","name" FROM "ProductSubcategory" WHERE "companyId"=${companyId} AND "active"=true ORDER BY "name"`,
 productCardVatOptions(db,companyId),exactIdentities(db,companyId,order.supplierId,line,String(line.detectedBarcode||''),line.description),
 db.$queryRaw`SELECT p."id",p."name",p."sku",p."unit",p."categoryId",p."subcategoryId",p."vatDepartmentId",p."vatRate",COALESCE(sp."salePrice",p."salePrice") AS "salePrice" FROM "Product" p JOIN "StoreProduct" sp ON sp."productId"=p."id" AND sp."storeId"=${storeId} AND sp."active"=true WHERE p."companyId"=${companyId} AND p."active"=true AND (translate(upper(p."name"),'ΆΈΉΊΌΎΏΪΫ','ΑΕΗΙΟΥΩΙΥ') ILIKE ANY(${patterns}::text[]) OR EXISTS(SELECT 1 FROM "SupplierProductMapping" m WHERE m."companyId"=${companyId} AND m."supplierId"=${order.supplierId||''} AND m."supplierItemCode"=${line.supplierCode||''} AND m."productId"=p."id") OR EXISTS(SELECT 1 FROM "ProductBarcode" b WHERE b."productId"=p."id" AND b."barcode"=${line.detectedBarcode||''})) ORDER BY p."name",p."id" LIMIT 1001`
 ]);
 const ranked=rankCatalogMatches(candidates.slice(0,1000),line.description).slice(0,12);
 // A same-size, strong name suggestion is evidence for price/category only, never identity.
 const evidence=pack(line.description)?ranked.filter(x=>pack(x.name)===pack(line.description)&&x.matchScore>=25&&Number(x.salePrice)>0&&Number(x.vatRate)===Number(line.vatRate)):[];
 const reference=evidence.length&&new Set(evidence.map(x=>String(x.salePrice))).size===1?evidence[0]:null;
 const deps=vatDepartments.filter(x=>Number(x.vatRate)===Number(line.vatRate));
 const factor=Number(line.stockUnitsPerInvoiceUnit),quantity=Number(line.quantity);
 const cost=quantity>0&&factor>=1&&(line.invoiceUnit==='PIECE'||line.invoiceUnit==='PACKAGE')?(Number(line.netAmount)+Number(line.exciseTotal||0))/(quantity*factor):null;
 return {storeId,orderId,lineId,version,line,categories,subcategories,vatDepartments,candidates:ranked,identities,truncated:candidates.length>1000,reference:reference?{id:reference.id,name:reference.name,salePrice:Number(reference.salePrice)}:null,proposal:{name:line.description,barcode:/^\d{6,18}$/.test(line.detectedBarcode||'')?line.detectedBarcode:'',categoryId:reference?.categoryId||null,subcategoryId:reference?.subcategoryId||null,vatDepartmentId:deps.length===1?deps[0].id:'',salePrice:reference?Number(reference.salePrice):null,unit:'PIECE',costPrice:cost,allowPosPriceChange:true},notice:'ΠΡΟΣ ΕΛΕΓΧΟ: σύγκρινε ονομασία, γεύση, μέγεθος και μονάδα με το πρωτότυπο. Οι προτάσεις δεν αποθηκεύουν είδος ή απόθεμα.'};
}
export async function confirmInvoiceProduct(db,user,orderId,lineId,input,learnSupplierMapping){
 const body=schema.parse(input),companyId=user?.companyId;
 return db.$transaction(async tx=>{
  const {order,line,version}=await lineScope(tx,user,orderId,lineId,body.storeId,true);
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${companyId+':product-sku'}))`;
  const fingerprint=digest({orderId,lineId,body});
  const previous=await tx.$queryRaw`SELECT "details" FROM "StoreOperatorAudit" WHERE "companyId"=${companyId} AND "storeId"=${body.storeId} AND "eventType"='INVOICE_PRODUCT_PREPARED' AND "details"->>'requestId'=${body.requestId} LIMIT 1`;
  if(previous[0]){if(previous[0].details.fingerprint!==fingerprint)fail('Η ίδια αίτηση έχει διαφορετικά στοιχεία.',409);return {...previous[0].details.result,idempotent:true}}
  editable(order,line);
  if(order.supplierId&&!(await tx.$queryRaw`SELECT "id" FROM "Supplier" WHERE "id"=${order.supplierId} AND "companyId"=${companyId} AND "active"=true FOR SHARE`)[0])fail('Ο προμηθευτής δεν είναι ενεργός στην εταιρεία.');
  if(version!==body.version)fail('Η γραμμή άλλαξε. Ανανέωσε τις προτάσεις πριν συνεχίσεις.',409);
  const factor=Number(line.stockUnitsPerInvoiceUnit),quantity=Number(line.quantity);
  if(!['PIECE','PACKAGE'].includes(line.invoiceUnit)||!Number.isInteger(factor)||factor<1||quantity<=0||!Number.isFinite(Number(line.netAmount)))fail('Έλεγξε πρώτα τη μονάδα, τα τεμάχια συσκευασίας και τις αξίες στο πρόχειρο.');
  await resolveProductCardVat(tx,companyId,body.vatDepartmentId,line.vatRate);
  const identities=await exactIdentities(tx,companyId,order.supplierId,line,body.barcode,body.name);
  let productId=body.productId,sku;
  if(body.mode==='NEW'){
   if(body.salePrice<=0)fail('Συμπλήρωσε θετική λιανική για το νέο είδος.');
   if(identities.length)fail('Υπάρχει ήδη αντιστοίχιση barcode, κωδικού προμηθευτή ή ίδιας ονομασίας. Επίλεξε το υπάρχον είδος ή έλεγξε την καρτέλα στην αποθήκη.',409);
   if(!body.categoryId)fail('Επίλεξε κατηγορία.');
   const created=await createInventoryCard({$transaction:fn=>fn(tx)},user,{requestId:body.requestId,storeId:body.storeId,name:body.name,categoryId:body.categoryId,subcategoryId:body.subcategoryId,unit:body.unit,costPrice:(Number(line.netAmount)+Number(line.exciseTotal||0))/(quantity*factor),salePrice:body.salePrice,vatRate:Number(line.vatRate),vatDepartmentId:body.vatDepartmentId,vatVerified:true,openingStock:0,active:true,trackStock:true,allowDiscount:true,allowPosPriceChange:body.allowPosPriceChange,freeSalePrice:false,negativeStockWarning:false,isSet:false,isRecipe:false,discountA:0,discountB:0,discountC:0,barcodes:body.barcode?[{barcode:body.barcode,unitMultiplier:1}]:[],supplierCodes:[]});
   productId=created.id;sku=created.sku;
  }else{
   if(!productId)fail('Επίλεξε υπάρχον είδος.');
   const products=await tx.$queryRaw`SELECT p."id",p."sku",p."vatRate",p."vatDepartmentId" FROM "Product" p JOIN "StoreProduct" sp ON sp."productId"=p."id" AND sp."storeId"=${body.storeId} AND sp."active"=true WHERE p."id"=${productId} AND p."companyId"=${companyId} AND p."active"=true FOR SHARE OF p,sp`;
   const product=products[0];if(!product)fail('Το είδος δεν είναι ενεργό στο επιλεγμένο κατάστημα.',404);
   if(Number(product.vatRate)!==Number(line.vatRate)||product.vatDepartmentId!==body.vatDepartmentId)fail('Ο ΦΠΑ ή το τμήμα ΦΠΑ της καρτέλας διαφέρει. Διόρθωσε πρώτα την καρτέλα είδους.');
   // Explicit candidate selection may override a name suggestion, never a real barcode or supplier identity.
   const conflicts=await exactIdentities(tx,companyId,order.supplierId,line,body.barcode,'');
   if(conflicts.some(x=>x.id!==productId))fail('Το barcode ή ο κωδικός προμηθευτή ανήκει σε διαφορετικό είδος.',409);
   sku=product.sku;
   if(body.barcode){const found=await tx.$queryRaw`SELECT "id" FROM "ProductBarcode" WHERE "productId"=${productId} AND "barcode"=${body.barcode}`;if(!found[0])await tx.$executeRaw`INSERT INTO "ProductBarcode" ("id","productId","barcode","unitMultiplier") VALUES (${crypto.randomUUID()},${productId},${body.barcode},1)`;}
  }
  await tx.$executeRaw`UPDATE "PurchaseOrderLine" SET "productId"=${productId},"resolutionStatus"='MATCHED',"updatedAt"=NOW() WHERE "id"=${lineId} AND "orderId"=${orderId}`;
  await learnSupplierMapping(tx,{companyId,supplierId:order.supplierId,supplierCode:line.supplierCode,productId,barcode:body.barcode,description:line.description,userId:user.id,unitCost:(Number(line.netAmount)+Number(line.exciseTotal||0))/(quantity*factor),unitsPerPackage:factor,discount1:line.discount1,discount2:line.discount2,discount3:line.discount3,excisePerInvoiceUnit:Number(line.exciseTotal||0)/quantity});
  const result={productId,sku,orderId,lineId,stockUpdated:false,invoiceEconomicsChanged:false,idempotent:false};
  await tx.$executeRaw`INSERT INTO "StoreOperatorAudit" ("id","companyId","storeId","operatorId","actorId","eventType","details") VALUES (${crypto.randomUUID()},${companyId},${body.storeId},${user.operatorId||user.id},${user.id},'INVOICE_PRODUCT_PREPARED',${JSON.stringify({requestId:body.requestId,fingerprint,result,mode:body.mode,version,reviewed:true})}::jsonb)`;
  return result;
 },{timeout:15000});
}
export function registerInvoiceProductPreparation(router,db,learnSupplierMapping){
 router.get('/:orderId/ocr-lines/:lineId/product-proposal',async(req,res,next)=>{try{res.json(await previewInvoiceProduct(db,req.user,req.params.orderId,req.params.lineId,String(req.query.storeId||'')))}catch(e){next(e)}});
 router.post('/:orderId/ocr-lines/:lineId/confirm-product',async(req,res,next)=>{try{res.json(await confirmInvoiceProduct(db,req.user,req.params.orderId,req.params.lineId,req.body,learnSupplierMapping))}catch(e){next(e)}});
}
