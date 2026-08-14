import crypto from "crypto";
import {Router} from "express";
import {z} from "zod";
import {prisma} from "../prisma.js";
import {netlinkClient} from "../integrations/netlink/client.js";

const router=Router();
const money=value=>Number(Number(value||0).toFixed(2));
const commissionRate=0.01;
const defaultServiceFee=0.50;
const isTestMode=()=>process.env.NODE_ENV!=="production"&&process.env.NETLINK_TEST_MODE==="true";
const isMockProvider=()=>process.env.NODE_ENV==="test"&&process.env.NETLINK_TEST_MODE==="true"&&process.env.NETLINK_MOCK_PROVIDER==="true";

async function storeFor(req,storeId){
  const store=await prisma.store.findFirst({where:{id:storeId,companyId:req.user.companyId,active:true},select:{id:true,name:true,companyId:true}});
  if(!store){const error=new Error("Δεν βρέθηκε ενεργό κατάστημα.");error.status=404;throw error}
  if(req.user?.tokenType==="STORE_OPERATOR"&&String(req.user.storeId||"")!==String(store.id)){const error=new Error("Η πρόσβαση ισχύει μόνο για το δικό σου κατάστημα.");error.status=403;throw error}
  return store;
}
function providerData(body){return body?.data||body||{}}
function txAmount(body){return money(providerData(body)?.amount)}
function txId(body){return providerData(body)?.transactionId||providerData(body)?.transactionID||null}
function txReference(body){return providerData(body)?.reference||null}

async function loadProduct(req,storeId,productId){
  const rows=await prisma.$queryRaw`SELECT p."id",p."name",p."sku",p."vatRate",p."trackStock",COALESCE(sp."salePrice",p."salePrice") AS "salePrice" FROM "Product" p JOIN "StoreProduct" sp ON sp."productId"=p."id" AND sp."storeId"=${storeId} AND sp."active"=true WHERE p."id"=${productId} AND p."companyId"=${req.user.companyId} AND p."active"=true LIMIT 1`;
  return rows[0]||null;
}
function productDto(row){return row?{id:row.id,name:row.name,sku:row.sku,vatRate:Number(row.vatRate||0),trackStock:Boolean(row.trackStock),salePrice:money(row.salePrice)}:null}

router.get("/status",async(req,res)=>{
  const credentialsConfigured=Boolean(process.env.NETLINK_TOKEN_URL&&process.env.NETLINK_API_BASE&&process.env.NETLINK_CLIENT_ID&&process.env.NETLINK_CLIENT_SECRET&&process.env.NETLINK_USERNAME&&process.env.NETLINK_PASSWORD);
  res.json({moduleKey:"NETLINK_PREPAID",configured:isMockProvider()||credentialsConfigured,provider:isMockProvider()?"MOCK":"NETLINK",executeEnabled:process.env.NETLINK_ENABLE_EXECUTE==="true",testMode:isTestMode(),fiscalGateRequired:!isTestMode(),commissionRate,serviceFeeAmount:defaultServiceFee});
});
router.get("/menu",async(req,res,next)=>{try{res.json(await netlinkClient().menu())}catch(error){next(error)}});

router.get("/stores/:storeId/config",async(req,res,next)=>{
  try{
    const store=await storeFor(req,req.params.storeId);
    const rows=await prisma.$queryRaw`SELECT "saleProductId","serviceFeeProductId","serviceFeeAmount","active","notes" FROM "NetlinkStoreConfig" WHERE "storeId"=${store.id} AND "companyId"=${req.user.companyId} LIMIT 1`;
    const row=rows[0]||null;
    const [saleProduct,serviceFeeProduct]=await Promise.all([row?.saleProductId?loadProduct(req,store.id,row.saleProductId):null,row?.serviceFeeProductId?loadProduct(req,store.id,row.serviceFeeProductId):null]);
    res.json({configured:Boolean(saleProduct&&serviceFeeProduct),storeId:store.id,active:row?.active!==false,saleProduct:productDto(saleProduct),serviceFeeProduct:productDto(serviceFeeProduct),serviceFeeAmount:money(row?.serviceFeeAmount??defaultServiceFee),notes:row?.notes||null});
  }catch(error){next(error)}
});

