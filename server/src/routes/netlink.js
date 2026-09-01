import crypto from "crypto";
import {Router} from "express";
import {z} from "zod";
import {prisma} from "../prisma.js";
import {netlinkClient} from "../integrations/netlink/client.js";
import {isNetlinkTestMode} from "../integrations/netlink/environment.js";
import {fiscalReceiptError,validFiscalReceipt} from "../integrations/netlink/fiscal-gate.js";

const router=Router();
const money=value=>Number(Number(value||0).toFixed(2));
const commissionRate=0.01;
const defaultServiceFee=0.50;
const isTestMode=()=>isNetlinkTestMode();
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
    const configRows=await prisma.$queryRaw`SELECT "serviceFeeAmount" FROM "NetlinkStoreConfig" WHERE "storeId"=${body.storeId} AND "companyId"=${req.user.companyId} AND "active"=true LIMIT 1`;const serviceFeeAmount=money(configRows[0]?.serviceFeeAmount??defaultServiceFee);
    const sales=await prisma.$queryRaw`SELECT "id","total","status","fiscalStatus" FROM "Sale" WHERE "id"=${body.saleId} AND "storeId"=${body.storeId} AND "companyId"=${req.user.companyId} LIMIT 1`;const sale=sales[0];
    if(!sale)return res.status(404).json({error:"Δεν βρέθηκε η συνδεδεμένη δοκιμαστική πώληση POS."});
    if(String(sale.status)!=="COMPLETED")return res.status(409).json({error:"Η Netlink δοκιμή επιτρέπεται μόνο αφού ολοκληρωθεί η κανονική πώληση POS.",code:"NETLINK_POS_SALE_NOT_COMPLETED"});
    const fiscalRows=await prisma.$queryRaw`SELECT "id","provider","externalId","fiscalNumber","status","issuedAt","payloadHash" FROM "FiscalDocument" WHERE "saleId"=${body.saleId} LIMIT 1`;const fiscalDocument=fiscalRows[0]||null;
    if(!validFiscalReceipt(fiscalDocument)){const error=fiscalReceiptError();return res.status(error.status).json({error:error.message,code:error.code})}
    const existingRows=await prisma.$queryRaw`SELECT "id","status","productId" FROM "NetlinkTransaction" WHERE "companyId"=${req.user.companyId} AND "storeId"=${body.storeId} AND "requestId"=${body.requestId} LIMIT 1`;const existing=existingRows[0]||null;
    if(existing&&existing.status!=="PREPARED")return res.status(409).json({error:"Η συγκεκριμένη Netlink αίτηση έχει ήδη εκτελεστεί ή δεν είναι διαθέσιμη.",code:"NETLINK_DUPLICATE_REQUEST",transaction:existing});
    if(existing&&String(existing.productId)!==String(body.productId))return res.status(409).json({error:"Το προϊόν της εκτέλεσης δεν συμφωνεί με το prepare.",code:"NETLINK_PRODUCT_MISMATCH"});
    ledgerId=existing?.id||crypto.randomUUID();
    const flow=testMode?'TEST_PREPARE_EXECUTE':'RECEIPT_THEN_EXECUTE';
    if(existing)await prisma.$executeRaw`UPDATE "NetlinkTransaction" SET "saleId"=${body.saleId},"flow"=${flow},"status"='EXECUTING',"paymentMethod"=${body.paymentMethod||null},"serviceFeeAmount"=${serviceFeeAmount},"fiscalDocumentId"=${fiscalDocument.id},"fiscalNumber"=${fiscalDocument.fiscalNumber},"fiscalIssuedAt"=${fiscalDocument.issuedAt},"updatedAt"=NOW() WHERE "id"=${ledgerId}`;
    else await prisma.$executeRaw`INSERT INTO "NetlinkTransaction" ("id","companyId","storeId","saleId","requestId","productId","flow","status","paymentMethod","serviceFeeAmount","operatorId","operatorName","fiscalDocumentId","fiscalNumber","fiscalIssuedAt") VALUES (${ledgerId},${req.user.companyId},${body.storeId},${body.saleId},${body.requestId},${body.productId},${flow},'EXECUTING',${body.paymentMethod||null},${serviceFeeAmount},${req.user.id||null},${req.user.fullName||null},${fiscalDocument.id},${fiscalDocument.fiscalNumber},${fiscalDocument.issuedAt})`;
    const result=await netlinkClient().execute(body.productId,{requestId:body.requestId,payload:body.payload,confirmation:body.confirmation});
    const amount=txAmount(result),providerTransactionId=txId(result),reference=txReference(result),commissionAmount=money(amount*commissionRate),customerTotal=money(amount+serviceFeeAmount),saleTotal=money(sale.total),amountNeedsReview=Math.abs(customerTotal-saleTotal)>0.01;
    await prisma.$executeRaw`UPDATE "NetlinkTransaction" SET "status"=${amountNeedsReview?'AMOUNT_REVIEW':'COMPLETED'},"providerTransactionId"=${providerTransactionId},"providerReference"=${reference},"amount"=${amount},"serviceFeeAmount"=${serviceFeeAmount},"customerTotal"=${customerTotal},"commissionRate"=${commissionRate},"commissionAmount"=${commissionAmount},"completedAt"=NOW(),"updatedAt"=NOW(),"errorCode"=${amountNeedsReview?'POS_TOTAL_MISMATCH':null},"errorMessage"=${amountNeedsReview?`Expected POS total ${customerTotal.toFixed(2)} but sale is ${saleTotal.toFixed(2)}`:null} WHERE "id"=${ledgerId}`;
    res.json({testRun:testMode,requestId:body.requestId,transactionLedgerId:ledgerId,status:amountNeedsReview?"AMOUNT_REVIEW":"COMPLETED",saleId:body.saleId,fiscalReceipt:{id:fiscalDocument.id,number:fiscalDocument.fiscalNumber,issuedAt:fiscalDocument.issuedAt},cardAmount:amount,serviceFeeAmount,customerTotal,saleTotal,commission:{rate:commissionRate,baseAmount:amount,amount:commissionAmount},result});
  }catch(error){if(ledgerId)await prisma.$executeRaw`UPDATE "NetlinkTransaction" SET "status"='FAILED',"errorCode"=${error.code||null},"errorMessage"=${String(error.message||"Netlink error").slice(0,500)},"updatedAt"=NOW() WHERE "id"=${ledgerId}`.catch(()=>{});next(error)}
});

