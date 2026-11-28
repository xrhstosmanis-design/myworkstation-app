import {randomUUID} from "node:crypto";
import {Router} from "express";
import {z} from "zod";
import {prisma} from "../prisma.js";
import {requireStaffAction} from "../services/backoffice-staff-access.js";
import {lockInvoiceStore} from "../lib/invoice-common-draft.js";

const router=Router();
const roles=new Set(["SUPER_ADMIN","OWNER","ADMIN","MANAGER"]);
const id=z.string().trim().min(1).max(160);
const quantity=z.number().int().min(1).max(100000);
const error=(status,message)=>Object.assign(new Error(message),{status});
const storeScope=z.object({storeId:id});
const depositInput=storeScope.extend({
  documentId:id, productId:id.optional(), label:z.string().trim().min(1).max(120).optional(),
  kind:z.enum(["CRATE","BOTTLE","PALLET"]), quantity,
  unitCents:z.number().int().min(1).max(100000), dueDate:z.string().date().nullable()
}).refine(b=>b.productId||b.label);
const activityInput=storeScope.extend({quantity,reference:id});
let schema;
function ensureSchema(){
  return schema??=(async()=>{
    await prisma.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS "SupplierDeposit" (
      "id" TEXT PRIMARY KEY,"companyId" TEXT NOT NULL,"storeId" TEXT NOT NULL,"supplierId" TEXT NOT NULL,
      "documentId" TEXT NOT NULL,"kind" TEXT NOT NULL,"label" TEXT NOT NULL,"quantity" INT NOT NULL,
      "unitCents" INT NOT NULL,"dueDate" DATE,"createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),"actorId" TEXT NOT NULL,
      UNIQUE ("documentId","kind","label")
    )`);
    await prisma.$executeRawUnsafe(`ALTER TABLE "SupplierDeposit" ADD COLUMN IF NOT EXISTS "productId" TEXT`);
    await prisma.$executeRawUnsafe(`CREATE UNIQUE INDEX IF NOT EXISTS "SupplierDeposit_document_product_idx"
      ON "SupplierDeposit" ("documentId","kind","productId") WHERE "productId" IS NOT NULL`);
    await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "SupplierDeposit_store_idx" ON "SupplierDeposit" ("companyId","storeId","supplierId")`);
    await prisma.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS "SupplierDepositActivity" (
      "id" TEXT PRIMARY KEY,"depositId" TEXT NOT NULL REFERENCES "SupplierDeposit" ("id"),
      "kind" TEXT NOT NULL,"reference" TEXT NOT NULL,"quantity" INT NOT NULL,
      "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),"actorId" TEXT NOT NULL,
      UNIQUE ("depositId","kind","reference")
    )`);
  })().catch(e=>{schema=undefined;throw e});
}
async function scope(db,req,storeId,capability){
  const user=req.user;
  if(user?.staffAccess===true)await requireStaffAction(db,req,storeId,capability);
  else if(!user?.id||!user.companyId||user.tokenType==="STORE_OPERATOR"||!roles.has(user.role))
    throw error(403,"Η εγγυοδοσία είναι διαθέσιμη στον ιδιοκτήτη ή στον υπεύθυνο διαχείρισης.");
  if(user.storeId&&user.storeId!==storeId)throw error(403,"Επίλεξε το κατάστημά σου.");
  const [store]=await db.$queryRaw`SELECT "id" FROM "Store" WHERE "companyId"=${user.companyId} AND "id"=${storeId}`;
  if(!store)throw error(404,"Δεν βρέθηκε το κατάστημα.");
}
async function document(db,companyId,storeId,documentId,type){
  const [row]=await db.$queryRaw`SELECT "id","supplierId","totalGross" FROM "PurchaseDocument"
    WHERE "companyId"=${companyId} AND "storeId"=${storeId} AND "id"=${documentId}
      AND "documentType"=${type} AND "status"='APPROVED' FOR SHARE`;
  if(!row?.supplierId)throw error(409,"Επίλεξε εγκεκριμένο παραστατικό του καταστήματος με προμηθευτή.");
  return row;
}
async function balances(db,depositId){
  const [row]=await db.$queryRaw`SELECT
    COALESCE(SUM(a."quantity") FILTER(WHERE a."kind"='RETURN'),0)::int AS "returned",
    COALESCE(SUM(a."quantity") FILTER(WHERE a."kind"='CREDIT' AND c."status"='APPROVED'),0)::int AS "credited"
    FROM "SupplierDepositActivity" a LEFT JOIN "PurchaseDocument" c ON a."kind"='CREDIT' AND c."id"=a."reference"
    WHERE a."depositId"=${depositId}`;
  return row;
}
router.get("/",async(req,res,next)=>{try{
  const {storeId,q}=storeScope.extend({q:z.string().trim().min(2).max(100).optional()}).parse(req.query);
  await scope(prisma,req,storeId,"invoices.read");
  const companyId=req.user.companyId;
  if(q){
    const products=await prisma.$queryRaw`SELECT p."id",p."name",p."sku" FROM "Product" p
      JOIN "StoreProduct" sp ON sp."productId"=p."id" AND sp."storeId"=${storeId} AND sp."active"
      WHERE p."companyId"=${companyId} AND p."active"
        AND (STRPOS(LOWER(p."name"),LOWER(${q}))>0 OR STRPOS(LOWER(COALESCE(p."sku",'')),LOWER(${q}))>0)
      ORDER BY p."name",p."id" LIMIT 30`;
    return res.json({products});
  }
  await ensureSchema();
  const [rows,documents]=await Promise.all([
    prisma.$queryRaw`SELECT d."id",d."kind",COALESCE(product."name",d."label") AS "label",product."sku",d."quantity",d."unitCents",d."dueDate"::text,
      s."name" AS "supplier",d."supplierId",p."documentNumber",p."status" AS "sourceStatus",
      COALESCE(SUM(a."quantity") FILTER(WHERE a."kind"='RETURN'),0)::int AS "returned",
      COALESCE(SUM(a."quantity") FILTER(WHERE a."kind"='CREDIT' AND c."status"='APPROVED'),0)::int AS "credited",
      COALESCE(jsonb_agg(jsonb_build_object('kind',a."kind",'reference',CASE WHEN a."kind"='CREDIT' THEN c."documentNumber" ELSE a."reference" END,'quantity',a."quantity",'date',a."createdAt",'status',c."status")
        ORDER BY a."createdAt",a."id") FILTER(WHERE a."id" IS NOT NULL),'[]'::jsonb) AS "history"
      FROM "SupplierDeposit" d JOIN "Supplier" s ON s."id"=d."supplierId" AND s."companyId"=d."companyId"
      LEFT JOIN "Product" product ON product."id"=d."productId" AND product."companyId"=d."companyId"
      LEFT JOIN "PurchaseDocument" p ON p."id"=d."documentId" AND p."companyId"=d."companyId" AND p."storeId"=d."storeId"
      LEFT JOIN "SupplierDepositActivity" a ON a."depositId"=d."id"
      LEFT JOIN "PurchaseDocument" c ON a."kind"='CREDIT' AND c."id"=a."reference"
      WHERE d."companyId"=${companyId} AND d."storeId"=${storeId}
      GROUP BY d."id",s."name",p."documentNumber",p."status",product."id",product."name",product."sku"
      ORDER BY d."dueDate" NULLS LAST,d."createdAt" DESC`,
    prisma.$queryRaw`SELECT d."id",d."supplierId",d."documentNumber",d."documentDate",d."documentType",s."name" AS "supplier"
      FROM "PurchaseDocument" d JOIN "Supplier" s ON s."id"=d."supplierId" AND s."companyId"=d."companyId"
      WHERE d."companyId"=${companyId} AND d."storeId"=${storeId} AND d."status"='APPROVED'
        AND d."documentType" IN ('INVOICE','CREDIT_NOTE')
      ORDER BY d."documentDate" DESC,d."id" DESC`
  ]);
  res.json({rows,documents});
}catch(e){next(e)}});
router.post("/",async(req,res,next)=>{try{
  const b=depositInput.parse(req.body),user=req.user;
  await scope(prisma,req,b.storeId,"invoices.edit");
  await ensureSchema();
  const created=await prisma.$transaction(async tx=>{
    await scope(tx,req,b.storeId,"invoices.edit");
    await lockInvoiceStore(tx,user.companyId,b.storeId);
    const p=await document(tx,user.companyId,b.storeId,b.documentId,"INVOICE");
    const [product]=b.productId?await tx.$queryRaw`SELECT p."id",p."name",p."sku" FROM "Product" p
      JOIN "StoreProduct" sp ON sp."productId"=p."id" AND sp."storeId"=${b.storeId} AND sp."active"
      WHERE p."id"=${b.productId} AND p."companyId"=${user.companyId} AND p."active"`:[];
    if(b.productId&&!product)throw error(409,"Το είδος δεν είναι ενεργό στον κατάλογο του καταστήματος.");
    const label=product?`${product.name} (${product.sku||product.id})`:b.label.toLocaleUpperCase("el-GR");
    const depositId=randomUUID();
    const rows=await tx.$queryRaw`INSERT INTO "SupplierDeposit" ("id","companyId","storeId","supplierId","documentId","kind","label","quantity","unitCents","dueDate","actorId","productId")
      VALUES (${depositId},${user.companyId},${b.storeId},${p.supplierId},${b.documentId},${b.kind},${label},${b.quantity},${b.unitCents},${b.dueDate}::date,${user.id},${b.productId??null})
      ON CONFLICT DO NOTHING RETURNING "id"`;
    if(!rows.length)throw error(409,"Η συγκεκριμένη εγγυοδοσία έχει ήδη καταχωριστεί στο παραστατικό.");
    return {id:depositId};
  });
  res.status(201).json(created);
}catch(e){next(e)}});
router.post("/:depositId/:activity",async(req,res,next)=>{try{
  const b=activityInput.parse(req.body),user=req.user;
  const kind=z.enum(["RETURN","CREDIT"]).parse(req.params.activity);
  await scope(prisma,req,b.storeId,"invoices.edit");
  await ensureSchema();
  await prisma.$transaction(async tx=>{
    await scope(tx,req,b.storeId,"invoices.edit");
    await lockInvoiceStore(tx,user.companyId,b.storeId);
    const [deposit]=await tx.$queryRaw`SELECT * FROM "SupplierDeposit"
      WHERE "id"=${req.params.depositId} AND "companyId"=${user.companyId} AND "storeId"=${b.storeId} FOR UPDATE`;
    if(!deposit)throw error(404,"Δεν βρέθηκε η εγγυοδοσία στο κατάστημα.");
    await document(tx,user.companyId,b.storeId,deposit.documentId,"INVOICE");
    const [existing]=await tx.$queryRaw`SELECT "quantity" FROM "SupplierDepositActivity"
      WHERE "depositId"=${deposit.id} AND "kind"=${kind} AND "reference"=${b.reference}`;
    if(existing){
      if(existing.quantity===b.quantity)return;
      throw error(409,"Η ίδια αναφορά έχει ήδη καταχωριστεί με διαφορετική ποσότητα.");
    }
    const {returned,credited}=await balances(tx,deposit.id);
    const remaining=kind==="RETURN"?deposit.quantity-returned:returned-credited;
    if(b.quantity>remaining)throw error(409,"Η ποσότητα υπερβαίνει το εκκρεμές υπόλοιπο.");
    if(kind==="CREDIT"){
      const credit=await document(tx,user.companyId,b.storeId,b.reference,"CREDIT_NOTE");
      if(credit.supplierId!==deposit.supplierId)throw error(409,"Το πιστωτικό ανήκει σε διαφορετικό προμηθευτή.");
      const [used]=await tx.$queryRaw`SELECT COALESCE(SUM(a."quantity"::bigint*d."unitCents"),0)::text AS "cents"
        FROM "SupplierDepositActivity" a JOIN "SupplierDeposit" d ON d."id"=a."depositId"
        WHERE a."kind"='CREDIT' AND a."reference"=${credit.id}`;
      if(Number(used.cents)+b.quantity*deposit.unitCents>Math.round(Math.abs(Number(credit.totalGross))*100))
        throw error(409,"Η συνολική αντιστοίχιση υπερβαίνει την αξία του πιστωτικού.");
    }
    await tx.$executeRaw`INSERT INTO "SupplierDepositActivity" ("id","depositId","kind","reference","quantity","actorId")
      VALUES (${randomUUID()},${deposit.id},${kind},${b.reference},${b.quantity},${user.id})`;
  });
  res.json({ok:true});
}catch(e){next(e)}});
export default router;
