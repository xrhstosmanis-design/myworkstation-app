import crypto from "crypto";
import {Router} from "express";
import {z} from "zod";
import {prisma} from "../prisma.js";
import {netlinkClient} from "../integrations/netlink/client.js";

const router=Router();
const money=value=>Number(Number(value||0).toFixed(2));
const commissionRate=0.01;

async function storeFor(req,storeId){
  const store=await prisma.store.findFirst({where:{id:storeId,companyId:req.user.companyId,active:true},select:{id:true,name:true,companyId:true}});
  if(!store){const error=new Error("Δεν βρέθηκε ενεργό κατάστημα.");error.status=404;throw error}
  if(req.user?.tokenType==="STORE_OPERATOR"&&String(req.user.storeId||"")!==String(store.id)){
    const error=new Error("Η πρόσβαση ισχύει μόνο για το δικό σου κατάστημα.");error.status=403;throw error;
  }
  return store;
}

function providerData(body){return body?.data||body||{}}
function txAmount(body){return money(providerData(body)?.amount)}
function txId(body){return providerData(body)?.transactionId||providerData(body)?.transactionID||null}
function txReference(body){return providerData(body)?.reference||null}

router.get("/status",async(req,res)=>{
  const configured=Boolean(process.env.NETLINK_TOKEN_URL&&process.env.NETLINK_API_BASE&&process.env.NETLINK_CLIENT_ID&&process.env.NETLINK_CLIENT_SECRET&&process.env.NETLINK_USERNAME&&process.env.NETLINK_PASSWORD);
  res.json({moduleKey:"NETLINK_PREPAID",configured,executeEnabled:process.env.NETLINK_ENABLE_EXECUTE==="true",commissionRate});
});

router.get("/menu",async(req,res,next)=>{
  try{res.json(await netlinkClient().menu())}catch(error){next(error)}
});

const prepareSchema=z.object({storeId:z.string().min(1),productId:z.string().min(1),payload:z.record(z.any()).default({}),requestId:z.string().min(6).max(100).optional()});
router.post("/prepare",async(req,res,next)=>{
  let ledgerId=null;
  try{
    const body=prepareSchema.parse(req.body||{});await storeFor(req,body.storeId);
    const requestId=body.requestId||crypto.randomUUID();ledgerId=crypto.randomUUID();
    await prisma.$executeRaw`INSERT INTO "NetlinkTransaction" ("id","companyId","storeId","requestId","productId","flow","status","operatorId","operatorName") VALUES (${ledgerId},${req.user.companyId},${body.storeId},${requestId},${body.productId},'PREPARE','PREPARING',${req.user.id||null},${req.user.fullName||null})`;
    const result=await netlinkClient().prepare(body.productId,{requestId,payload:body.payload});
    const amount=txAmount(result),reference=txReference(result);
    await prisma.$executeRaw`UPDATE "NetlinkTransaction" SET "status"='PREPARED',"amount"=${amount},"providerReference"=${reference},"preparedAt"=NOW(),"updatedAt"=NOW() WHERE "id"=${ledgerId}`;
    res.json({requestId,transactionLedgerId:ledgerId,result});
  }catch(error){
    if(ledgerId)await prisma.$executeRaw`UPDATE "NetlinkTransaction" SET "status"='FAILED',"errorCode"=${error.code||null},"errorMessage"=${String(error.message||"Netlink error").slice(0,500)},"updatedAt"=NOW() WHERE "id"=${ledgerId}`.catch(()=>{});
    next(error);
  }
});

