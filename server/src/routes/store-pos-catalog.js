import {Router} from "express";
import crypto from "crypto";
import {prisma} from "../prisma.js";

const router=Router();
const money=value=>Number(value||0);

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
const adminAccess={leftKeys:true,onlineProductSearch:true,transferAmount:true,shiftTransactions:true,allShiftTransactions:true,supplierPayment:true,thirdPartyPayment:true,returnItems:true,changeRetail:true,addBarcode:true,editDescription:true,cash:true,cards:true};
async function operatorAccess(req,storeId){
  if(req.user?.tokenType!=="STORE_OPERATOR")return adminAccess;
  const rows=await prisma.$queryRaw`
    SELECT COALESCE(p."permissions",'{}'::jsonb) AS "permissions",COALESCE(p."posAccess",TRUE) AS "posAccess"
    FROM "StoreOperatorCredential" c
    LEFT JOIN "StoreOperatorProfile" p ON p."storeId"=c."storeId" AND p."employeeId"=c."employeeId"
    WHERE c."id"=${req.user.operatorId||req.user.id} AND c."storeId"=${storeId} AND c."companyId"=${req.user.companyId} AND c."active"=TRUE LIMIT 1`;
  const row=rows[0];
  if(!row||row.posAccess===false){const error=new Error("Ο χειριστής δεν έχει ενεργή πρόσβαση στο POS από το BackOffice.");error.status=403;throw error}
  const p=row.permissions&&typeof row.permissions==="object"?row.permissions:{};
  return {
    leftKeys:Boolean(p.leftKeys),
    onlineProductSearch:Boolean(p.onlineBarcode),
    transferAmount:Boolean(p.transferAmount),
    shiftTransactions:Boolean(p.shiftTransactionsPos),
    allShiftTransactions:Boolean(p.allShiftTransactionsPos),
    supplierPayment:Boolean(p.supplierPayment),
    thirdPartyPayment:Boolean(p.thirdPartyPayment),
    returnItems:Boolean(p.returnItems),
    changeRetail:Boolean(p.changeRetail),
    addBarcode:Boolean(p.addBarcode),
    editDescription:Boolean(p.editDescription),
    cash:Boolean(p.cash),
    cards:Boolean(p.cards)
  };
}
async function audit(req,store,eventType,details={}){
  await prisma.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS "StoreOperatorAudit" ("id" TEXT PRIMARY KEY,"companyId" TEXT NOT NULL,"storeId" TEXT NOT NULL,"operatorId" TEXT,"actorId" TEXT NOT NULL,"eventType" TEXT NOT NULL,"details" JSONB NOT NULL DEFAULT '{}'::jsonb,"createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW())`);
  await prisma.$executeRaw`INSERT INTO "StoreOperatorAudit" ("id","companyId","storeId","operatorId","actorId","eventType","details") VALUES (${crypto.randomUUID()},${store.companyId},${store.id},${req.user.operatorId||req.user.id},${req.user.id},${eventType},${JSON.stringify(details)}::jsonb)`;
}

function requestedPaymentMethods(body={}){
  if(body.paymentMethod==="MIXED")return Array.isArray(body.payments)?body.payments.map(row=>String(row?.method||"").toUpperCase()).filter(Boolean):[];
  return body.paymentMethod?[String(body.paymentMethod).toUpperCase()]:[];
}
function layoutForAccess(rawLayout,access){
  if(!rawLayout||typeof rawLayout!=="object")return rawLayout||null;
  const layout=structuredClone(rawLayout);
  if(Array.isArray(layout.buttons))layout.buttons=layout.buttons.map(button=>{
    const action=String(button?.action||button?.id||"").toUpperCase();
    if(action==="CASH"&&!access.cash)return {...button,visible:false};
    if((action==="CARD"||action==="IRIS")&&!access.cards)return {...button,visible:false};
    if(action==="MIXED"&&(!access.cash||!access.cards))return {...button,visible:false};
    return button;
  });
  return layout;
}

router.use("/stores/:storeId",async(req,res,next)=>{
  try{
    assertStore(req,req.params.storeId);
    const store=await storeFor(req,req.params.storeId);
    const access=await operatorAccess(req,store.id);
    req.storeOperatorAccess=access;
    req.storeOperatorStore=store;
    if(req.method==="POST"&&req.path.endsWith("/checkout")){
      const methods=requestedPaymentMethods(req.body||{});
      const needsCash=methods.includes("CASH");
      const needsCards=methods.includes("CARD")||methods.includes("IRIS");
      if(needsCash&&!access.cash){
        await audit(req,store,"POS_PERMISSION_DENIED",{permission:"cash",action:"CHECKOUT",paymentMethods:methods});
        return res.status(403).json({error:"Ο χειριστής δεν έχει δικαίωμα «Μετρητά» από το BackOffice."});
      }
      if(needsCards&&!access.cards){
        await audit(req,store,"POS_PERMISSION_DENIED",{permission:"cards",action:"CHECKOUT",paymentMethods:methods});
        return res.status(403).json({error:"Ο χειριστής δεν έχει δικαίωμα «Κάρτες» από το BackOffice."});
      }
    }
    if(req.method==="POST"&&/\/sales\/[^/]+\/reverse$/.test(req.path)&&!access.returnItems){
      await audit(req,store,"POS_PERMISSION_DENIED",{permission:"returnItems",action:"SALE_REVERSE",saleId:req.path.split("/").at(-2)||null});
      return res.status(403).json({error:"Ο χειριστής δεν έχει δικαίωμα «Επιστροφή ειδών» από το BackOffice."});
    }
    next();
  }catch(error){next(error)}
});

router.get("/stores/:storeId/online-product-search",async(req,res,next)=>{
  try{
    const store=req.storeOperatorStore||await storeFor(req,req.params.storeId),access=req.storeOperatorAccess||await operatorAccess(req,store.id);
    if(!access.onlineProductSearch)return res.status(403).json({error:"Ο χειριστής δεν έχει δικαίωμα «Online αναζήτηση barcode (PoS)» από το BackOffice."});
    const q=String(req.query.q||"").trim();if(q.length<3)return res.status(400).json({error:"Χρειάζονται τουλάχιστον 3 χαρακτήρες ή barcode."});const like=`%${q}%`;
    const rows=await prisma.$queryRaw`
      SELECT mp."id",mp."name",mp."sourceCode",mp."vatRate",COALESCE((SELECT json_agg(mpb."barcode" ORDER BY mpb."barcode") FROM "MasterProductBarcode" mpb WHERE mpb."masterProductId"=mp."id"),'[]') AS "barcodes"
      FROM "MasterProduct" mp WHERE mp."active"=TRUE AND (mp."sourceCode" ILIKE ${like} OR mp."name" ILIKE ${like} OR EXISTS (SELECT 1 FROM "MasterProductBarcode" mpb WHERE mpb."masterProductId"=mp."id" AND mpb."barcode" ILIKE ${like}))
      ORDER BY CASE WHEN mp."sourceCode"=${q} OR EXISTS (SELECT 1 FROM "MasterProductBarcode" x WHERE x."masterProductId"=mp."id" AND x."barcode"=${q}) THEN 0 ELSE 1 END,mp."name" LIMIT 20`;
    await audit(req,store,"POS_ONLINE_PRODUCT_SEARCH",{query:q,resultCount:rows.length});
    res.json({query:q,source:"MASTER_CATALOG",rows:rows.map(row=>({...row,vatRate:money(row.vatRate)}))});
  }catch(error){next(error)}
});

router.get("/stores/:storeId",async(req,res,next)=>{
  try{
    const store=req.storeOperatorStore||await storeFor(req,req.params.storeId),access=req.storeOperatorAccess||await operatorAccess(req,store.id);
    const layoutRows=await prisma.$queryRawUnsafe(`SELECT "layoutJson","version","publishedAt" FROM "StorePosLayout" WHERE "storeId"=$1 LIMIT 1`,store.id).catch(()=>[]);
    const layout=layoutForAccess(layoutRows[0]?.layoutJson||null,access);
    const products=await prisma.$queryRaw`
      SELECT p."id",p."sku",p."name",p."vatRate",p."masterProductId",resolved_mp."id" AS "resolvedMasterProductId",resolved_mp."sourceCode" AS "masterCode",COALESCE(sp."salePrice",p."salePrice") AS "salePrice",COALESCE(sp."currentStock",0) AS "currentStock",c."name" AS "categoryName",
        COALESCE((SELECT json_agg(pb."barcode" ORDER BY pb."barcode") FROM "ProductBarcode" pb WHERE pb."productId"=p."id"),'[]') AS "barcodes",COALESCE((SELECT json_agg(mpb."barcode" ORDER BY mpb."barcode") FROM "MasterProductBarcode" mpb WHERE mpb."masterProductId"=resolved_mp."id"),'[]') AS "masterBarcodes"
      FROM "StoreProduct" sp JOIN "Product" p ON p."id"=sp."productId" AND p."companyId"=${req.user.companyId} LEFT JOIN "ProductCategory" c ON c."id"=p."categoryId"
      LEFT JOIN LATERAL (SELECT mp."id",mp."sourceCode" FROM "MasterProduct" mp WHERE mp."active"=true AND (mp."id"=p."masterProductId" OR (p."sku" IS NOT NULL AND mp."sourceCode"=p."sku") OR (p."sku" IS NOT NULL AND EXISTS (SELECT 1 FROM "MasterProductBarcode" z WHERE z."masterProductId"=mp."id" AND z."barcode"=p."sku")) OR EXISTS (SELECT 1 FROM "MasterProductBarcode" mb JOIN "ProductBarcode" pb ON pb."productId"=p."id" AND pb."barcode"=mb."barcode" WHERE mb."masterProductId"=mp."id") OR (p."name" IS NOT NULL AND mp."name" IS NOT NULL AND lower(btrim(mp."name"))=lower(btrim(p."name")))) ORDER BY CASE WHEN mp."id"=p."masterProductId" THEN 0 WHEN p."sku" IS NOT NULL AND mp."sourceCode"=p."sku" THEN 1 ELSE 2 END,mp."id" LIMIT 1) resolved_mp ON true
      WHERE sp."storeId"=${store.id} AND sp."active"=true AND p."active"=true ORDER BY c."name" NULLS LAST,p."name" LIMIT 5000`;
    res.json({store,layout,layoutVersion:Number(layoutRows[0]?.version||0),publishedAt:layoutRows[0]?.publishedAt||null,access,products:products.map(row=>({...row,masterProductId:row.resolvedMasterProductId||row.masterProductId||null,sourceCode:row.masterCode||row.sku||null,masterCode:row.masterCode||null,barcodes:[...new Set([...(row.barcodes||[]),...(row.masterBarcodes||[])])],salePrice:money(row.salePrice),currentStock:money(row.currentStock),vatRate:money(row.vatRate)}))});
  }catch(error){next(error)}
});
export default router;
