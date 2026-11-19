import crypto from 'node:crypto';
import {Prisma} from '@prisma/client';
import {z} from 'zod';
import {assertLifecycleMutation} from './store-lifecycle-generation.js';
import {lifecycleContext} from './store-lifecycle-context.js';
import {lockInvoiceStore} from '../lib/invoice-common-draft.js';
import {requireStaffAction,requireStaffGrant} from './backoffice-staff-access.js';
import {companyModuleState,effectiveModuleEnabled,isPlatformSuperAdmin} from '../middleware/module-access.js';

const Decimal=Prisma.Decimal.clone({precision:60,toExpNeg:-100,toExpPos:100});
const id=()=>crypto.randomUUID();
const digest=value=>crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
const failure=(message,status=409)=>Object.assign(new Error(message),{status});
const quantity=z.union([z.string(),z.number()]).transform(String).refine(value=>/^\d{1,9}(?:\.\d{1,6})?$/.test(value)&&new Decimal(value).gt(0),'Μη έγκυρη ποσότητα.');
const stockQuantity=z.union([z.string(),z.number()]).transform(String).refine(value=>/^\d{1,18}(?:\.\d{1,12})?$/.test(value)&&new Decimal(value).gt(0),'Μη έγκυρη ποσότητα αποθήκης.');
const key=z.string().uuid();
const storeId=z.string().min(1).max(200);
const intentContextFields={intentActorId:storeId.optional(),intentCompanyId:storeId.optional(),intentGeneration:z.string().regex(/^(0|[1-9][0-9]{0,18})$/).refine(value=>BigInt(value)<=9223372036854775807n).optional()};
export const expectedReceiptSchemas={
  confirm:z.object({...intentContextFields,storeId,productId:storeId,supplierId:storeId,invoiceQuantity:quantity,invoiceUnit:z.string().trim().min(1).max(30),stockUnitsPerInvoiceUnit:quantity,idempotencyKey:key}).strict(),
  link:z.object({...intentContextFields,storeId,version:z.number().int().nonnegative(),orderId:storeId,sourceDigest:z.string().regex(/^[a-f0-9]{64}$/),quantity:stockQuantity,idempotencyKey:key}).strict(),
  cancel:z.object({...intentContextFields,storeId,version:z.number().int().nonnegative(),reason:z.string().trim().min(1).max(500),idempotencyKey:key}).strict()
};
const schemas=new WeakMap();
// Explicit setup for isolated tests and a separately reviewed installation. Never called by a route.
export function ensureExpectedReceiptSchema(db){
  if(!schemas.has(db))schemas.set(db,(async()=>{
    await db.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS "SupplierExpectedReceiptLine" (
      "id" TEXT PRIMARY KEY,"companyId" TEXT NOT NULL,"storeId" TEXT NOT NULL,"supplierId" TEXT NOT NULL,"productId" TEXT NOT NULL,
      "invoiceQuantity" NUMERIC(24,6) NOT NULL CHECK ("invoiceQuantity">0),"invoiceUnit" TEXT NOT NULL,"stockUnit" TEXT NOT NULL,
      "stockUnitsPerInvoiceUnit" NUMERIC(24,6) NOT NULL CHECK ("stockUnitsPerInvoiceUnit">0),"expectedStockQuantity" NUMERIC(30,12) NOT NULL CHECK ("expectedStockQuantity">0),
      "cancelledQuantity" NUMERIC(30,12) NOT NULL DEFAULT 0 CHECK ("cancelledQuantity">=0),"version" INTEGER NOT NULL DEFAULT 0,
      "confirmedBy" TEXT NOT NULL,"confirmedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),"cancelledBy" TEXT,"cancelledAt" TIMESTAMPTZ,"cancellationReason" TEXT)`);
    await db.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "SupplierExpectedReceiptLine_scope" ON "SupplierExpectedReceiptLine"("companyId","storeId","productId")`);
    await db.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS "SupplierExpectedReceiptAllocation" (
      "id" TEXT PRIMARY KEY,"companyId" TEXT NOT NULL,"storeId" TEXT NOT NULL,"expectedLineId" TEXT NOT NULL REFERENCES "SupplierExpectedReceiptLine"("id"),
      "orderId" TEXT NOT NULL,"productId" TEXT NOT NULL,"quantity" NUMERIC(30,12) NOT NULL CHECK ("quantity">0),
      "sourceDigest" TEXT NOT NULL,"actorId" TEXT NOT NULL,"createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW())`);
    await db.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "SupplierExpectedReceiptAllocation_source" ON "SupplierExpectedReceiptAllocation"("companyId","storeId","orderId","productId")`);
    await db.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS "SupplierExpectedReceiptOperation" (
      "companyId" TEXT NOT NULL,"storeId" TEXT NOT NULL,"key" TEXT NOT NULL,"actorId" TEXT NOT NULL,"payloadDigest" TEXT NOT NULL,"result" JSONB NOT NULL,
      PRIMARY KEY("companyId","storeId","key"))`);
  })().catch(error=>{schemas.delete(db);throw error}));
  return schemas.get(db);
}