router.put("/stores/:storeId/config",async(req,res,next)=>{
  try{
    if(!["OWNER","ADMIN","MANAGER"].includes(req.user?.role||""))return res.status(403).json({error:"Απαιτείται δικαίωμα διαχείρισης για ρύθμιση Netlink."});
    const store=await storeFor(req,req.params.storeId);
    const body=z.object({saleProductId:z.string().min(1),serviceFeeProductId:z.string().min(1),serviceFeeAmount:z.coerce.number().min(0).max(100).default(defaultServiceFee),active:z.boolean().default(true),notes:z.string().max(500).optional().nullable()}).parse(req.body||{});
    if(body.saleProductId===body.serviceFeeProductId)return res.status(400).json({error:"Η αξία κάρτας και η παροχή υπηρεσίας πρέπει να έχουν διαφορετικά προϊόντα POS.",code:"NETLINK_PRODUCTS_MUST_DIFFER"});
    const [saleProduct,serviceFeeProduct]=await Promise.all([loadProduct(req,store.id,body.saleProductId),loadProduct(req,store.id,body.serviceFeeProductId)]);
    if(!saleProduct||!serviceFeeProduct)return res.status(400).json({error:"Και τα δύο προϊόντα Netlink πρέπει να είναι ενεργά προϊόντα POS του καταστήματος."});
    if(saleProduct.trackStock||serviceFeeProduct.trackStock)return res.status(400).json({error:"Τα προϊόντα POS για Netlink πρέπει να είναι υπηρεσίες χωρίς παρακολούθηση αποθέματος.",code:"NETLINK_SERVICE_PRODUCTS_MUST_NOT_TRACK_STOCK"});
    await prisma.$executeRaw`INSERT INTO "NetlinkStoreConfig" ("storeId","companyId","saleProductId","serviceFeeProductId","serviceFeeAmount","active","notes") VALUES (${store.id},${req.user.companyId},${body.saleProductId},${body.serviceFeeProductId},${money(body.serviceFeeAmount)},${body.active},${body.notes||null}) ON CONFLICT ("storeId") DO UPDATE SET "companyId"=EXCLUDED."companyId","saleProductId"=EXCLUDED."saleProductId","serviceFeeProductId"=EXCLUDED."serviceFeeProductId","serviceFeeAmount"=EXCLUDED."serviceFeeAmount","active"=EXCLUDED."active","notes"=EXCLUDED."notes","updatedAt"=NOW()`;
    res.json({configured:true,storeId:store.id,active:body.active,saleProduct:productDto(saleProduct),serviceFeeProduct:productDto(serviceFeeProduct),serviceFeeAmount:money(body.serviceFeeAmount),notes:body.notes||null});
  }catch(error){next(error)}
});

const prepareSchema=z.object({storeId:z.string().min(1),productId:z.string().min(1),payload:z.record(z.any()).default({}),requestId:z.string().min(6).max(100).optional()});
router.post("/prepare",async(req,res,next)=>{
  let ledgerId=null;
  try{
    const body=prepareSchema.parse(req.body||{});await storeFor(req,body.storeId);const requestId=body.requestId||crypto.randomUUID();
    const existing=await prisma.$queryRaw`SELECT "id","status" FROM "NetlinkTransaction" WHERE "companyId"=${req.user.companyId} AND "storeId"=${body.storeId} AND "requestId"=${requestId} LIMIT 1`;
    if(existing[0])return res.status(409).json({error:"Η συγκεκριμένη Netlink αίτηση έχει ήδη καταχωρηθεί.",code:"NETLINK_DUPLICATE_REQUEST",transaction:existing[0]});
    ledgerId=crypto.randomUUID();
    await prisma.$executeRaw`INSERT INTO "NetlinkTransaction" ("id","companyId","storeId","requestId","productId","flow","status","operatorId","operatorName") VALUES (${ledgerId},${req.user.companyId},${body.storeId},${requestId},${body.productId},'PREPARE','PREPARING',${req.user.id||null},${req.user.fullName||null})`;
    const result=await netlinkClient().prepare(body.productId,{requestId,payload:body.payload});const amount=txAmount(result),reference=txReference(result);
    await prisma.$executeRaw`UPDATE "NetlinkTransaction" SET "status"='PREPARED',"amount"=${amount},"providerReference"=${reference},"preparedAt"=NOW(),"updatedAt"=NOW() WHERE "id"=${ledgerId}`;
    res.json({requestId,transactionLedgerId:ledgerId,amount,result});
  }catch(error){if(ledgerId)await prisma.$executeRaw`UPDATE "NetlinkTransaction" SET "status"='FAILED',"errorCode"=${error.code||null},"errorMessage"=${String(error.message||"Netlink error").slice(0,500)},"updatedAt"=NOW() WHERE "id"=${ledgerId}`.catch(()=>{});next(error)}
});

