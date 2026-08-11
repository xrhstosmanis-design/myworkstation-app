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
    await prisma.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS "PlatformBulkPromotionAudit" (
      "id" TEXT PRIMARY KEY,"actorId" TEXT,"promotionType" TEXT NOT NULL,"masterProductIdsJson" JSONB NOT NULL,"storeIdsJson" JSONB NOT NULL,
      "createdPromotions" INTEGER NOT NULL DEFAULT 0,"createdProducts" INTEGER NOT NULL DEFAULT 0,"activatedMappings" INTEGER NOT NULL DEFAULT 0,
      "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW())`);
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
async function ensureTenantProduct(tx,companyId,master,targetStores){
  const existing=await tx.$queryRaw`SELECT "id","salePrice" FROM "Product" WHERE "companyId"=${companyId} AND "masterProductId"=${master.id} LIMIT 1`;
  let productId=existing[0]?.id,createdProduct=false,activatedMappings=0;
  if(!productId){
    const categoryId=await ensureCategory(tx,companyId,master.categoryName),subcategoryId=await ensureSubcategory(tx,companyId,categoryId,master.subcategoryName),vatDepartmentId=await ensureVat(tx,companyId,master.vatRate);
    productId=uid();const salePrice=Number(master.defaultRetailPrice||0),costPrice=Number(master.defaultCostPrice||0),vatRate=Number(master.vatRate||0),verified=master.vatVerified===true;
    await tx.$executeRaw`INSERT INTO "Product" ("id","companyId","categoryId","subcategoryId","vatDepartmentId","sku","name","unit","vatRate","vatVerified","salePrice","costPrice","trackStock","active","masterProductId") VALUES (${productId},${companyId},${categoryId},${subcategoryId},${vatDepartmentId},${master.sourceCode},${master.name},'PIECE',${vatRate},${verified},${salePrice},${costPrice},true,true,${master.id})`;
    const barcodes=await tx.$queryRaw`SELECT "barcode" FROM "MasterProductBarcode" WHERE "masterProductId"=${master.id} AND "scanEnabled"=true ORDER BY "barcode"`;
    for(const row of barcodes){const dup=await tx.$queryRaw`SELECT pb."id" FROM "ProductBarcode" pb JOIN "Product" p ON p."id"=pb."productId" WHERE p."companyId"=${companyId} AND pb."barcode"=${row.barcode} LIMIT 1`;if(!dup[0])await tx.$executeRaw`INSERT INTO "ProductBarcode" ("id","productId","barcode","unitMultiplier") VALUES (${uid()},${productId},${row.barcode},1)`}
    createdProduct=true;
  }
  const fallback=Number(master.defaultRetailPrice??existing[0]?.salePrice??0);
  for(const store of targetStores){
    const before=await tx.$queryRaw`SELECT "id" FROM "StoreProduct" WHERE "storeId"=${store.id} AND "productId"=${productId} LIMIT 1`;
    await tx.$executeRaw`INSERT INTO "StoreProduct" ("id","storeId","productId","salePrice","active") VALUES (${uid()},${store.id},${productId},${fallback},true) ON CONFLICT ("storeId","productId") DO UPDATE SET "active"=true,"updatedAt"=CURRENT_TIMESTAMP`;
    if(!before[0])activatedMappings++;
  }
  const product=(await tx.$queryRaw`SELECT "id","name","salePrice" FROM "Product" WHERE "id"=${productId} LIMIT 1`)[0];
  return {product,createdProduct,activatedMappings};
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
        for(const master of masters){const ensured=await ensureTenantProduct(tx,companyId,master,targetStores);if(ensured.createdProduct)createdProducts++;activatedMappings+=ensured.activatedMappings}
      }
      await tx.$executeRaw`INSERT INTO "PlatformBulkCatalogAudit" ("id","actorId","productIdsJson","storeIdsJson","createdProducts","activatedMappings") VALUES (${uid()},${req.user.id},${JSON.stringify(productIds)}::jsonb,${JSON.stringify(storeIds)}::jsonb,${createdProducts},${activatedMappings})`;
    });
    res.json({ok:true,products:masters.length,stores:stores.length,createdProducts,activatedMappings});
  }catch(error){if(error?.name==="ZodError")return res.status(400).json({error:"Ελέγξτε την επιλογή προϊόντων και καταστημάτων.",details:error.issues});next(error)}
});