export async function expectedReceiptReadiness(db){
  const rows=await db.$queryRaw`SELECT to_regclass('"SupplierExpectedReceiptLine"')::text AS "lines",
    to_regclass('"SupplierExpectedReceiptAllocation"')::text AS "allocations",
    to_regclass('"SupplierExpectedReceiptOperation"')::text AS "operations"`;
  const available=Boolean(rows[0]?.lines&&rows[0]?.allocations&&rows[0]?.operations);
  return {available,reason:available?null:'Οι επιβεβαιωμένες αναμενόμενες παραλαβές περιμένουν ολοκλήρωση της εγκατάστασης και συμβατότητας αντιγράφων ασφαλείας.'};
}
async function requireExpectedReceiptSchema(db){
  const state=await expectedReceiptReadiness(db);
  if(!state.available)throw failure(state.reason,503);
}

export async function assertExpectedReceiptAuthority(db,req,scope,write=false){
  const stores=await db.$queryRaw`SELECT "id","companyId","active" FROM "Store" WHERE "id"=${scope.storeId} AND "companyId"=${scope.companyId} FOR SHARE`;
  const companies=await db.$queryRaw`SELECT "id","active" FROM "Company" WHERE "id"=${scope.companyId} FOR SHARE`;
  if(!companies[0]?.active)throw failure('Η εταιρεία δεν είναι ενεργή.',403);
  if(!stores[0]?.active)throw failure('Το κατάστημα δεν είναι ενεργό.',403);
  if(!isPlatformSuperAdmin(req.user)&&req.user?.companyId!==scope.companyId)throw failure('Δεν βρέθηκε κατάστημα.',404);
  if(req.user?.staffAccess===true){
    if(write)await requireStaffAction(db,req,scope.storeId,'invoices.approve');
    await requireStaffGrant(db,req.user,scope.storeId,write?'invoices.approve':'invoices.read',{additionalModules:['ORDER_SUGGESTIONS','INVENTORY']});
    return;
  }
  if(!['SUPER_ADMIN','OWNER','ADMIN','MANAGER'].includes(req.user?.role))throw failure('Δεν υπάρχει δικαίωμα αναμενόμενων παραλαβών.',403);
  if(isPlatformSuperAdmin(req.user))return;
  await db.$queryRaw`SELECT "moduleKey" FROM "CompanyModule" WHERE "companyId"=${scope.companyId} FOR SHARE`;
  const state=await companyModuleState(scope.companyId,{db});
  if(!state?.licenseAllowed)throw failure('Η άδεια δεν είναι ενεργή.',403);
  for(const moduleKey of ['ORDER_SUGGESTIONS','DOCUMENTS','INVENTORY']){
    const override=(await db.$queryRaw`SELECT "active","startsAt","endsAt" FROM "StorePaidModule" WHERE "storeId"=${scope.storeId} AND "moduleKey"=${moduleKey} FOR SHARE`)[0];
    if(!effectiveModuleEnabled(state.activeModules.includes(moduleKey),override?{...override,configured:true}:{configured:false}))throw failure('Η λειτουργία δεν είναι ενεργή.',403);
  }
}