const executeSchema=z.object({storeId:z.string().min(1),productId:z.string().min(1),payload:z.record(z.any()).default({}),confirmation:z.record(z.any()).optional(),requestId:z.string().min(6).max(100),paymentMethod:z.enum(["CASH","CARD","IRIS","MIXED"]).optional(),saleId:z.string().min(1).optional()});
router.post("/execute",async(req,res,next)=>{
  let ledgerId=null;
  try{
    if(process.env.NETLINK_ENABLE_EXECUTE!=="true")return res.status(409).json({error:"Η πραγματική εκτέλεση Netlink παραμένει κλειδωμένη μέχρι να ολοκληρωθεί η σύνδεση με την κανονική πώληση POS.",code:"NETLINK_EXECUTE_LOCKED"});
    const body=executeSchema.parse(req.body||{});await storeFor(req,body.storeId);
    if(!body.saleId)return res.status(400).json({error:"Η Netlink συναλλαγή πρέπει να συνδέεται με κανονική πώληση POS.",code:"NETLINK_SALE_REQUIRED"});
    const sales=await prisma.$queryRaw`SELECT "id","storeId","companyId","total","status" FROM "Sale" WHERE "id"=${body.saleId} AND "storeId"=${body.storeId} AND "companyId"=${req.user.companyId} LIMIT 1`;
    if(!sales[0])return res.status(404).json({error:"Δεν βρέθηκε η συνδεδεμένη πώληση POS."});
    ledgerId=crypto.randomUUID();
    await prisma.$executeRaw`INSERT INTO "NetlinkTransaction" ("id","companyId","storeId","saleId","requestId","productId","flow","status","paymentMethod","operatorId","operatorName") VALUES (${ledgerId},${req.user.companyId},${body.storeId},${body.saleId},${body.requestId},${body.productId},'EXECUTE','EXECUTING',${body.paymentMethod||null},${req.user.id||null},${req.user.fullName||null})`;
    const result=await netlinkClient().execute(body.productId,{requestId:body.requestId,payload:body.payload,confirmation:body.confirmation});
    const amount=txAmount(result),providerTransactionId=txId(result),reference=txReference(result),commissionAmount=money(amount*commissionRate);
    await prisma.$executeRaw`UPDATE "NetlinkTransaction" SET "status"='COMPLETED',"providerTransactionId"=${providerTransactionId},"providerReference"=${reference},"amount"=${amount},"commissionRate"=${commissionRate},"commissionAmount"=${commissionAmount},"completedAt"=NOW(),"updatedAt"=NOW() WHERE "id"=${ledgerId}`;
    res.json({requestId:body.requestId,transactionLedgerId:ledgerId,commission:{rate:commissionRate,amount:commissionAmount},result});
  }catch(error){
    if(ledgerId)await prisma.$executeRaw`UPDATE "NetlinkTransaction" SET "status"='FAILED',"errorCode"=${error.code||null},"errorMessage"=${String(error.message||"Netlink error").slice(0,500)},"updatedAt"=NOW() WHERE "id"=${ledgerId}`.catch(()=>{});
    if(error?.code==="P2002")return res.status(409).json({error:"Η συγκεκριμένη Netlink αίτηση έχει ήδη καταχωρηθεί.",code:"NETLINK_DUPLICATE_REQUEST"});
    next(error);
  }
});

router.get("/transactions",async(req,res,next)=>{
  try{
    const query=z.object({storeId:z.string().optional(),limit:z.coerce.number().int().min(1).max(500).default(100)}).parse(req.query);
    if(query.storeId)await storeFor(req,query.storeId);
    const rows=await prisma.$queryRaw`SELECT "id","storeId","saleId","requestId","productId","flow","status","providerTransactionId","providerReference","amount","commissionRate","commissionAmount","paymentMethod","operatorName","preparedAt","completedAt","createdAt" FROM "NetlinkTransaction" WHERE "companyId"=${req.user.companyId} AND (${query.storeId||null}::text IS NULL OR "storeId"=${query.storeId||null}) ORDER BY "createdAt" DESC LIMIT ${query.limit}`;
    res.json({items:rows.map(row=>({...row,amount:row.amount===null?null:money(row.amount),commissionRate:Number(row.commissionRate||commissionRate),commissionAmount:row.commissionAmount===null?null:money(row.commissionAmount)}))});
  }catch(error){next(error)}
});

router.get("/settlement-summary",async(req,res,next)=>{
  try{
    const query=z.object({from:z.coerce.date().optional(),to:z.coerce.date().optional(),storeId:z.string().optional()}).parse(req.query);
    if(query.storeId)await storeFor(req,query.storeId);
    const from=query.from||new Date(new Date().getFullYear(),new Date().getMonth(),1),to=query.to||new Date();
    const rows=await prisma.$queryRaw`SELECT COUNT(*)::int AS "transactions",COALESCE(SUM("amount"),0) AS "grossAmount",COALESCE(SUM("commissionAmount"),0) AS "commissionAmount" FROM "NetlinkTransaction" WHERE "companyId"=${req.user.companyId} AND "status"='COMPLETED' AND "completedAt">=${from} AND "completedAt"<=${to} AND (${query.storeId||null}::text IS NULL OR "storeId"=${query.storeId||null})`;
    const row=rows[0]||{};res.json({from,to,storeId:query.storeId||null,transactions:Number(row.transactions||0),grossAmount:money(row.grossAmount),commissionRate,commissionAmount:money(row.commissionAmount)});
  }catch(error){next(error)}
});

export default router;