const promotionSchema=z.object({
  masterProductIds:z.array(z.string().min(1)).min(1).max(200),storeIds:z.array(z.string().min(1)).min(1).max(200),
  promotionType:z.enum(["LEAFLET","GIFT"]),offerMode:z.enum(["DISCOUNT_PERCENT","FIXED_PRICE"]).default("DISCOUNT_PERCENT"),
  discountPercent:z.coerce.number().min(0).max(100).default(0),offerPrice:z.coerce.number().min(0).nullable().optional(),
  saleQuantity:z.coerce.number().positive().max(9999).default(1),bonusQuantity:z.coerce.number().min(0).max(9999).default(0),
  validFrom:z.string().min(1),validUntil:z.string().nullable().optional(),active:z.boolean().default(true)
}).superRefine((body,ctx)=>{
  if(body.masterProductIds.length*body.storeIds.length>10000)ctx.addIssue({code:z.ZodIssueCode.custom,message:"Επιτρέπονται έως 10.000 συνδυασμοί προϊόν × κατάστημα."});
  if(body.promotionType==="LEAFLET"&&body.offerMode==="FIXED_PRICE"&&(body.offerPrice===null||body.offerPrice===undefined))ctx.addIssue({code:z.ZodIssueCode.custom,path:["offerPrice"],message:"Χρειάζεται τιμή προσφοράς."});
  if(body.promotionType==="GIFT"&&body.bonusQuantity<=0)ctx.addIssue({code:z.ZodIssueCode.custom,path:["bonusQuantity"],message:"Η ποσότητα δώρου πρέπει να είναι μεγαλύτερη από 0."});
});
const asDate=value=>{const d=new Date(value);return Number.isNaN(d.getTime())?null:d};