const executeSchema=z.object({storeId:z.string().min(1),productId:z.string().min(1),payload:z.record(z.any()).default({}),confirmation:z.record(z.any()).optional(),requestId:z.string().min(6).max(100),paymentMethod:z.enum(["CASH","CARD","IRIS","MIXED"]).optional(),saleId:z.string().min(1),testRun:z.boolean().optional().default(false)});
router.post("/execute",async(req,res,next)=>{
  let ledgerId=null;
  try{
    if(process.env.NETLINK_ENABLE_EXECUTE!=="true")return res.status(409).json({error:"Η εκτέλεση Netlink είναι κλειδωμένη από τη ρύθμιση του server.",code:"NETLINK_EXECUTE_LOCKED"});
    const body=executeSchema.parse(req.body||{});await storeFor(req,body.storeId);const testMode=isTestMode();
    if(body.testRun&&!testMode)return res.status(403).json({error:"Το Netlink test mode δεν επιτρέπεται σε production.",code:"NETLINK_TEST_MODE_FORBIDDEN"});
    if(!testMode)return res.status(409).json({error:"Η παραγωγική έκδοση Netlink θα ενεργοποιηθεί μόνο μετά από server-side επιβεβαίωση φορολογικής απόδειξης.",code:"NETLINK_FISCAL_CONFIRMATION_REQUIRED"});
    const configRows=await prisma.$queryRaw`SELECT "serviceFeeAmount" FROM "NetlinkStoreConfig" WHERE "storeId"=${body.storeId} AND "companyId"=${req.user.companyId} AND "active"=true LIMIT 1`;const serviceFeeAmount=money(configRows[0]?.serviceFeeAmount??defaultServiceFee);
    const sales=await prisma.$queryRaw`SELECT "id","total","status" FROM "Sale" WHERE "id"=${body.saleId} AND "storeId"=${body.storeId} AND "companyId"=${req.user.companyId} LIMIT 1`;const sale=sales[0];
    if(!sale)return res.status(404).json({error:"Δεν βρέθηκε η συνδεδεμένη δοκιμαστική πώληση POS."});
    if(String(sale.status)!=="COMPLETED")return res.status(409).json({error:"Η Netlink δοκιμή επιτρέπεται μόνο αφού ολοκληρωθεί η κανονική πώληση POS.",code:"NETLINK_POS_SALE_NOT_COMPLETED"});
    const existingRows=await prisma.$queryRaw`SELECT "id","status","productId" FROM "NetlinkTransaction" WHERE "companyId"=${req.user.companyId} AND "storeId"=${body.storeId} AND "requestId"=${body.requestId} LIMIT 1`;const existing=existingRows[0]||null;
    if(existing&&existing.status!=="PREPARED")return res.status(409).json({error:"Η συγκεκριμένη Netlink αίτηση έχει ήδη εκτελεστεί ή δεν είναι διαθέσιμη.",code:"NETLINK_DUPLICATE_REQUEST",transaction:existing});
    if(existing&&String(existing.productId)!==String(body.productId))return res.status(409).json({error:"Το προϊόν της εκτέλεσης δεν συμφωνεί με το prepare.",code:"NETLINK_PRODUCT_MISMATCH"});
    ledgerId=existing?.id||crypto.randomUUID();
    if(existing)await prisma.$executeRaw`UPDATE "NetlinkTransaction" SET "saleId"=${body.saleId},"flow"='TEST_PREPARE_EXECUTE',"status"='EXECUTING',"paymentMethod"=${body.paymentMethod||null},"serviceFeeAmount"=${serviceFeeAmount},"updatedAt"=NOW() WHERE "id"=${ledgerId}`;
    else await prisma.$executeRaw`INSERT INTO "NetlinkTransaction" ("id","companyId","storeId","saleId","requestId","productId","flow","status","paymentMethod","serviceFeeAmount","operatorId","operatorName") VALUES (${ledgerId},${req.user.companyId},${body.storeId},${body.saleId},${body.requestId},${body.productId},'TEST_EXECUTE','EXECUTING',${body.paymentMethod||null},${serviceFeeAmount},${req.user.id||null},${req.user.fullName||null})`;
    const result=await netlinkClient().execute(body.productId,{requestId:body.requestId,payload:body.payload,confirmation:body.confirmation});
    const amount=txAmount(result),providerTransactionId=txId(result),reference=txReference(result),commissionAmount=money(amount*commissionRate),customerTotal=money(amount+serviceFeeAmount),saleTotal=money(sale.total),amountNeedsReview=Math.abs(customerTotal-saleTotal)>0.01;
    await prisma.$executeRaw`UPDATE "NetlinkTransaction" SET "status"=${amountNeedsReview?'AMOUNT_REVIEW':'COMPLETED'},"providerTransactionId"=${providerTransactionId},"providerReference"=${reference},"amount"=${amount},"serviceFeeAmount"=${serviceFeeAmount},"customerTotal"=${customerTotal},"commissionRate"=${commissionRate},"commissionAmount"=${commissionAmount},"completedAt"=NOW(),"updatedAt"=NOW(),"errorCode"=${amountNeedsReview?'POS_TOTAL_MISMATCH':null},"errorMessage"=${amountNeedsReview?`Expected POS total ${customerTotal.toFixed(2)} but sale is ${saleTotal.toFixed(2)}`:null} WHERE "id"=${ledgerId}`;
    res.json({testRun:true,requestId:body.requestId,transactionLedgerId:ledgerId,status:amountNeedsReview?"AMOUNT_REVIEW":"COMPLETED",saleId:body.saleId,cardAmount:amount,serviceFeeAmount,customerTotal,saleTotal,commission:{rate:commissionRate,baseAmount:amount,amount:commissionAmount},result});
  }catch(error){if(ledgerId)await prisma.$executeRaw`UPDATE "NetlinkTransaction" SET "status"='FAILED',"errorCode"=${error.code||null},"errorMessage"=${String(error.message||"Netlink error").slice(0,500)},"updatedAt"=NOW() WHERE "id"=${ledgerId}`.catch(()=>{});next(error)}
});

