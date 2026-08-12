import {Router} from "express";
import crypto from "crypto";
import {prisma} from "../prisma.js";

const router=Router();
const money=value=>Number(value||0);
let accessSchemaPromise;

async function ensureAccessSchema(){
  if(!accessSchemaPromise){
    accessSchemaPromise=(async()=>{
      await prisma.$executeRawUnsafe(`ALTER TABLE "StoreOperatorCredential" ADD COLUMN IF NOT EXISTS "onlineProductSearch" BOOLEAN NOT NULL DEFAULT FALSE`);
      await prisma.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS "StoreOperatorAudit" ("id" TEXT PRIMARY KEY,"companyId" TEXT NOT NULL,"storeId" TEXT NOT NULL,"operatorId" TEXT,"actorId" TEXT NOT NULL,"eventType" TEXT NOT NULL,"details" JSONB NOT NULL DEFAULT '{}'::jsonb,"createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW())`);
    })().catch(error=>{accessSchemaPromise=undefined;throw error});
  }
  return accessSchemaPromise;
}

function assertStore(req,storeId){
  if(req.user?.tokenType==="STORE_OPERATOR"&&req.user.storeId!==storeId){
    const error=new Error("Η πρόσβαση ισχύει μόνο για το δικό σου κατάστημα.");
    error.status=403;
    throw error;
  }
}

async function storeFor(req,storeId){
  const row=await prisma.store.findFirst({where:{id:storeId,companyId:req.user.companyId,active:true},select:{id:true,name:true,companyId:true}});
  if(!row){const error=new Error("Δεν βρέθηκε ενεργό κατάστημα.");error.status=404;throw error}
  return row;
}

async function onlineAllowed(req,storeId){
  await ensureAccessSchema();
  if(req.user?.tokenType!=="STORE_OPERATOR")return ["SUPER_ADMIN","OWNER","ADMIN","MANAGER"].includes(req.user?.role);
  const rows=await prisma.$queryRaw`SELECT COALESCE("onlineProductSearch",FALSE) AS "allowed" FROM "StoreOperatorCredential" WHERE "id"=${req.user.operatorId||req.user.id} AND "storeId"=${storeId} AND "companyId"=${req.user.companyId} AND "active"=TRUE LIMIT 1`;
  return Boolean(rows[0]?.allowed);
}

router.get("/stores/:storeId/operator-search-permissions",async(req,res,next)=>{
  try{
    await ensureAccessSchema();
    const store=await storeFor(req,req.params.storeId);
    if(!["SUPER_ADMIN","OWNER","ADMIN"].includes(req.user?.role))return res.status(403).json({error:"Απαιτείται δικαίωμα διαχειριστή."});
    const rows=await prisma.$queryRaw`SELECT e."id" AS "employeeId",COALESCE(c."onlineProductSearch",FALSE) AS "onlineProductSearch" FROM "Employee" e LEFT JOIN "StoreOperatorCredential" c ON c."employeeId"=e."id" AND c."storeId"=e."storeId" WHERE e."storeId"=${store.id}`;
    res.json({rows});
  }catch(error){next(error)}
});

router.put("/stores/:storeId/operator-search-permissions/:employeeId",async(req,res,next)=>{
  try{
    await ensureAccessSchema();
    const store=await storeFor(req,req.params.storeId);
    if(!["SUPER_ADMIN","OWNER","ADMIN"].includes(req.user?.role))return res.status(403).json({error:"Απαιτείται δικαίωμα διαχειριστή."});
    const allowed=Boolean(req.body?.onlineProductSearch);
    const rows=await prisma.$queryRaw`UPDATE "StoreOperatorCredential" SET "onlineProductSearch"=${allowed},"updatedAt"=NOW() WHERE "storeId"=${store.id} AND "employeeId"=${req.params.employeeId} RETURNING "id"`;
    if(!rows[0])return res.status(404).json({error:"Δεν υπάρχει ενεργή καρτέλα πρόσβασης για αυτόν τον χειριστή."});
    await prisma.$executeRaw`INSERT INTO "StoreOperatorAudit" ("id","companyId","storeId","operatorId","actorId","eventType","details") VALUES (${crypto.randomUUID()},${store.companyId},${store.id},${rows[0].id},${req.user.id},'OPERATOR_ONLINE_PRODUCT_SEARCH_CHANGED',${JSON.stringify({employeeId:req.params.employeeId,onlineProductSearch:allowed})}::jsonb)`;
    res.json({ok:true,onlineProductSearch:allowed});
  }catch(error){next(error)}
});

router.get("/stores/:storeId/online-product-search",async(req,res,next)=>{
  try{
    assertStore(req,req.params.storeId);
    const store=await storeFor(req,req.params.storeId);
    if(!(await onlineAllowed(req,store.id)))return res.status(403).json({error:"Ο χειριστής δεν έχει δικαίωμα Online αναζήτησης προϊόντων από το BackOffice."});
    const q=String(req.query.q||"").trim();
    if(q.length<3)return res.status(400).json({error:"Χρειάζονται τουλάχιστον 3 χαρακτήρες ή barcode."});
    const like=`%${q}%`;
    const rows=await prisma.$queryRaw`
      SELECT mp."id",mp."name",mp."sourceCode",mp."vatRate",
        COALESCE((SELECT json_agg(mpb."barcode" ORDER BY mpb."barcode") FROM "MasterProductBarcode" mpb WHERE mpb."masterProductId"=mp."id"),'[]') AS "barcodes"
      FROM "MasterProduct" mp
      WHERE mp."active"=TRUE AND (
        mp."sourceCode" ILIKE ${like} OR mp."name" ILIKE ${like} OR EXISTS (
          SELECT 1 FROM "MasterProductBarcode" mpb WHERE mpb."masterProductId"=mp."id" AND mpb."barcode" ILIKE ${like}
        )
      )
      ORDER BY CASE WHEN mp."sourceCode"=${q} OR EXISTS (SELECT 1 FROM "MasterProductBarcode" x WHERE x."masterProductId"=mp."id" AND x."barcode"=${q}) THEN 0 ELSE 1 END,mp."name"
      LIMIT 20`;
    await prisma.$executeRaw`INSERT INTO "StoreOperatorAudit" ("id","companyId","storeId","operatorId","actorId","eventType","details") VALUES (${crypto.randomUUID()},${store.companyId},${store.id},${req.user.operatorId||req.user.id},${req.user.id},'POS_ONLINE_PRODUCT_SEARCH',${JSON.stringify({query:q,resultCount:rows.length})}::jsonb)`;
    res.json({query:q,source:"MASTER_CATALOG",rows:rows.map(row=>({...row,vatRate:money(row.vatRate)}))});
  }catch(error){next(error)}
});

router.get("/stores/:storeId",async(req,res,next)=>{
  try{
    assertStore(req,req.params.storeId);
    const store=await storeFor(req,req.params.storeId);
    const layoutRows=await prisma.$queryRawUnsafe(`SELECT "layoutJson","version","publishedAt" FROM "StorePosLayout" WHERE "storeId"=$1 LIMIT 1`,store.id).catch(()=>[]);
    const products=await prisma.$queryRaw`
      SELECT p."id",p."sku",p."name",p."vatRate",p."masterProductId",resolved_mp."id" AS "resolvedMasterProductId",resolved_mp."sourceCode" AS "masterCode",COALESCE(sp."salePrice",p."salePrice") AS "salePrice",COALESCE(sp."currentStock",0) AS "currentStock",c."name" AS "categoryName",
        COALESCE((SELECT json_agg(pb."barcode" ORDER BY pb."barcode") FROM "ProductBarcode" pb WHERE pb."productId"=p."id"),'[]') AS "barcodes",
        COALESCE((SELECT json_agg(mpb."barcode" ORDER BY mpb."barcode") FROM "MasterProductBarcode" mpb WHERE mpb."masterProductId"=resolved_mp."id"),'[]') AS "masterBarcodes"
      FROM "StoreProduct" sp JOIN "Product" p ON p."id"=sp."productId" AND p."companyId"=${req.user.companyId}
      LEFT JOIN "ProductCategory" c ON c."id"=p."categoryId"
      LEFT JOIN LATERAL (
        SELECT mp."id",mp."sourceCode" FROM "MasterProduct" mp WHERE mp."active"=true AND (
          mp."id"=p."masterProductId" OR (p."sku" IS NOT NULL AND mp."sourceCode"=p."sku") OR (p."sku" IS NOT NULL AND EXISTS (SELECT 1 FROM "MasterProductBarcode" mpb_sku WHERE mpb_sku."masterProductId"=mp."id" AND mpb_sku."barcode"=p."sku")) OR EXISTS (SELECT 1 FROM "MasterProductBarcode" mpb_match JOIN "ProductBarcode" pb_match ON pb_match."productId"=p."id" AND pb_match."barcode"=mpb_match."barcode" WHERE mpb_match."masterProductId"=mp."id") OR (p."name" IS NOT NULL AND mp."name" IS NOT NULL AND lower(btrim(mp."name"))=lower(btrim(p."name")))
        ) ORDER BY CASE WHEN mp."id"=p."masterProductId" THEN 0 WHEN p."sku" IS NOT NULL AND mp."sourceCode"=p."sku" THEN 1 WHEN p."sku" IS NOT NULL AND EXISTS (SELECT 1 FROM "MasterProductBarcode" mpb_sku_rank WHERE mpb_sku_rank."masterProductId"=mp."id" AND mpb_sku_rank."barcode"=p."sku") THEN 2 WHEN EXISTS (SELECT 1 FROM "MasterProductBarcode" mpb_rank JOIN "ProductBarcode" pb_rank ON pb_rank."productId"=p."id" AND pb_rank."barcode"=mpb_rank."barcode" WHERE mpb_rank."masterProductId"=mp."id") THEN 3 ELSE 4 END,mp."id" LIMIT 1
      ) resolved_mp ON true
      WHERE sp."storeId"=${store.id} AND sp."active"=true AND p."active"=true ORDER BY c."name" NULLS LAST,p."name" LIMIT 5000`;
    res.json({store,layout:layoutRows[0]?.layoutJson||null,layoutVersion:Number(layoutRows[0]?.version||0),publishedAt:layoutRows[0]?.publishedAt||null,access:{onlineProductSearch:await onlineAllowed(req,store.id)},products:products.map(row=>({...row,masterProductId:row.resolvedMasterProductId||row.masterProductId||null,sourceCode:row.masterCode||row.sku||null,masterCode:row.masterCode||null,barcodes:[...new Set([...(row.barcodes||[]),...(row.masterBarcodes||[])])],salePrice:money(row.salePrice),currentStock:money(row.currentStock),vatRate:money(row.vatRate)}))});
  }catch(error){next(error)}
});

export default router;
