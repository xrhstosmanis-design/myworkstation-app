import {randomUUID} from 'node:crypto';
import {z} from 'zod';
import {invoiceProductBarcodesCapability,invoiceProductCardCapability} from '../../../shared/backoffice-staff-company.mjs';
import {requireStaffAction,requireStaffGrant,staffError} from './backoffice-staff-access.js';
import {requireStaffCompanyGrant} from './backoffice-staff-company.js';

const token=z.string().datetime();
const price=z.number().finite().min(0).max(1_000_000).refine(value=>Number(value.toFixed(4))===value);
const card=z.object({productId:z.string().min(1),expectedUpdatedAt:token,confirmed:z.literal(true),
 name:z.string().trim().min(1).max(180),salePrice:price}).strict();
const barcodeData={barcode:z.string().trim().min(3).max(80),unitMultiplier:z.number().finite().positive().max(100_000),
 salePrice:price.nullable(),name:z.string().trim().max(120).nullable()};
const barcodeScope={productId:z.string().min(1),confirmed:z.literal(true)};
const barcode=z.discriminatedUnion('action',[
 z.object({...barcodeScope,action:z.literal('ADD'),...barcodeData}).strict(),
 z.object({...barcodeScope,action:z.literal('EDIT'),id:z.string().min(1),expectedUpdatedAt:token,...barcodeData}).strict(),
 z.object({...barcodeScope,action:z.literal('DELETE'),id:z.string().min(1),expectedUpdatedAt:token}).strict()
]);

export async function staffInvoiceCompanyProduct(db,req,kind){
 const {user,staffGrant}=req;
 const writing=req.method==='PATCH',storeCapability=writing?'invoices.edit':'invoices.read';
 const isCard=kind==='card',companyCapability=isCard?invoiceProductCardCapability:invoiceProductBarcodesCapability;
 if((!isCard&&kind!=='barcodes')||(!writing&&req.method!=='GET')||
  user?.staffAccess!==true||staffGrant?.capability!==storeCapability||!user.storeId||req.get('x-backoffice-company-id')!==undefined)throw staffError();
 const {companyId,storeId}=user,{orderId,lineId}=req.params;
 const input=writing?(isCard?card:barcode).safeParse(req.body):null;
 if(writing&&!input.success)throw staffError(400,'STAFF_INVOICE_PRODUCT_INVALID','Έλεγξε τα στοιχεία του είδους και επιβεβαίωσε.');
 return db.$transaction(async tx=>{
  // This request has one STORE envelope. The same identified user must also
  // hold the exact live COMPANY grant; the request cannot choose that company.
  await requireStaffCompanyGrant(tx,{...user,storeId:undefined},companyCapability);
  await requireStaffGrant(tx,user,storeId,'products.read');
  if(writing)await requireStaffAction(tx,req,storeId,storeCapability);
  else await requireStaffGrant(tx,user,storeId,storeCapability,{additionalModules:['INVENTORY']});
  const [product]=await tx.$queryRaw`SELECT p."id",p."name",p."salePrice",p."updatedAt",o."status",o."awaitingInvoice"
    FROM "PurchaseOrder" o JOIN "PurchaseOrderLine" l ON l."orderId"=o."id"
    JOIN "Product" p ON p."id"=l."productId" AND p."companyId"=o."companyId" AND p."active"=true
    JOIN "StoreProduct" sp ON sp."productId"=p."id" AND sp."storeId"=o."storeId" AND sp."active"=true
    WHERE o."id"=${orderId} AND l."id"=${lineId} AND o."companyId"=${companyId} AND o."storeId"=${storeId}
    LIMIT 1 FOR UPDATE OF o,l,p,sp`;
  if(!product)throw staffError(404,'STAFF_OBJECT_NOT_FOUND','Η γραμμή δεν συνδέεται με ενεργό είδος του καταστήματος.');
  if(product.status!=='NEW'||product.awaitingInvoice===true)throw staffError(409,'STAFF_DRAFT_CLOSED','Άνοιξε επεξεργάσιμο πρόχειρο τιμολογίου.');
  const current={id:product.id,name:product.name,salePrice:product.salePrice==null?null:Number(product.salePrice),updatedAt:new Date(product.updatedAt).toISOString()};
  const context={orderId,lineId,storeId,product:current};
  if(!writing){
   if(isCard)return context;
   const rows=await tx.$queryRaw`SELECT "id","barcode","unitMultiplier","salePrice","name","updatedAt" FROM "ProductBarcode"
     WHERE "productId"=${product.id} ORDER BY "createdAt","id" LIMIT 201`;
   if(rows.length>200)throw staffError(422,'STAFF_PRODUCT_BARCODE_LIMIT','Η καρτέλα έχει περισσότερους από 200 κωδικούς.');
   return {...context,barcodes:rows.map(row=>({...row,unitMultiplier:Number(row.unitMultiplier),
    salePrice:row.salePrice==null?null:Number(row.salePrice),updatedAt:new Date(row.updatedAt).toISOString()}))};
  }
  const body=input.data;
  if(body.productId!==product.id)throw staffError(409,'STAFF_INVOICE_PRODUCT_CHANGED','Η αντιστοίχιση του είδους άλλαξε. Άνοιξε ξανά τη γραμμή.');
  const changes=isCard?await writeCard(tx,user,product,current,body):await writeBarcode(tx,user,product,body);
  if(changes){
   const event=isCard?'INVOICE_COMPANY_PRODUCT_UPDATED':'INVOICE_COMPANY_PRODUCT_BARCODE_UPDATED';
   const details=JSON.stringify({orderId,lineId,storeId,productId:product.id,...changes});
   await tx.$executeRaw`INSERT INTO "BackofficeStaffAudit" ("id","companyId","actorId","targetUserId","event","detail")
     VALUES (${randomUUID()},${companyId},${user.id},${user.id},${event},${details}::jsonb)`;
  }
  return {ok:true,orderId,lineId,storeId,productId:product.id};
 });
}