router.get("/transactions",async(req,res,next)=>{try{const query=z.object({storeId:z.string().optional(),limit:z.coerce.number().int().min(1).max(500).default(100)}).parse(req.query);if(query.storeId)await storeFor(req,query.storeId);const rows=await prisma.$queryRaw`SELECT "id","storeId","saleId","requestId","productId","flow","status","providerTransactionId","providerReference","amount","serviceFeeAmount","customerTotal","commissionRate","commissionAmount","paymentMethod","operatorName","preparedAt","completedAt","createdAt","errorCode","errorMessage" FROM "NetlinkTransaction" WHERE "companyId"=${req.user.companyId} AND (${query.storeId||null}::text IS NULL OR "storeId"=${query.storeId||null}) ORDER BY "createdAt" DESC LIMIT ${query.limit}`;res.json({items:rows.map(row=>({...row,amount:row.amount===null?null:money(row.amount),serviceFeeAmount:money(row.serviceFeeAmount),customerTotal:row.customerTotal===null?null:money(row.customerTotal),commissionRate:Number(row.commissionRate||commissionRate),commissionAmount:row.commissionAmount===null?null:money(row.commissionAmount)}))})}catch(error){next(error)}});
router.get("/settlement-summary",async(req,res,next)=>{try{const query=z.object({from:z.coerce.date().optional(),to:z.coerce.date().optional(),storeId:z.string().optional()}).parse(req.query);if(query.storeId)await storeFor(req,query.storeId);const from=query.from||new Date(new Date().getFullYear(),new Date().getMonth(),1),to=query.to||new Date();const rows=await prisma.$queryRaw`SELECT COUNT(*)::int AS "transactions",COALESCE(SUM("amount"),0) AS "grossAmount",COALESCE(SUM("serviceFeeAmount"),0) AS "serviceFees",COALESCE(SUM("customerTotal"),0) AS "customerTotal",COALESCE(SUM("commissionAmount"),0) AS "commissionAmount" FROM "NetlinkTransaction" WHERE "companyId"=${req.user.companyId} AND "status"='COMPLETED' AND "completedAt">=${from} AND "completedAt"<=${to} AND (${query.storeId||null}::text IS NULL OR "storeId"=${query.storeId||null})`;const row=rows[0]||{};res.json({from,to,storeId:query.storeId||null,transactions:Number(row.transactions||0),grossAmount:money(row.grossAmount),serviceFees:money(row.serviceFees),customerTotal:money(row.customerTotal),commissionRate,commissionAmount:money(row.commissionAmount)})}catch(error){next(error)}});