export async function postedReceiptSource(db,scope,orderId,productId,{lock=false}={}){
  // The store lock used by canonical invoice writers is acquired by the caller.
  if(lock)await db.$queryRaw`SELECT "id" FROM "PurchaseOrder" WHERE "id"=${orderId} AND "companyId"=${scope.companyId} AND "storeId"=${scope.storeId} FOR UPDATE`;
  const orders=await db.$queryRaw`SELECT o."id",o."status",o."supplierId",o."updatedAt",o."reopenVersion",o."invoiceNumber",pp."supplierId" AS "postingSupplierId",
    d."id" AS "documentId",d."status" AS "documentStatus",d."documentType",d."supplierId" AS "documentSupplierId",d."updatedAt" AS "documentUpdatedAt",
    p."unit",p."active",sp."active" AS "storeActive"
    FROM "PurchaseOrder" o JOIN "PurchaseOrderPosting" pp ON pp."orderId"=o."id" AND pp."companyId"=o."companyId"
    JOIN "PurchaseDocument" d ON d."id"=pp."purchaseDocumentId" AND d."companyId"=o."companyId" AND d."storeId"=o."storeId"
    JOIN "Product" p ON p."id"=${productId} AND p."companyId"=o."companyId"
    JOIN "StoreProduct" sp ON sp."productId"=p."id" AND sp."storeId"=o."storeId"
    WHERE o."id"=${orderId} AND o."companyId"=${scope.companyId} AND o."storeId"=${scope.storeId}`;
  const order=orders[0];
  if(orders.length!==1||!['FINAL','INVOICED'].includes(order?.status)||order.documentStatus!=='APPROVED'||order.documentType!=='INVOICE'||!order.active||!order.storeActive||!order.supplierId||order.supplierId!==order.documentSupplierId||(order.postingSupplierId&&order.postingSupplierId!==order.supplierId))throw failure('Η πηγή αγοράς χρειάζεται έλεγχο.');
  if(Number(order.reopenVersion||0)!==0)throw failure('Η αγορά έχει ιστορικό επαναφοράς. Η ποσότητα παραλαβής χρειάζεται χωριστό έλεγχο.');
  const registrations=await db.$queryRaw`SELECT "storeId","postedDocumentId","path" FROM "InvoiceStockPosting" WHERE "companyId"=${scope.companyId} AND "orderId"=${orderId}`;
  if(registrations.length>1||registrations.some(row=>row.storeId!==scope.storeId||row.postedDocumentId!==order.documentId||row.path!=='PURCHASE_ORDER'))throw failure('Αντιφατική σύνδεση καταχώρισης.');
  const moves=await db.$queryRaw`SELECT "id","movementType","quantity","unitCost" FROM "StockMovement" WHERE "storeId"=${scope.storeId} AND "productId"=${productId} AND "sourceType"='PURCHASE_ORDER' AND "sourceId"=${orderId} AND "movementType" IN ('PURCHASE','PURCHASE_PACK_CORRECTION') ORDER BY "id"`;
  if(moves.filter(move=>move.movementType==='PURCHASE').length!==1||moves.some(move=>!new Decimal(move.quantity).isFinite()))throw failure('Δεν υπάρχει τεκμηριωμένη ποσότητα αποθήκης.');
  const total=moves.reduce((sum,move)=>sum.plus(move.quantity),new Decimal(0));
  if(!total.gt(0))throw failure('Η καταχωρισμένη ποσότητα δεν είναι θετική.');
  const allocated=await db.$queryRaw`SELECT COALESCE(SUM("quantity"),0) AS "quantity" FROM "SupplierExpectedReceiptAllocation" WHERE "companyId"=${scope.companyId} AND "storeId"=${scope.storeId} AND "orderId"=${orderId} AND "productId"=${productId}`;
  return {orderId,productId,supplierId:order.supplierId,unit:order.unit,documentNumber:order.invoiceNumber,quantity:total.toString(),available:total.minus(allocated[0].quantity).toString(),sourceDigest:digest({order,moves})};
}