async function writeCard(tx,user,product,current,body){
 if(current.name===body.name&&current.salePrice===body.salePrice)return null;
 if(current.updatedAt!==body.expectedUpdatedAt)throw staffError(409,'STAFF_INVOICE_PRODUCT_CHANGED','Η καρτέλα άλλαξε. Άνοιξέ την ξανά.');
 if(current.salePrice!==body.salePrice)await tx.$executeRaw`INSERT INTO "ProductPriceHistory"
   ("id","companyId","productId","oldPrice","newPrice","changeType","createdByUserId")
   VALUES (${randomUUID()},${user.companyId},${product.id},${current.salePrice},${body.salePrice},'PRODUCT_CARD',${user.id})`;
 await tx.$executeRaw`UPDATE "Product" SET "name"=${body.name},"salePrice"=${body.salePrice},"updatedAt"=NOW()
   WHERE "id"=${product.id} AND "companyId"=${user.companyId}`;
 return {before:{name:current.name,salePrice:current.salePrice},after:{name:body.name,salePrice:body.salePrice}};
}

async function writeBarcode(tx,user,product,body){
 const existing=body.action==='ADD'?null:(await tx.$queryRaw`SELECT "id","barcode","unitMultiplier","salePrice","name","updatedAt"
   FROM "ProductBarcode" WHERE "id"=${body.id} AND "productId"=${product.id} FOR UPDATE`)[0];
 if(body.action!=='ADD'&&(!existing||new Date(existing.updatedAt).toISOString()!==body.expectedUpdatedAt)){
  throw staffError(409,'STAFF_INVOICE_PRODUCT_CHANGED','Το barcode άλλαξε. Άνοιξε ξανά την καρτέλα.');
 }
 if(body.action==='DELETE'){
  await tx.$executeRaw`DELETE FROM "ProductBarcode" WHERE "id"=${existing.id} AND "productId"=${product.id}`;
  return {action:'DELETE',before:existing};
 }
 await tx.$queryRaw`SELECT (pg_advisory_xact_lock(hashtext(${`invoice-product-barcode:${user.companyId}:${body.barcode}`})) IS NULL) AS "locked"`;
 const [duplicate]=await tx.$queryRaw`SELECT b."id" FROM "ProductBarcode" b JOIN "Product" p ON p."id"=b."productId"
   WHERE p."companyId"=${user.companyId} AND b."barcode"=${body.barcode} AND b."id" IS DISTINCT FROM ${existing?.id??null} LIMIT 1`;
 if(duplicate)throw staffError(409,'STAFF_PRODUCT_BARCODE_DUPLICATE','Το barcode χρησιμοποιείται ήδη στην εταιρεία.');
 const after={barcode:body.barcode,unitMultiplier:body.unitMultiplier,salePrice:body.salePrice,name:body.name||null};
 if(existing){
  await tx.$executeRaw`UPDATE "ProductBarcode" SET "barcode"=${after.barcode},"unitMultiplier"=${after.unitMultiplier},
    "salePrice"=${after.salePrice},"name"=${after.name},"updatedAt"=NOW() WHERE "id"=${existing.id} AND "productId"=${product.id}`;
 }else{
  await tx.$executeRaw`INSERT INTO "ProductBarcode" ("id","productId","barcode","unitMultiplier","salePrice","name")
    VALUES (${randomUUID()},${product.id},${after.barcode},${after.unitMultiplier},${after.salePrice},${after.name})`;
 }
 return {action:body.action,before:existing,after};
}