router.get("/transactions",async(req,res,next)=>{try{const query=z.object({storeId:z.string().optional(),limit:z.coerce.number().int().min(1).max(500).default(100)}).parse(req.query);if(query.storeId)await storeFor(req,query.storeId);const rows=await prisma.$queryRaw`SELECT "id","storeId","saleId","requestId","productId","flow","status","providerTransactionId","providerReference","amount","serviceFeeAmount","customerTotal","commissionRate","commissionAmount","paymentMethod","operatorName","preparedAt","completedAt","createdAt","errorCode","errorMessage" FROM "NetlinkTransaction" WHERE "companyId"=${req.user.companyId} AND (${query.storeId||null}::text IS NULL OR "storeId"=${query.storeId||null}) ORDER BY "createdAt" DESC LIMIT ${query.limit}`;res.json({items:rows.map(row=>({...row,amount:row.amount===null?null:money(row.amount),serviceFeeAmount:money(row.serviceFeeAmount),customerTotal:row.customerTotal===null?null:money(row.customerTotal),commissionRate:Number(row.commissionRate||commissionRate),commissionAmount:row.commissionAmount===null?null:money(row.commissionAmount)}))})}catch(error){next(error)}});
router.get("/settlement-summary",async(req,res,next)=>{try{const query=z.object({from:z.coerce.date().optional(),to:z.coerce.date().optional(),storeId:z.string().optional()}).parse(req.query);if(query.storeId)await storeFor(req,query.storeId);const from=query.from||new Date(new Date().getFullYear(),new Date().getMonth(),1),to=query.to||new Date();const rows=await prisma.$queryRaw`SELECT COUNT(*)::int AS "transactions",COALESCE(SUM("amount"),0) AS "grossAmount",COALESCE(SUM("serviceFeeAmount"),0) AS "serviceFees",COALESCE(SUM("customerTotal"),0) AS "customerTotal",COALESCE(SUM("commissionAmount"),0) AS "commissionAmount" FROM "NetlinkTransaction" WHERE "companyId"=${req.user.companyId} AND "status"='COMPLETED' AND "completedAt">=${from} AND "completedAt"<=${to} AND (${query.storeId||null}::text IS NULL OR "storeId"=${query.storeId||null})`;const row=rows[0]||{};res.json({from,to,storeId:query.storeId||null,transactions:Number(row.transactions||0),grossAmount:money(row.grossAmount),serviceFees:money(row.serviceFees),customerTotal:money(row.customerTotal),commissionRate,commissionAmount:money(row.commissionAmount)})}catch(error){next(error)}});
export default router;