export async function expectedReceiptRows(db,scope){
  if(!(await expectedReceiptReadiness(db)).available)return [];
  const rows=await db.$queryRaw`SELECT e.*,p."name" AS "productName",p."unit" AS "currentUnit",p."active" AS "productActive",sp."active" AS "storeActive",s."name" AS "supplierName",
    EXISTS (
      SELECT 1 FROM "PurchaseOrder" o
      JOIN "PurchaseOrderPosting" pp ON pp."orderId"=o."id" AND pp."companyId"=o."companyId"
      JOIN "PurchaseDocument" d ON d."id"=pp."purchaseDocumentId" AND d."companyId"=o."companyId" AND d."storeId"=o."storeId"
      JOIN LATERAL (
        SELECT SUM(sm."quantity") AS "quantity",
          BOOL_OR(sm."quantity">0 AND sm."createdAt">=e."confirmedAt") AS "newerPositive"
        FROM "StockMovement" sm WHERE sm."storeId"=e."storeId" AND sm."productId"=e."productId"
          AND sm."sourceType"='PURCHASE_ORDER' AND sm."sourceId"=o."id"
          AND sm."movementType" IN ('PURCHASE','PURCHASE_PACK_CORRECTION')
      ) posted ON TRUE
      WHERE o."companyId"=e."companyId" AND o."storeId"=e."storeId" AND o."supplierId"=e."supplierId"
        AND o."status" IN ('FINAL','INVOICED') AND d."status"='APPROVED' AND d."documentType"='INVOICE' AND d."supplierId"=e."supplierId"
        AND posted."newerPositive" AND posted."quantity">COALESCE((
          SELECT SUM(a."quantity") FROM "SupplierExpectedReceiptAllocation" a WHERE a."companyId"=e."companyId"
            AND a."storeId"=e."storeId" AND a."orderId"=o."id" AND a."productId"=e."productId"
        ),0)
    ) AS "postedQuantityNeedsReview",
    COALESCE((SELECT SUM(a."quantity") FROM "SupplierExpectedReceiptAllocation" a WHERE a."expectedLineId"=e."id" AND a."companyId"=e."companyId" AND a."storeId"=e."storeId"),0) AS "allocatedQuantity"
    FROM "SupplierExpectedReceiptLine" e JOIN "Product" p ON p."id"=e."productId" AND p."companyId"=e."companyId"
    JOIN "StoreProduct" sp ON sp."storeId"=e."storeId" AND sp."productId"=e."productId"
    JOIN "Supplier" s ON s."id"=e."supplierId" AND s."companyId"=e."companyId"
    WHERE e."companyId"=${scope.companyId} AND e."storeId"=${scope.storeId} ORDER BY e."confirmedAt",e."id" LIMIT 2001`;
  if(rows.length>2000)throw failure('Πάρα πολλές αναμονές για πλήρη υπολογισμό.');
  const allocations=await db.$queryRaw`SELECT * FROM "SupplierExpectedReceiptAllocation" WHERE "companyId"=${scope.companyId} AND "storeId"=${scope.storeId} ORDER BY "id" LIMIT 10001`;
  if(allocations.length>10000)throw failure('Πάρα πολλές συνδέσεις για πλήρη υπολογισμό.');
  const sources=new Map();
  for(const row of rows){
    row.reviewReason=!row.productActive||!row.storeActive||row.currentUnit!==row.stockUnit?'Η μονάδα ή το είδος άλλαξε.':null;
    for(const allocation of allocations.filter(a=>a.expectedLineId===row.id)){
      const cacheKey=JSON.stringify([allocation.orderId,allocation.productId]);
      if(!sources.has(cacheKey)){
        try{sources.set(cacheKey,await postedReceiptSource(db,scope,allocation.orderId,allocation.productId));}
        catch(error){if(error.status!==409)throw error;sources.set(cacheKey,null);}
      }
      if(sources.get(cacheKey)?.sourceDigest!==allocation.sourceDigest)row.reviewReason='Η συνδεδεμένη αγορά άλλαξε. Χρειάζεται έλεγχος.';
    }
    row.remainingQuantity=new Decimal(row.expectedStockQuantity).minus(row.allocatedQuantity).minus(row.cancelledQuantity).toString();
    row.postedPurchaseReviewReason=row.postedQuantityNeedsReview&&new Decimal(row.remainingQuantity).gt(0)?'Υπάρχει νεότερη καταχωρισμένη ποσότητα για έλεγχο. Σύνδεσε την παραλαβή ή επανέλεγξε το υπόλοιπο πριν από νέα πρόταση.':null;
    if(new Decimal(row.remainingQuantity).lt(0))row.reviewReason='Ασυμφωνία κατανομών.';
    for(const field of ['invoiceQuantity','stockUnitsPerInvoiceUnit','expectedStockQuantity','cancelledQuantity','allocatedQuantity'])row[field]=new Decimal(row[field]).toString();
  }
  return rows;
}