const reportQuery=z.object({storeId:z.string().optional(),from:z.coerce.date().optional(),to:z.coerce.date().optional(),operator:z.string().trim().max(160).optional(),limit:z.coerce.number().int().min(1).max(2000).default(500)});
const dateRange=query=>{const from=query.from||new Date(new Date().setHours(0,0,0,0)),to=query.to||new Date();if(query.to)to.setHours(23,59,59,999);return {from,to}};
const ensureCancellationRequestStorage=async()=>{
  await prisma.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS "NetlinkCancellationRequest" ("id" TEXT PRIMARY KEY,"companyId" TEXT NOT NULL,"storeId" TEXT NOT NULL,"transactionId" TEXT NOT NULL,"status" TEXT NOT NULL DEFAULT 'PENDING_NETLINK',"reason" TEXT NOT NULL,"requestedById" TEXT,"requestedByName" TEXT,"netlinkReference" TEXT,"netlinkResponse" TEXT,"resolvedAt" TIMESTAMPTZ,"createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),"updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW())`);
  await prisma.$executeRawUnsafe(`CREATE UNIQUE INDEX IF NOT EXISTS "NetlinkCancellationRequest_transaction_uq" ON "NetlinkCancellationRequest"("transactionId")`);
  await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "NetlinkCancellationRequest_company_created_idx" ON "NetlinkCancellationRequest"("companyId","createdAt" DESC)`);
};
const reportRows=async(req,query)=>{
  if(query.storeId)await storeFor(req,query.storeId);
  await ensureCancellationRequestStorage();
  const {from,to}=dateRange(query),operator=query.operator||null;
  const rows=await prisma.$queryRaw`SELECT nt."id",nt."storeId",s."name" AS "storeName",nt."saleId",nt."requestId",nt."productId",nt."flow",nt."status",nt."providerTransactionId",nt."providerReference",nt."amount",nt."serviceFeeAmount",nt."customerTotal",nt."commissionAmount",nt."paymentMethod",nt."operatorName",nt."preparedAt",nt."completedAt",nt."createdAt",nt."errorCode",nt."errorMessage",cr."id" AS "cancellationRequestId",cr."status" AS "cancellationStatus",cr."reason" AS "cancellationReason",cr."createdAt" AS "cancellationRequestedAt" FROM "NetlinkTransaction" nt JOIN "Store" s ON s."id"=nt."storeId" LEFT JOIN "NetlinkCancellationRequest" cr ON cr."transactionId"=nt."id" WHERE nt."companyId"=${req.user.companyId} AND nt."createdAt">=${from} AND nt."createdAt"<=${to} AND (${query.storeId||null}::text IS NULL OR nt."storeId"=${query.storeId||null}) AND (${operator}::text IS NULL OR COALESCE(nt."operatorName",'') ILIKE ${operator?`%${operator}%`:null}) ORDER BY nt."createdAt" DESC LIMIT ${query.limit}`;
  return {from,to,items:rows.map(row=>({...row,amount:row.amount===null?null:money(row.amount),serviceFeeAmount:money(row.serviceFeeAmount),customerTotal:row.customerTotal===null?null:money(row.customerTotal),commissionAmount:row.commissionAmount===null?null:money(row.commissionAmount)}))};
};
router.get("/reports/daily",async(req,res,next)=>{try{const result=await reportRows(req,reportQuery.parse(req.query));const completed=result.items.filter(x=>x.status==="COMPLETED");res.json({...result,totals:{transactions:result.items.length,completed:completed.length,cardAmount:money(completed.reduce((sum,x)=>sum+Number(x.amount||0),0)),customerTotal:money(completed.reduce((sum,x)=>sum+Number(x.customerTotal||0),0)),cancellationRequests:result.items.filter(x=>x.cancellationRequestId).length}})}catch(error){next(error)}});
const settlementBreakdown=items=>Object.values(items.filter(x=>x.status==="COMPLETED").reduce((days,item)=>{const day=new Date(item.completedAt||item.createdAt).toISOString().slice(0,10);const current=days[day]||{date:day,transactions:0,grossAmount:0,serviceFees:0,customerTotal:0,commissionAmount:0};current.transactions+=1;current.grossAmount+=Number(item.amount||0);current.serviceFees+=Number(item.serviceFeeAmount||0);current.customerTotal+=Number(item.customerTotal||0);current.commissionAmount+=Number(item.commissionAmount||0);days[day]=current;return days},{})).sort((a,b)=>a.date.localeCompare(b.date)).map(x=>({...x,grossAmount:money(x.grossAmount),serviceFees:money(x.serviceFees),customerTotal:money(x.customerTotal),commissionAmount:money(x.commissionAmount)}));
router.get("/reports/daily-summary",async(req,res,next)=>{try{const result=await reportRows(req,reportQuery.parse(req.query));res.json({...result,days:settlementBreakdown(result.items)})}catch(error){next(error)}});
router.get("/reports/weekly-settlement",async(req,res,next)=>{try{const result=await reportRows(req,reportQuery.parse(req.query));const completed=result.items.filter(x=>x.status==="COMPLETED");res.json({...result,dailyBreakdown:settlementBreakdown(result.items),settlement:{transactions:completed.length,grossAmount:money(completed.reduce((sum,x)=>sum+Number(x.amount||0),0)),serviceFees:money(completed.reduce((sum,x)=>sum+Number(x.serviceFeeAmount||0),0)),customerTotal:money(completed.reduce((sum,x)=>sum+Number(x.customerTotal||0),0)),commissionAmount:money(completed.reduce((sum,x)=>sum+Number(x.commissionAmount||0),0)),providerSettlementAmount:null,variance:null,providerSettlementStatus:"AWAITING_NETLINK_STATEMENT"}})}catch(error){next(error)}});

