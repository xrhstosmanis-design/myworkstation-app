import crypto from "crypto";
import {Router} from "express";
import {prisma} from "../prisma.js";

const router=Router();
const uid=()=>crypto.randomUUID();

async function storeFor(req,storeId){
  const store=await prisma.store.findFirst({where:{id:storeId,companyId:req.user.companyId,active:true},select:{id:true,name:true,companyId:true}});
  if(!store){const error=new Error("Δεν βρέθηκε ενεργό κατάστημα.");error.status=404;throw error}
  if(req.user?.tokenType==="STORE_OPERATOR"&&req.user.storeId!==store.id){const error=new Error("Η πρόσβαση ισχύει μόνο για το δικό σου κατάστημα.");error.status=403;throw error}
  return store;
}

async function canOnlineCreate(req,storeId){
  if(req.user?.tokenType!=="STORE_OPERATOR")return true;
  const rows=await prisma.$queryRaw`
    SELECT COALESCE(p."permissions",'{}'::jsonb) AS "permissions",COALESCE(p."posAccess",TRUE) AS "posAccess"
    FROM "StoreOperatorCredential" c
    LEFT JOIN "StoreOperatorProfile" p ON p."storeId"=c."storeId" AND p."employeeId"=c."employeeId"
    WHERE c."id"=${req.user.operatorId||req.user.id} AND c."storeId"=${storeId} AND c."companyId"=${req.user.companyId} AND c."active"=TRUE LIMIT 1`;
  const row=rows[0];if(!row||row.posAccess===false)return false;
  const permissions=row.permissions&&typeof row.permissions==="object"?row.permissions:{};
  return Boolean(permissions.onlineBarcode);
}

async function nextSku(companyId,tx=prisma){
  const rows=await tx.$queryRaw`SELECT COALESCE(MAX(CASE WHEN "sku" ~ '^[0-9]+$' THEN "sku"::bigint END),10000)+1 AS next FROM "Product" WHERE "companyId"=${companyId}`;
  return String(rows[0]?.next||10001);
}

router.post("/stores/:storeId/online-product-create",async(req,res,next)=>{
  try{
    const store=await storeFor(req,req.params.storeId);
    if(!await canOnlineCreate(req,store.id))return res.status(403).json({error:"Δεν έχεις δικαίωμα «Online αναζήτηση barcode (PoS)» από το BackOffice."});
    const body=req.body&&typeof req.body==="object"?req.body:{};
    const barcode=String(body.barcode||"").trim(),name=String(body.name||"").trim().replace(/\s+/g," "),categoryName=String(body.categoryName||"").trim().replace(/\s+/g," ");
    const salePrice=Number(body.salePrice||0),costPrice=Number(body.costPrice||0),vatRate=Number(body.vatRate||0),openingStock=Number(body.openingStock||0),unit=["PIECE","KG","LITER","PACKAGE"].includes(body.unit)?body.unit:"PIECE";
    if(!/^\d{6,18}$/.test(barcode))return res.status(400).json({error:"Βάλε έγκυρο barcode."});
    if(name.length<2||name.length>250)return res.status(400).json({error:"Βάλε έγκυρη περιγραφή είδους."});
    if(!Number.isFinite(salePrice)||salePrice<=0)return res.status(400).json({error:"Η λιανική τιμή πρέπει να είναι μεγαλύτερη από 0 €."});
    if(!Number.isFinite(costPrice)||costPrice<0||!Number.isFinite(vatRate)||vatRate<0||vatRate>100||!Number.isFinite(openingStock)||openingStock<0)return res.status(400).json({error:"Έλεγξε τιμή αγοράς, ΦΠΑ και αρχικό stock."});
    const duplicate=await prisma.$queryRaw`SELECT p."id",p."name" FROM "ProductBarcode" pb JOIN "Product" p ON p."id"=pb."productId" WHERE p."companyId"=${req.user.companyId} AND pb."barcode"=${barcode} LIMIT 1`;
    if(duplicate[0])return res.status(409).json({error:`Το barcode υπάρχει ήδη στο «${duplicate[0].name}».`});
    const productId=uid();let sku="";
    await prisma.$transaction(async tx=>{
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${req.user.companyId+":product-sku"}))`;
      sku=await nextSku(req.user.companyId,tx);
      let categoryId=null;
      if(categoryName){const rows=await tx.$queryRaw`SELECT "id" FROM "ProductCategory" WHERE "companyId"=${req.user.companyId} AND lower(btrim("name"))=lower(btrim(${categoryName})) LIMIT 1`;categoryId=rows[0]?.id||uid();if(!rows[0])await tx.$executeRaw`INSERT INTO "ProductCategory" ("id","companyId","name") VALUES (${categoryId},${req.user.companyId},${categoryName})`}
      await tx.$executeRaw`INSERT INTO "Product" ("id","companyId","categoryId","sku","name","unit","vatRate","vatVerified","salePrice","costPrice","trackStock","active") VALUES (${productId},${req.user.companyId},${categoryId},${sku},${name},${unit},${vatRate},true,${salePrice},${costPrice},true,true)`;
      await tx.$executeRaw`INSERT INTO "ProductBarcode" ("id","productId","barcode","unitMultiplier") VALUES (${uid()},${productId},${barcode},1)`;
      await tx.$executeRaw`INSERT INTO "StoreProduct" ("id","storeId","productId","salePrice","currentStock","active") VALUES (${uid()},${store.id},${productId},${salePrice},${openingStock},true)`;
      await tx.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS "StoreOperatorAudit" ("id" TEXT PRIMARY KEY,"companyId" TEXT NOT NULL,"storeId" TEXT NOT NULL,"operatorId" TEXT,"actorId" TEXT NOT NULL,"eventType" TEXT NOT NULL,"details" JSONB NOT NULL DEFAULT '{}'::jsonb,"createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW())`);
      await tx.$executeRaw`INSERT INTO "StoreOperatorAudit" ("id","companyId","storeId","operatorId","actorId","eventType","details") VALUES (${uid()},${req.user.companyId},${store.id},${req.user.operatorId||req.user.id},${req.user.id},'POS_ONLINE_PRODUCT_CREATE',${JSON.stringify({productId,sku,barcode,name,salePrice,openingStock})}::jsonb)`;
    });
    res.status(201).json({ok:true,id:productId,sku,barcode,name,salePrice,currentStock:openingStock,vatRate,categoryName,unit});
  }catch(error){next(error)}
});

export default router;