export function hasExpectedReceiptIntent(req,scope){
  return req.body?.intentActorId===req.user?.id&&req.body?.intentCompanyId===scope.companyId&&req.body?.storeId===scope.storeId&&req.body?.intentGeneration===(lifecycleContext()[scope.storeId]??'0');
}
function canonicalPayload(value){
  if(Array.isArray(value))return value.map(canonicalPayload);
  if(value&&typeof value==='object')return Object.fromEntries(Object.keys(value).sort().map(key=>[key,canonicalPayload(value[key])]));
  return value;
}
function operationDigest(req,action,expectedId){return digest({actorId:req.user.id,action,expectedId,body:canonicalPayload(req.body)});}
export async function mutateExpectedReceipt(db,req,scope,action,expectedId=null){
  const body=expectedReceiptSchemas[action].parse(req.body);
  if((body.intentActorId!==undefined||body.intentCompanyId!==undefined||body.intentGeneration!==undefined)&&!hasExpectedReceiptIntent(req,scope))throw failure('Η ταυτότητα σύνδεσης του αποθηκευμένου αιτήματος άλλαξε.',403);
  if(body.storeId!==scope.storeId)throw failure('Ανανέωσε το επιλεγμένο κατάστημα.',403);
  await assertExpectedReceiptAuthority(db,req,scope,true);
  await requireExpectedReceiptSchema(db);
  return db.$transaction(async tx=>{
    await lockInvoiceStore(tx,scope.companyId,scope.storeId);
    await requireExpectedReceiptSchema(tx);
    await assertExpectedReceiptAuthority(tx,req,scope,true);
    await assertLifecycleMutation(tx,scope,lifecycleContext()[scope.storeId]??'0');
    const payloadDigest=operationDigest(req,action,expectedId);
    const prior=(await tx.$queryRaw`SELECT "payloadDigest","result" FROM "SupplierExpectedReceiptOperation" WHERE "companyId"=${scope.companyId} AND "storeId"=${scope.storeId} AND "key"=${body.idempotencyKey}`)[0];
    if(prior){if(prior.payloadDigest!==payloadDigest)throw failure('Το κλειδί επανάληψης χρησιμοποιήθηκε με άλλα στοιχεία.');return prior.result;}
    let result;
    if(action==='confirm'){
      const products=await tx.$queryRaw`SELECT p."id",p."unit" FROM "Product" p JOIN "StoreProduct" sp ON sp."productId"=p."id" AND sp."storeId"=${scope.storeId} WHERE p."id"=${body.productId} AND p."companyId"=${scope.companyId} AND p."active"=TRUE AND sp."active"=TRUE FOR SHARE OF p,sp`;
      const supplier=await tx.$queryRaw`SELECT "id" FROM "Supplier" WHERE "id"=${body.supplierId} AND "companyId"=${scope.companyId} AND "active"=TRUE FOR SHARE`;
      if(products.length!==1||supplier.length!==1||!products[0].unit)throw failure('Επιβεβαίωσε ενεργό είδος και προμηθευτή στο κατάστημα.');
      const expectedStockQuantity=new Decimal(body.invoiceQuantity).times(body.stockUnitsPerInvoiceUnit).toString(),expectedId=id();
      await tx.$executeRaw`INSERT INTO "SupplierExpectedReceiptLine"("id","companyId","storeId","supplierId","productId","invoiceQuantity","invoiceUnit","stockUnit","stockUnitsPerInvoiceUnit","expectedStockQuantity","confirmedBy") VALUES(${expectedId},${scope.companyId},${scope.storeId},${body.supplierId},${body.productId},${body.invoiceQuantity}::numeric,${body.invoiceUnit},${products[0].unit},${body.stockUnitsPerInvoiceUnit}::numeric,${expectedStockQuantity}::numeric,${req.user.id})`;
      result={id:expectedId,version:0,expectedStockQuantity};
    }else{
      const expected=(await tx.$queryRaw`SELECT * FROM "SupplierExpectedReceiptLine" WHERE "id"=${expectedId} AND "companyId"=${scope.companyId} AND "storeId"=${scope.storeId} FOR UPDATE`)[0];
      if(!expected)throw failure('Δεν βρέθηκε αναμονή.',404);
      if(expected.version!==body.version)throw failure('Η αναμονή άλλαξε. Ανανέωσε.');
      const allocated=(await tx.$queryRaw`SELECT COALESCE(SUM("quantity"),0) AS "quantity" FROM "SupplierExpectedReceiptAllocation" WHERE "expectedLineId"=${expected.id} AND "companyId"=${scope.companyId} AND "storeId"=${scope.storeId}`)[0];
      const remaining=new Decimal(expected.expectedStockQuantity).minus(expected.cancelledQuantity).minus(allocated.quantity);
      if(action==='link'){
        const state=(await expectedReceiptRows(tx,scope)).find(row=>row.id===expected.id);
        if(state?.reviewReason)throw failure(state.reviewReason);
        const source=await postedReceiptSource(tx,scope,body.orderId,expected.productId,{lock:true});
        if(source.sourceDigest!==body.sourceDigest||source.supplierId!==expected.supplierId||source.unit!==expected.stockUnit)throw failure('Η πηγή ή η μονάδα παραλαβής άλλαξε.');
        const amount=new Decimal(body.quantity);
        if(amount.gt(remaining)||amount.gt(source.available))throw failure('Η ποσότητα υπερβαίνει το διαθέσιμο υπόλοιπο.');
        const allocationId=id();
        await tx.$executeRaw`INSERT INTO "SupplierExpectedReceiptAllocation"("id","companyId","storeId","expectedLineId","orderId","productId","quantity","sourceDigest","actorId") VALUES(${allocationId},${scope.companyId},${scope.storeId},${expected.id},${body.orderId},${expected.productId},${body.quantity}::numeric,${source.sourceDigest},${req.user.id})`;
        result={id:expected.id,allocationId,version:expected.version+1,remainingQuantity:remaining.minus(amount).toString()};
      }else{
        if(!remaining.gt(0))throw failure('Δεν υπάρχει υπόλοιπο για ακύρωση.');
        await tx.$executeRaw`UPDATE "SupplierExpectedReceiptLine" SET "cancelledQuantity"="cancelledQuantity"+${remaining.toString()}::numeric,"cancelledBy"=${req.user.id},"cancelledAt"=NOW(),"cancellationReason"=${body.reason} WHERE "id"=${expected.id}`;
        result={id:expected.id,version:expected.version+1,remainingQuantity:'0'};
      }
      await tx.$executeRaw`UPDATE "SupplierExpectedReceiptLine" SET "version"="version"+1 WHERE "id"=${expected.id}`;
    }
    await tx.$executeRaw`INSERT INTO "StoreOperatorAudit"("id","companyId","storeId","actorId","eventType","details") VALUES(${id()},${scope.companyId},${scope.storeId},${req.user.id},${`SUPPLIER_EXPECTED_RECEIPT_${action.toUpperCase()}`},${JSON.stringify({result,body})}::jsonb)`;
    await tx.$executeRaw`INSERT INTO "SupplierExpectedReceiptOperation"("companyId","storeId","key","actorId","payloadDigest","result") VALUES(${scope.companyId},${scope.storeId},${body.idempotencyKey},${req.user.id},${payloadDigest},${JSON.stringify(result)}::jsonb)`;
    return result;
  },{timeout:30000});
}

