import crypto from "crypto";
import {Router} from "express";
import {z} from "zod";
import {prisma} from "../prisma.js";
import {buildFiscalDryRunEnvelope,canonicalJson,fiscalEnvelopeHash,validateFiscalDryRun} from "../fiscal-bridge-dry-run.js";

const router=Router(),roles=new Set(["SUPER_ADMIN","OWNER","ADMIN"]);
router.use((req,res,next)=>roles.has(req.user?.role)&&req.user?.tokenType!=="STORE_OPERATOR"?next():res.status(403).json({error:"Απαιτείται δικαίωμα Super Admin, Owner ή Admin."}));

let schemaReady;
async function ensureSchema(){
  if(!schemaReady)schemaReady=(async()=>{
    await prisma.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS "FiscalBridgeDryRun" (
      "id" TEXT PRIMARY KEY,
      "companyId" TEXT NOT NULL,
      "storeId" TEXT NOT NULL,
      "saleId" TEXT NOT NULL,
      "terminalPos" TEXT NOT NULL,
      "fiscalDeviceCode" TEXT NOT NULL,
      "schemaVersion" TEXT NOT NULL,
      "idempotencyKey" TEXT NOT NULL,
      "payloadHash" TEXT NOT NULL,
      "payloadJson" JSONB NOT NULL,
      "validationJson" JSONB NOT NULL,
      "status" TEXT NOT NULL DEFAULT 'VALIDATED_ONLY',
      "externalExecution" BOOLEAN NOT NULL DEFAULT FALSE,
      "createdByUserId" TEXT NOT NULL,
      "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE ("companyId","storeId","saleId","schemaVersion"),
      UNIQUE ("idempotencyKey")
    )`);
    await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "FiscalBridgeDryRun_store_created_idx" ON "FiscalBridgeDryRun" ("storeId","createdAt" DESC)`);
  })().catch(error=>{schemaReady=undefined;throw error});
  return schemaReady;
}

function enabled(){return String(process.env.FISCAL_BRIDGE_TEST_MODE||"").toLowerCase()==="true"}
function isSuperAdmin(user){return user?.role==="SUPER_ADMIN"||user?.platformRole==="SUPER_ADMIN"||user?.isSuperAdmin===true}
async function accessibleStore(user,storeId){
  return prisma.store.findFirst({where:{id:storeId,active:true,...(isSuperAdmin(user)?{}:{companyId:user.companyId})},select:{id:true,name:true,companyId:true}})
}

router.get("/fiscal-bridge/test-status",async(req,res,next)=>{try{
  res.json({mode:"DRY_RUN",enabled:enabled(),externalExecution:false,fiscalIssuance:false,capDriverWrite:false,rbsWrite:false,requiredConfirmation:"confirmNoFiscalExecution"});
}catch(error){next(error)}});

router.get("/stores/:storeId/fiscal-bridge/dry-runs",async(req,res,next)=>{try{
  const store=await accessibleStore(req.user,req.params.storeId);if(!store)return res.status(404).json({error:"Δεν βρέθηκε το κατάστημα."});
  await ensureSchema();
  const rows=await prisma.$queryRaw`SELECT "id","saleId","terminalPos","fiscalDeviceCode","schemaVersion","idempotencyKey","payloadHash","validationJson","status","externalExecution","createdAt" FROM "FiscalBridgeDryRun" WHERE "companyId"=${store.companyId} AND "storeId"=${store.id} ORDER BY "createdAt" DESC LIMIT 100`;
  res.json({mode:"DRY_RUN",externalExecution:false,rows});
}catch(error){next(error)}});

router.get("/stores/:storeId/fiscal-bridge/candidates",async(req,res,next)=>{try{
  const store=await accessibleStore(req.user,req.params.storeId);if(!store)return res.status(404).json({error:"Δεν βρέθηκε το κατάστημα."});
  const rows=await prisma.$queryRaw`SELECT s."id",s."occurredAt",s."total",s."source",s."fiscalStatus",r."terminalPos",r."channel",r."fiscalDeviceCode",r."eftposDeviceCode" FROM "Sale" s JOIN LATERAL (SELECT "terminalPos","channel","fiscalDeviceCode","eftposDeviceCode" FROM "PaymentDeviceRouteAttempt" WHERE "companyId"=${store.companyId} AND "storeId"=${store.id} AND "saleId"=s."id" ORDER BY "createdAt" DESC LIMIT 1) r ON TRUE WHERE s."companyId"=${store.companyId} AND s."storeId"=${store.id} AND s."status"='COMPLETED' AND s."fiscalStatus"='NON_FISCAL' ORDER BY s."occurredAt" DESC LIMIT 50`;
  res.json({mode:"DRY_RUN",externalExecution:false,rows});
}catch(error){next(error)}});