const cancellationSchema=z.object({transactionId:z.string().min(1),reason:z.string().trim().min(5).max(1000)});
router.post("/cancellation-requests",async(req,res,next)=>{try{
  await ensureCancellationRequestStorage();
  const body=cancellationSchema.parse(req.body||{});
  const rows=await prisma.$queryRaw`SELECT "id","storeId","status","providerTransactionId","providerReference" FROM "NetlinkTransaction" WHERE "id"=${body.transactionId} AND "companyId"=${req.user.companyId} LIMIT 1`;
  const transaction=rows[0];if(!transaction)return res.status(404).json({error:"Δεν βρέθηκε συναλλαγή Netlink."});await storeFor(req,transaction.storeId);
  if(transaction.status!=="COMPLETED")return res.status(409).json({error:"Αίτημα ακύρωσης μπορεί να καταχωριστεί μόνο για ολοκληρωμένη συναλλαγή.",code:"NETLINK_CANCELLATION_TRANSACTION_NOT_COMPLETED"});
  const existing=await prisma.$queryRaw`SELECT "id","status" FROM "NetlinkCancellationRequest" WHERE "transactionId"=${transaction.id} LIMIT 1`;
  if(existing[0])return res.status(409).json({error:"Υπάρχει ήδη αίτημα ακύρωσης για τη συναλλαγή.",code:"NETLINK_CANCELLATION_ALREADY_REQUESTED",request:existing[0]});
  const id=crypto.randomUUID();await prisma.$executeRaw`INSERT INTO "NetlinkCancellationRequest" ("id","companyId","storeId","transactionId","status","reason","requestedById","requestedByName","netlinkReference") VALUES (${id},${req.user.companyId},${transaction.storeId},${transaction.id},'PENDING_NETLINK',${body.reason},${req.user.id||null},${req.user.fullName||null},${transaction.providerReference||transaction.providerTransactionId||null})`;
  res.status(201).json({id,status:"PENDING_NETLINK",transactionId:transaction.id,message:"Το αίτημα καταγράφηκε. Η ακύρωση ολοκληρώνεται μόνο μετά από επιβεβαίωση της Netlink."});
}catch(error){next(error)}});
export default router;