router.post("/promotions",async(req,res,next)=>{
  try{
    const body=promotionSchema.parse(req.body||{}),productIds=[...new Set(body.masterProductIds)],storeIds=[...new Set(body.storeIds)],validFrom=asDate(body.validFrom),validUntil=body.validUntil?asDate(body.validUntil):null;
    if(!validFrom||body.validUntil&&!validUntil)return res.status(400).json({error:"Μη έγκυρη ημερομηνία προσφοράς."});
    if(validUntil&&validUntil<validFrom)return res.status(400).json({error:"Η λήξη δεν μπορεί να είναι πριν από την έναρξη."});
    const [masters,stores]=await Promise.all([
      prisma.$queryRaw`SELECT "id","sourceCode","name","categoryName","subcategoryName","defaultRetailPrice","defaultCostPrice","vatRate","vatVerified" FROM "MasterProduct" WHERE "id"=ANY(${productIds}::text[]) AND "active"=true`,
      prisma.store.findMany({where:{id:{in:storeIds},active:true},select:{id:true,name:true,companyId:true}})
    ]);
    if(masters.length!==productIds.length)return res.status(400).json({error:"Ένα ή περισσότερα προϊόντα δεν είναι ενεργά στον Master Catalog."});
    if(stores.length!==storeIds.length)return res.status(400).json({error:"Ένα ή περισσότερα καταστήματα δεν είναι ενεργά."});
    const byCompany=new Map();for(const store of stores){const list=byCompany.get(store.companyId)||[];list.push(store);byCompany.set(store.companyId,list)}
    let createdPromotions=0,createdProducts=0,activatedMappings=0;
    await prisma.$transaction(async tx=>{
      for(const [companyId,targetStores] of byCompany){
        for(const master of masters){
          const ensured=await ensureTenantProduct(tx,companyId,master,targetStores);if(ensured.createdProduct)createdProducts++;activatedMappings+=ensured.activatedMappings;
          const product=ensured.product,targetStoreIds=targetStores.map(s=>s.id).sort();
          for(const storeId of targetStoreIds)await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${`platform-promo:${companyId}:${product.id}:${body.promotionType}:${storeId}`}))`;
          if(body.active){
            const overlaps=await tx.$queryRaw`SELECT DISTINCT pr."id",ps."storeId" FROM "PriceCatalogPromotion" pr JOIN "PriceCatalogPromotionStore" ps ON ps."promotionId"=pr."id" AND ps."companyId"=pr."companyId" WHERE pr."companyId"=${companyId} AND pr."productId"=${product.id} AND pr."promotionType"=${body.promotionType} AND pr."active"=true AND ps."storeId"=ANY(${targetStoreIds}::text[]) AND pr."validFrom"<=${validUntil||new Date("9999-12-31T23:59:59.999Z")} AND COALESCE(pr."validUntil",'infinity'::timestamptz)>=${validFrom}`;
            if(overlaps.length){const e=new Error(`Υπάρχει ήδη ενεργή ${body.promotionType==="LEAFLET"?"προσφορά":"ενέργεια δώρου"} για το «${product.name}» σε ${new Set(overlaps.map(x=>x.storeId)).size} επιλεγμένο/α κατάστημα/τα.`);e.status=409;throw e}
          }
          const originalPrice=Number(product.salePrice||0),offerPrice=body.promotionType==="LEAFLET"?(body.offerMode==="FIXED_PRICE"?Number(body.offerPrice):Math.max(0,Number((originalPrice*(1-body.discountPercent/100)).toFixed(4)))):null;
          const discount=body.promotionType==="LEAFLET"&&originalPrice>0?Number((((originalPrice-Number(offerPrice))/originalPrice)*100).toFixed(4)):0,promotionId=uid(),actor=req.user.fullName||req.user.email||"Platform Super Admin";
          await tx.$executeRaw`INSERT INTO "PriceCatalogPromotion" ("id","companyId","productId","promotionType","originalPrice","offerPrice","discountPercent","saleQuantity","bonusQuantity","customerPoints","validFrom","validUntil","active","createdByUserId","createdByName") VALUES (${promotionId},${companyId},${product.id},${body.promotionType},${originalPrice},${offerPrice},${discount},${body.promotionType==="GIFT"?body.saleQuantity:1},${body.promotionType==="GIFT"?body.bonusQuantity:0},0,${validFrom},${validUntil},${body.active},${req.user.id},${actor})`;
          for(const store of targetStores)await tx.$executeRaw`INSERT INTO "PriceCatalogPromotionStore" ("promotionId","companyId","storeId") VALUES (${promotionId},${companyId},${store.id}) ON CONFLICT ("promotionId","storeId") DO NOTHING`;
          createdPromotions++;
        }
      }
      await tx.$executeRaw`INSERT INTO "PlatformBulkPromotionAudit" ("id","actorId","promotionType","masterProductIdsJson","storeIdsJson","createdPromotions","createdProducts","activatedMappings") VALUES (${uid()},${req.user.id},${body.promotionType},${JSON.stringify(productIds)}::jsonb,${JSON.stringify(storeIds)}::jsonb,${createdPromotions},${createdProducts},${activatedMappings})`;
    });
    res.status(201).json({ok:true,createdPromotions,products:masters.length,stores:stores.length,createdProducts,activatedMappings});
  }catch(error){if(error?.name==="ZodError")return res.status(400).json({error:"Ελέγξτε τα στοιχεία της προσφοράς/δώρου.",details:error.issues});next(error)}
});

export default router;