router.post("/stores/:storeId/fiscal-bridge/dry-runs",async(req,res,next)=>{try{
  if(!enabled())return res.status(403).json({error:"Το Fiscal Bridge TEST MODE δεν είναι ενεργό.",code:"FISCAL_BRIDGE_TEST_MODE_DISABLED"});
  const body=z.object({saleId:z.string().min(1).max(160),terminalPos:z.string().trim().min(1).max(120),confirmNoFiscalExecution:z.literal(true)}).parse(req.body||{});
  const store=await accessibleStore(req.user,req.params.storeId);if(!store)return res.status(404).json({error:"Δεν βρέθηκε το κατάστημα."});
  await ensureSchema();
  const [sales,lines,payments,routes]=await Promise.all([
    prisma.$queryRaw`SELECT "id","source","status","fiscalStatus","subtotal","discount","total","occurredAt","createdAt" FROM "Sale" WHERE "id"=${body.saleId} AND "companyId"=${store.companyId} AND "storeId"=${store.id} LIMIT 1`,
    prisma.$queryRaw`SELECT "id","productId","description","quantity","unitPrice","discount","vatRate","lineTotal" FROM "SaleLine" WHERE "saleId"=${body.saleId} ORDER BY "id"`,
    prisma.$queryRaw`SELECT "method","amount" FROM "Payment" WHERE "saleId"=${body.saleId} ORDER BY "id"`,
    prisma.$queryRaw`SELECT "terminalPos","channel","fiscalDeviceCode","eftposDeviceCode","role" FROM "PaymentDeviceRouteAttempt" WHERE "companyId"=${store.companyId} AND "storeId"=${store.id} AND "saleId"=${body.saleId} ORDER BY "createdAt" DESC LIMIT 1`
  ]);
  const sale=sales[0],route=routes[0],validation=validateFiscalDryRun({sale,lines,payments,route,terminalPos:body.terminalPos});
  if(!validation.ok)return res.status(409).json({error:"Η προσομοίωση σταμάτησε στους ελέγχους ασφαλείας.",code:"FISCAL_DRY_RUN_VALIDATION_FAILED",validation,externalExecution:false});
  const envelope=buildFiscalDryRunEnvelope({sale,lines,payments,route}),payload=canonicalJson(envelope),payloadHash=fiscalEnvelopeHash(envelope),id=crypto.randomUUID();
  const inserted=await prisma.$executeRaw`INSERT INTO "FiscalBridgeDryRun" ("id","companyId","storeId","saleId","terminalPos","fiscalDeviceCode","schemaVersion","idempotencyKey","payloadHash","payloadJson","validationJson","createdByUserId") VALUES (${id},${store.companyId},${store.id},${sale.id},${route.terminalPos},${route.fiscalDeviceCode},${envelope.schemaVersion},${envelope.idempotencyKey},${payloadHash},${payload}::jsonb,${JSON.stringify(validation)}::jsonb,${req.user.id}) ON CONFLICT ("companyId","storeId","saleId","schemaVersion") DO NOTHING`;
  const rows=await prisma.$queryRaw`SELECT "id","saleId","terminalPos","fiscalDeviceCode","schemaVersion","idempotencyKey","payloadHash","validationJson","status","externalExecution","createdAt" FROM "FiscalBridgeDryRun" WHERE "companyId"=${store.companyId} AND "storeId"=${store.id} AND "saleId"=${sale.id} AND "schemaVersion"=${envelope.schemaVersion} LIMIT 1`;
  res.status(inserted===1?201:200).json({...rows[0],idempotentReplay:inserted!==1,mode:"DRY_RUN",externalExecution:false,fiscalIssuance:false,capDriverWrite:false,rbsWrite:false});
}catch(error){if(error?.name==="ZodError")return res.status(400).json({error:"Μη έγκυρο αίτημα Fiscal Bridge TEST MODE.",details:error.issues});next(error)}});

export default router;
