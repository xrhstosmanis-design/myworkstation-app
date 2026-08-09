import crypto from "crypto";
import {Router} from "express";
import {z} from "zod";
import {prisma} from "../prisma.js";

const router=Router();
const roles=new Set(["SUPER_ADMIN","OWNER","ADMIN","MANAGER"]);
const id=()=>crypto.randomUUID();
let schemaPromise;

async function ensureSchema(){
  if(!schemaPromise){
    schemaPromise=(async()=>{
      await prisma.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS "SupplierProductLink" (
        "id" TEXT PRIMARY KEY,
        "companyId" TEXT NOT NULL,
        "supplierId" TEXT NOT NULL,
        "productId" TEXT NOT NULL,
        "supplierCode" TEXT,
        "active" BOOLEAN NOT NULL DEFAULT true,
        "source" TEXT NOT NULL DEFAULT 'MANUAL',
        "updatedBy" TEXT,
        "updatedByName" TEXT,
        "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        UNIQUE("companyId","supplierId","productId")
      )`);
      await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "SupplierProductLink_supplier_idx" ON "SupplierProductLink" ("companyId","supplierId","active")`);
      await prisma.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS "SupplierProductTransfer" (
        "id" TEXT PRIMARY KEY,
        "companyId" TEXT NOT NULL,
        "fromSupplierId" TEXT NOT NULL,
        "toSupplierId" TEXT NOT NULL,
        "mode" TEXT NOT NULL,
        "productIdsJson" JSONB NOT NULL DEFAULT '[]'::jsonb,
        "actorId" TEXT,
        "actorName" TEXT,
        "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )`);
      await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "SupplierProductTransfer_company_idx" ON "SupplierProductTransfer" ("companyId","createdAt" DESC)`);
    })().catch(error=>{schemaPromise=undefined;throw error});
  }
  return schemaPromise;
}
function requireAccess(req,res,next){
  if(req.user?.tokenType==="STORE_OPERATOR"||!roles.has(req.user?.role))return res.status(403).json({error:"Η μεταφορά ειδών/κωδικών είναι διαθέσιμη μόνο σε Super Admin, Ιδιοκτήτη, Admin ή Manager."});
  next();
}
router.use(requireAccess);
router.use(async(req,res,next)=>{try{await ensureSchema();next()}catch(error){next(error)}});

async function supplier(companyId,supplierId){
  const rows=await prisma.$queryRaw`SELECT "id","name","taxId","active" FROM "Supplier" WHERE "id"=${supplierId} AND "companyId"=${companyId} LIMIT 1`;
  return rows[0]||null;
}

router.get("/:supplierId/transfer-candidates",async(req,res,next)=>{
  try{
    const companyId=req.user.companyId,source=await supplier(companyId,req.params.supplierId);
    if(!source)return res.status(404).json({error:"Δεν βρέθηκε ο προμηθευτής."});
    const [targets,rows]=await Promise.all([
      prisma.$queryRaw`SELECT "id","name","taxId" FROM "Supplier" WHERE "companyId"=${companyId} AND "active"=true AND "id"<>${source.id} ORDER BY "name"`,
      prisma.$queryRaw`
        WITH historical AS (
          SELECT DISTINCT l."productId"
          FROM "PurchaseDocumentLine" l
          JOIN "PurchaseDocument" d ON d."id"=l."purchaseDocumentId"
          WHERE d."companyId"=${companyId} AND d."supplierId"=${source.id} AND l."productId" IS NOT NULL
        ), ordered AS (
          SELECT DISTINCT l."productId"
          FROM "PurchaseOrderLine" l
          JOIN "PurchaseOrder" o ON o."id"=l."orderId"
          WHERE o."companyId"=${companyId} AND o."supplierId"=${source.id} AND l."productId" IS NOT NULL
        ), linked AS (
          SELECT "productId" FROM "SupplierProductLink"
          WHERE "companyId"=${companyId} AND "supplierId"=${source.id} AND "active"=true
        ), products AS (
          SELECT "productId" FROM historical UNION SELECT "productId" FROM ordered UNION SELECT "productId" FROM linked
        )
        SELECT p."id" AS "productId",p."name",p."sku",p."salePrice",c."name" AS "categoryName",
          link."supplierCode" AS "linkedSupplierCode",link."active" AS "linkActive",
          (SELECT pol."supplierCode" FROM "PurchaseOrderLine" pol JOIN "PurchaseOrder" po ON po."id"=pol."orderId"
            WHERE po."companyId"=${companyId} AND po."supplierId"=${source.id} AND pol."productId"=p."id" AND pol."supplierCode" IS NOT NULL
            ORDER BY pol."updatedAt" DESC NULLS LAST,pol."createdAt" DESC LIMIT 1) AS "lastOrderSupplierCode",
          (SELECT b."barcode" FROM "ProductBarcode" b WHERE b."productId"=p."id" ORDER BY b."createdAt" LIMIT 1) AS "primaryBarcode"
        FROM products x
        JOIN "Product" p ON p."id"=x."productId" AND p."companyId"=${companyId}
        LEFT JOIN "ProductCategory" c ON c."id"=p."categoryId"
        LEFT JOIN "SupplierProductLink" link ON link."companyId"=${companyId} AND link."supplierId"=${source.id} AND link."productId"=p."id"
        ORDER BY p."name"`
    ]);
    res.json({source,targets,items:rows.map(row=>({...row,supplierCode:row.linkedSupplierCode||row.lastOrderSupplierCode||null,salePrice:Number(row.salePrice||0),linkActive:row.linkActive==null?null:Boolean(row.linkActive)}))});
  }catch(error){next(error)}
});

router.post("/:supplierId/transfer",async(req,res,next)=>{
  try{
    const companyId=req.user.companyId,fromSupplierId=req.params.supplierId;
    const body=z.object({
      toSupplierId:z.string().min(1),
      mode:z.enum(["ITEMS","CODES","ITEMS_CODES"]),
      productIds:z.array(z.string().min(1)).min(1).max(1000)
    }).parse(req.body||{});
    if(body.toSupplierId===fromSupplierId)return res.status(400).json({error:"Ο προμηθευτής προορισμού πρέπει να είναι διαφορετικός."});
    const [fromSupplier,toSupplier]=await Promise.all([supplier(companyId,fromSupplierId),supplier(companyId,body.toSupplierId)]);
    if(!fromSupplier||!toSupplier)return res.status(404).json({error:"Δεν βρέθηκε προμηθευτής προέλευσης ή προορισμού."});
    if(!toSupplier.active)return res.status(409).json({error:"Ο προμηθευτής προορισμού είναι ανενεργός."});
    const unique=[...new Set(body.productIds)];
    const products=await prisma.$queryRaw`SELECT "id" FROM "Product" WHERE "companyId"=${companyId} AND "id"=ANY(${unique}::text[])`;
    if(products.length!==unique.length)return res.status(404).json({error:"Ένα ή περισσότερα είδη δεν ανήκουν στην εταιρεία."});
    const actorName=req.user.fullName||"Χρήστης";
    await prisma.$transaction(async tx=>{
      for(const productId of unique){
        const codeRows=await tx.$queryRaw`
          SELECT COALESCE(link."supplierCode",(
            SELECT pol."supplierCode" FROM "PurchaseOrderLine" pol JOIN "PurchaseOrder" po ON po."id"=pol."orderId"
            WHERE po."companyId"=${companyId} AND po."supplierId"=${fromSupplierId} AND pol."productId"=${productId} AND pol."supplierCode" IS NOT NULL
            ORDER BY pol."updatedAt" DESC NULLS LAST,pol."createdAt" DESC LIMIT 1
          )) AS code
          FROM (SELECT 1) seed
          LEFT JOIN "SupplierProductLink" link ON link."companyId"=${companyId} AND link."supplierId"=${fromSupplierId} AND link."productId"=${productId}
          LIMIT 1`;
        const supplierCode=codeRows[0]?.code||null;
        await tx.$executeRaw`
          INSERT INTO "SupplierProductLink" ("id","companyId","supplierId","productId","supplierCode","active","source","updatedBy","updatedByName")
          VALUES (${id()},${companyId},${fromSupplierId},${productId},${supplierCode},true,'HISTORY_SYNC',${req.user.id},${actorName})
          ON CONFLICT ("companyId","supplierId","productId") DO NOTHING`;
        const targetCode=body.mode==="ITEMS"?null:supplierCode;
        await tx.$executeRaw`
          INSERT INTO "SupplierProductLink" ("id","companyId","supplierId","productId","supplierCode","active","source","updatedBy","updatedByName")
          VALUES (${id()},${companyId},${body.toSupplierId},${productId},${targetCode},true,'TRANSFER',${req.user.id},${actorName})
          ON CONFLICT ("companyId","supplierId","productId") DO UPDATE SET
            "active"=true,
            "supplierCode"=CASE WHEN ${body.mode}='ITEMS' THEN "SupplierProductLink"."supplierCode" ELSE EXCLUDED."supplierCode" END,
            "source"='TRANSFER',"updatedBy"=${req.user.id},"updatedByName"=${actorName},"updatedAt"=NOW()`;
        if(body.mode==="ITEMS"||body.mode==="ITEMS_CODES"){
          await tx.$executeRaw`UPDATE "SupplierProductLink" SET "active"=false,"supplierCode"=CASE WHEN ${body.mode}='ITEMS_CODES' THEN NULL ELSE "supplierCode" END,"updatedBy"=${req.user.id},"updatedByName"=${actorName},"updatedAt"=NOW() WHERE "companyId"=${companyId} AND "supplierId"=${fromSupplierId} AND "productId"=${productId}`;
        }else if(body.mode==="CODES"){
          await tx.$executeRaw`UPDATE "SupplierProductLink" SET "supplierCode"=NULL,"updatedBy"=${req.user.id},"updatedByName"=${actorName},"updatedAt"=NOW() WHERE "companyId"=${companyId} AND "supplierId"=${fromSupplierId} AND "productId"=${productId}`;
        }
      }
      await tx.$executeRaw`INSERT INTO "SupplierProductTransfer" ("id","companyId","fromSupplierId","toSupplierId","mode","productIdsJson","actorId","actorName") VALUES (${id()},${companyId},${fromSupplierId},${body.toSupplierId},${body.mode},${JSON.stringify(unique)}::jsonb,${req.user.id},${actorName})`;
    });
    res.json({ok:true,fromSupplier:{id:fromSupplier.id,name:fromSupplier.name},toSupplier:{id:toSupplier.id,name:toSupplier.name},mode:body.mode,count:unique.length,message:`Μεταφέρθηκαν ${unique.length} είδη/κωδικοί χωρίς αλλαγή ιστορικών παραστατικών.`});
  }catch(error){next(error)}
});

router.get("/:supplierId/transfers",async(req,res,next)=>{
  try{
    const companyId=req.user.companyId;
    const rows=await prisma.$queryRaw`SELECT t.*,f."name" AS "fromSupplierName",dest."name" AS "toSupplierName" FROM "SupplierProductTransfer" t JOIN "Supplier" f ON f."id"=t."fromSupplierId" LEFT JOIN "Supplier" dest ON dest."id"=t."toSupplierId" WHERE t."companyId"=${companyId} AND (t."fromSupplierId"=${req.params.supplierId} OR t."toSupplierId"=${req.params.supplierId}) ORDER BY t."createdAt" DESC LIMIT 200`;
    res.json(rows.map(row=>({...row,productIds:Array.isArray(row.productIdsJson)?row.productIdsJson:[]})));
  }catch(error){next(error)}
});

export default router;
