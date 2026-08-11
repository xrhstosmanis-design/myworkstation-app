import crypto from "crypto";
import {Router} from "express";
import {z} from "zod";
import {prisma} from "../prisma.js";
import {auth} from "../middleware/auth.js";

const router=Router();
const uid=()=>crypto.randomUUID();
const allowed=req=>req.user?.isSuperAdmin===true||req.user?.platformRole==="SUPER_ADMIN";

router.use(auth);
router.use((req,res,next)=>allowed(req)?next():res.status(403).json({error:"Απαιτείται πρόσβαση Platform Super Admin."}));

let schemaReady;
async function ensureSchema(){
  if(!schemaReady)schemaReady=(async()=>{
    await prisma.$executeRawUnsafe(`ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "subcategoryId" TEXT`);
    await prisma.$executeRawUnsafe(`ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "vatDepartmentId" TEXT`);
    await prisma.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS "PlatformBulkCatalogAudit" (
      "id" TEXT PRIMARY KEY,"actorId" TEXT,"productIdsJson" JSONB NOT NULL,"storeIdsJson" JSONB NOT NULL,
      "createdProducts" INTEGER NOT NULL DEFAULT 0,"activatedMappings" INTEGER NOT NULL DEFAULT 0,"createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW())`);
  })().catch(error=>{schemaReady=undefined;throw error});
  return schemaReady;
}
router.use(async(req,res,next)=>{try{await ensureSchema();next()}catch(error){next(error)}});

router.get("/targets",async(req,res,next)=>{
  try{
    const companies=await prisma.company.findMany({where:{active:true},select:{id:true,name:true,stores:{where:{active:true},select:{id:true,name:true,city:true},orderBy:{name:"asc"}}},orderBy:{name:"asc"}});
    res.json({companies});
  }catch(error){next(error)}
});

router.get("/products",async(req,res,next)=>{
  try{
    const q=String(req.query.q||"").trim(),category=String(req.query.category||"").trim(),subcategory=String(req.query.subcategory||"").trim(),like=`%${q}%`;
    const rows=await prisma.$queryRaw`
      SELECT p."id",p."sourceCode",p."name",p."categoryName",p."subcategoryName",p."brandName",p."defaultRetailPrice",p."defaultCostPrice",p."vatRate",p."vatVerified",
        COALESCE((SELECT json_agg(b."barcode" ORDER BY b."barcode") FROM "MasterProductBarcode" b WHERE b."masterProductId"=p."id" AND b."scanEnabled"=true),'[]') AS barcodes
      FROM "MasterProduct" p
      WHERE p."active"=true
        AND (${q===""} OR p."name" ILIKE ${like} OR p."sourceCode" ILIKE ${like} OR EXISTS(SELECT 1 FROM "MasterProductBarcode" bx WHERE bx."masterProductId"=p."id" AND bx."barcode" ILIKE ${like}))
        AND (${category===""} OR p."categoryName"=${category})
        AND (${subcategory===""} OR p."subcategoryName"=${subcategory})
      ORDER BY p."categoryName" NULLS LAST,p."subcategoryName" NULLS LAST,p."name" LIMIT 500`;
    const categories=await prisma.$queryRaw`SELECT DISTINCT "categoryName" AS name FROM "MasterProduct" WHERE "active"=true AND "categoryName" IS NOT NULL ORDER BY "categoryName"`;
    const subcategories=category?await prisma.$queryRaw`SELECT DISTINCT "subcategoryName" AS name FROM "MasterProduct" WHERE "active"=true AND "categoryName"=${category} AND "subcategoryName" IS NOT NULL ORDER BY "subcategoryName"`:[];
    res.json({rows:rows.map(row=>({...row,defaultRetailPrice:row.defaultRetailPrice===null?null:Number(row.defaultRetailPrice),defaultCostPrice:row.defaultCostPrice===null?null:Number(row.defaultCostPrice),vatRate:row.vatRate===null?null:Number(row.vatRate)})),categories:categories.map(x=>x.name),subcategories:subcategories.map(x=>x.name)});
  }catch(error){next(error)}
});

const dispatchSchema=z.object({masterProductIds:z.array(z.string().min(1)).min(1).max(500),storeIds:z.array(z.string().min(1)).min(1).max(200)}).superRefine((body,ctx)=>{
  if(body.masterProductIds.length*body.storeIds.length>10000)ctx.addIssue({code:z.ZodIssueCode.custom,message:"Επιτρέπονται έως 10.000 συνδυασμοί προϊόν × κατάστημα."});
});

async function ensureCategory(tx,companyId,name){
  if(!name)return null;
  const rows=await tx.$queryRaw`SELECT "id" FROM "ProductCategory" WHERE "companyId"=${companyId} AND "name"=${name} LIMIT 1`;
  if(rows[0])return rows[0].id;
  const id=uid();await tx.$executeRaw`INSERT INTO "ProductCategory" ("id","companyId","name") VALUES (${id},${companyId},${name})`;return id;
}
async function ensureSubcategory(tx,companyId,categoryId,name){
  if(!categoryId||!name)return null;
  const rows=await tx.$queryRaw`SELECT "id" FROM "ProductSubcategory" WHERE "companyId"=${companyId} AND "categoryId"=${categoryId} AND "name"=${name} LIMIT 1`;
  if(rows[0])return rows[0].id;
  const id=uid();await tx.$executeRaw`INSERT INTO "ProductSubcategory" ("id","companyId","categoryId","name") VALUES (${id},${companyId},${categoryId},${name})`;return id;
}
async function ensureVat(tx,companyId,rate){
  if(rate===null||rate===undefined)return null;
  const n=Number(rate);const rows=await tx.$queryRaw`SELECT "id" FROM "ManagementVatDepartment" WHERE "companyId"=${companyId} AND "vatRate"=${n} AND "active"=true ORDER BY "createdAt" LIMIT 1`;
  if(rows[0])return rows[0].id;
  const id=uid(),description=`ΦΠΑ ${n}%`;await tx.$executeRaw`INSERT INTO "ManagementVatDepartment" ("id","companyId","description","vatRate","active","commerce") VALUES (${id},${companyId},${description},${n},true,true)`;return id;
}

router.post("/dispatch",async(req,res,next)=>{
  try{
    const body=dispatchSchema.parse(req.body||{}),productIds=[...new Set(body.masterProductIds)],storeIds=[...new Set(body.storeIds)];
    const [masters,stores]=await Promise.all([
      prisma.$queryRaw`SELECT "id","sourceCode","name","categoryName","subcategoryName","defaultRetailPrice","defaultCostPrice","vatRate","vatVerified","active" FROM "MasterProduct" WHERE "id"=ANY(${productIds}::text[]) AND "active"=true`,
      prisma.store.findMany({where:{id:{in:storeIds},active:true},select:{id:true,name:true,companyId:true}})
    ]);
    if(masters.length!==productIds.length)return res.status(400).json({error:"Ένα ή περισσότερα προϊόντα δεν είναι ενεργά στον Master Catalog."});
    if(stores.length!==storeIds.length)return res.status(400).json({error:"Ένα ή περισσότερα καταστήματα δεν είναι ενεργά."});
    const byCompany=new Map();for(const store of stores){const list=byCompany.get(store.companyId)||[];list.push(store);byCompany.set(store.companyId,list)}
    let createdProducts=0,activatedMappings=0;
    await prisma.$transaction(async tx=>{
      for(const [companyId,targetStores] of byCompany){
        await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${`platform-dispatch:${companyId}`}))`;
        for(const master of masters){
          const existing=await tx.$queryRaw`SELECT "id","salePrice" FROM "Product" WHERE "companyId"=${companyId} AND "masterProductId"=${master.id} LIMIT 1`;
          let productId=existing[0]?.id;
          if(!productId){
            const categoryId=await ensureCategory(tx,companyId,master.categoryName),subcategoryId=await ensureSubcategory(tx,companyId,categoryId,master.subcategoryName),vatDepartmentId=await ensureVat(tx,companyId,master.vatRate);
            productId=uid();const salePrice=Number(master.defaultRetailPrice||0),costPrice=Number(master.defaultCostPrice||0),vatRate=Number(master.vatRate||0),verified=master.vatVerified===true;
            await tx.$executeRaw`INSERT INTO "Product" ("id","companyId","categoryId","subcategoryId","vatDepartmentId","sku","name","unit","vatRate","vatVerified","salePrice","costPrice","trackStock","active","masterProductId") VALUES (${productId},${companyId},${categoryId},${subcategoryId},${vatDepartmentId},${master.sourceCode},${master.name},'PIECE',${vatRate},${verified},${salePrice},${costPrice},true,true,${master.id})`;
            const barcodes=await tx.$queryRaw`SELECT "barcode" FROM "MasterProductBarcode" WHERE "masterProductId"=${master.id} AND "scanEnabled"=true ORDER BY "barcode"`;
            for(const row of barcodes){const dup=await tx.$queryRaw`SELECT pb."id" FROM "ProductBarcode" pb JOIN "Product" p ON p."id"=pb."productId" WHERE p."companyId"=${companyId} AND pb."barcode"=${row.barcode} LIMIT 1`;if(!dup[0])await tx.$executeRaw`INSERT INTO "ProductBarcode" ("id","productId","barcode","unitMultiplier") VALUES (${uid()},${productId},${row.barcode},1)`}
            createdProducts++;
          }
          const fallback=Number(master.defaultRetailPrice??existing[0]?.salePrice??0);
          for(const store of targetStores){
            const before=await tx.$queryRaw`SELECT "id" FROM "StoreProduct" WHERE "storeId"=${store.id} AND "productId"=${productId} LIMIT 1`;
            await tx.$executeRaw`INSERT INTO "StoreProduct" ("id","storeId","productId","salePrice","active") VALUES (${uid()},${store.id},${productId},${fallback},true) ON CONFLICT ("storeId","productId") DO UPDATE SET "active"=true,"updatedAt"=CURRENT_TIMESTAMP`;
            if(!before[0])activatedMappings++;
          }
        }
      }
      await tx.$executeRaw`INSERT INTO "PlatformBulkCatalogAudit" ("id","actorId","productIdsJson","storeIdsJson","createdProducts","activatedMappings") VALUES (${uid()},${req.user.id},${JSON.stringify(productIds)}::jsonb,${JSON.stringify(storeIds)}::jsonb,${createdProducts},${activatedMappings})`;
    });
    res.json({ok:true,products:masters.length,stores:stores.length,createdProducts,activatedMappings});
  }catch(error){if(error?.name==="ZodError")return res.status(400).json({error:"Ελέγξτε την επιλογή προϊόντων και καταστημάτων.",details:error.issues});next(error)}
});

export default router;