// Called only after the original business transaction has rejected and rolled back.
// The same store lock serializes a delayed original request and this rejection.
export async function rejectExpectedReceiptIntent(db,req,scope,action,expectedId,error){
  if(!hasExpectedReceiptIntent(req,scope)||(error?.status!==409&&error?.name!=='ZodError'))throw error;
  const body=z.object({storeId,idempotencyKey:key,intentActorId:storeId,intentCompanyId:storeId,intentGeneration:intentContextFields.intentGeneration.unwrap()}).passthrough().parse(req.body);
  await requireExpectedReceiptSchema(db);
  return db.$transaction(async tx=>{
    await lockInvoiceStore(tx,scope.companyId,scope.storeId);
    await assertExpectedReceiptAuthority(tx,req,scope,true);
    await assertLifecycleMutation(tx,scope,lifecycleContext()[scope.storeId]??'0');
    const payloadDigest=operationDigest(req,action,expectedId);
    const prior=(await tx.$queryRaw`SELECT "payloadDigest","result" FROM "SupplierExpectedReceiptOperation" WHERE "companyId"=${scope.companyId} AND "storeId"=${scope.storeId} AND "key"=${body.idempotencyKey}`)[0];
    if(prior){if(prior.payloadDigest!==payloadDigest)throw failure('Το κλειδί επανάληψης χρησιμοποιήθηκε με άλλα στοιχεία.');return prior.result;}
    const result={rejected:true,message:error.name==='ZodError'?'Ελέγξτε τα στοιχεία της φόρμας.':error.message};
    await tx.$executeRaw`INSERT INTO "SupplierExpectedReceiptOperation"("companyId","storeId","key","actorId","payloadDigest","result") VALUES(${scope.companyId},${scope.storeId},${body.idempotencyKey},${req.user.id},${payloadDigest},${JSON.stringify(result)}::jsonb)`;
    await tx.$executeRaw`INSERT INTO "StoreOperatorAudit"("id","companyId","storeId","actorId","eventType","details") VALUES(${id()},${scope.companyId},${scope.storeId},${req.user.id},'SUPPLIER_EXPECTED_RECEIPT_REJECTED',${JSON.stringify({action,expectedId,idempotencyKey:body.idempotencyKey,message:result.message})}::jsonb)`;
    return result;
  },{timeout:30000});
}
