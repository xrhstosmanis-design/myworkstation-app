import {assertCustomerDemoOutboundAllowed} from "../customer-demo-runtime.js";
import crypto from "crypto";
import {Router} from "express";
import {prisma} from "../prisma.js";
import {ensureStoreIntegrationSchema} from "../store-integration-bootstrap.js";
import {ensureEfoodIntegrationSchema} from "../efood-integration-bootstrap.js";
import {constantTimeSecretEquals,encryptStoreIntegrationValue} from "../integrations/store-integration-crypto.js";
import {assertEfoodLabContext,normalizeEfoodWebhook} from "../integrations/efood/foundation.js";

const router=Router();
const uid=()=>crypto.randomUUID();
const sha256=value=>crypto.createHash("sha256").update(String(value)).digest("hex");
const productionExecutionLocked=integration=>integration.externalCallsEnabled!==true;
const publicError=(status,code,message)=>Object.assign(new Error(message),{status,code,public:true});

async function schemas(){await ensureStoreIntegrationSchema();await ensureEfoodIntegrationSchema()}
function metadata(row){return row?.metadataJson&&typeof row.metadataJson==="object"?row.metadataJson:{}}
async function ensureEfoodLabIntegrationScope(integration,database=prisma){
  const scope=(await database.$queryRaw`SELECT c."name" AS "companyName",s."name" AS "storeName" FROM "Store" s JOIN "Company" c ON c."id"=s."companyId" WHERE s."id"=${integration.storeId} AND s."companyId"=${integration.companyId} LIMIT 1`)[0];
  if(!scope)throw Object.assign(new Error("Δεν βρέθηκε το LAB scope της διασύνδεσης efood."),{status:404,code:"EFOOD_SCOPE_NOT_FOUND"});
  assertEfoodLabContext(scope);
  return scope;
}

export async function recordEfoodWebhookEvent({integration,payload,mode="LOCAL_MOCK",authenticated=true,database=prisma,captureMappings=true}){
  assertCustomerDemoOutboundAllowed(integration);
  if(database===prisma)await schemas();
  await ensureEfoodLabIntegrationScope(integration,database);
  const parsed=normalizeEfoodWebhook(payload);
  const config=metadata(integration);
  if(config.vendorId&&parsed.providerStoreId&&String(config.vendorId)!==String(parsed.providerStoreId)){
    throw Object.assign(new Error("Το Vendor/Store ID του webhook δεν αντιστοιχεί στο επιλεγμένο LAB."),{status:409,code:"VENDOR_MISMATCH"});
  }
  if(config.externalPartnerConfigId&&parsed.externalPartnerConfigId&&String(config.externalPartnerConfigId)!==String(parsed.externalPartnerConfigId)){
    throw Object.assign(new Error("Το external_partner_config_id δεν αντιστοιχεί στο επιλεγμένο LAB."),{status:409,code:"PARTNER_CONFIG_MISMATCH"});
  }
  const existing=(await database.$queryRaw`SELECT "id","payloadHash","processingStatus" FROM "EfoodWebhookEvent" WHERE "integrationId"=${integration.id} AND "idempotencyKey"=${parsed.idempotencyKey} LIMIT 1`)[0];
  if(existing){
    if(existing.payloadHash===parsed.payloadHash)return {ok:true,id:existing.id,idempotent:true,parsed,processingStatus:existing.processingStatus};
    await database.$executeRaw`UPDATE "EfoodWebhookEvent" SET "processingStatus"='CONFLICT',"lastError"='IDEMPOTENCY_HASH_CONFLICT',"processedAt"=NOW() WHERE "id"=${existing.id}`;
    throw Object.assign(new Error("Το ίδιο efood event/order status επαναλήφθηκε με διαφορετικό payload. Δεν έγινε καμία λειτουργική μεταβολή."),{status:409,code:"IDEMPOTENCY_HASH_CONFLICT"});
  }
  const id=uid();
  const processingStatus=mode==="LAB_WEBHOOK_TEST"?(parsed.supported?"LAB_WEBHOOK_VALIDATED_ONLY":"LAB_WEBHOOK_IGNORED_UNSUPPORTED"):parsed.supported?"VALIDATED_ONLY":"IGNORED_UNSUPPORTED_STATUS";
  const payloadEnc=encryptStoreIntegrationValue(payload);
  const persist=async tx=>{
    await tx.$executeRaw`INSERT INTO "EfoodWebhookEvent" ("id","companyId","storeId","integrationId","mode","externalEventId","externalOrderId","externalStatus","providerStoreId","externalPartnerConfigId","idempotencyKey","payloadHash","payloadEnc","authenticated","supported","processingStatus","processedAt") VALUES (${id},${integration.companyId},${integration.storeId},${integration.id},${mode},${parsed.externalEventId},${parsed.externalOrderId},${parsed.status},${parsed.providerStoreId},${parsed.externalPartnerConfigId},${parsed.idempotencyKey},${parsed.payloadHash},${payloadEnc},${Boolean(authenticated)},${parsed.supported},${processingStatus},NOW())`;
    if(captureMappings){
      for(const ref of parsed.productRefs){
        const externalProductId=String(ref.externalProductId||ref.externalSku||"").trim();
        if(!externalProductId)continue;
        await tx.$executeRaw`INSERT INTO "EfoodProductMapping" ("id","companyId","storeId","integrationId","externalProductId","externalSku","providerName","status") VALUES (${uid()},${integration.companyId},${integration.storeId},${integration.id},${externalProductId},${ref.externalSku},${ref.name},'UNMATCHED') ON CONFLICT ("integrationId","externalProductId") DO UPDATE SET "externalSku"=COALESCE(EXCLUDED."externalSku","EfoodProductMapping"."externalSku"),"providerName"=COALESCE(EXCLUDED."providerName","EfoodProductMapping"."providerName"),"updatedAt"=NOW()`;
      }
    }
  };
  if(database===prisma)await prisma.$transaction(persist);else await persist(database);
  return {ok:true,id,idempotent:false,parsed,processingStatus};
}

router.post("/pelican/:webhookKey",async(req,res,next)=>{try{
  await schemas();
  const suppliedAuthorization=String(req.get("authorization")||"");
  if(!suppliedAuthorization)return res.status(401).json({error:"Λείπει το Authorization secret του προσωρινού LAB webhook.",code:"EFOOD_TEST_SECRET_REQUIRED"});
  const outcome=await prisma.$transaction(async tx=>{
    const integration=(await tx.$queryRaw`SELECT i."id",i."companyId",i."storeId",i."kind",i."environment",i."metadataJson",i."webhookSecretHash",i."enabled",i."externalCallsEnabled",i."sandboxValidatedAt",i."webhookTestOpenedAt",i."webhookTestExpiresAt",i."webhookTestConsumedAt",i."webhookTestClosedReason",i."webhookTestEventId",s."name" AS "storeName",c."name" AS "companyName" FROM "StoreIntegrationCredential" i JOIN "Store" s ON s."id"=i."storeId" AND s."companyId"=i."companyId" JOIN "Company" c ON c."id"=i."companyId" WHERE i."kind"='EFOOD' AND i."webhookKey"=${req.params.webhookKey} LIMIT 1 FOR UPDATE`)[0];
    if(!integration)return {error:publicError(404,"EFOOD_WEBHOOK_NOT_FOUND","Δεν βρέθηκε προσωρινό LAB webhook efood.")};
    assertCustomerDemoOutboundAllowed(integration);
    try{assertEfoodLabContext({companyName:integration.companyName,storeName:integration.storeName})}catch{return {error:publicError(404,"EFOOD_WEBHOOK_NOT_FOUND","Δεν βρέθηκε προσωρινό LAB webhook efood.")}}
    if(integration.environment!=="SANDBOX")return {error:publicError(503,"EFOOD_FAIL_CLOSED","Η παραγωγική efood διασύνδεση παραμένει κλειδωμένη.")};
    if(!productionExecutionLocked(integration))return {error:publicError(503,"EFOOD_FAIL_CLOSED","Οι εξωτερικές efood κλήσεις πρέπει να παραμένουν κλειδωμένες στο LAB.")};
    if(!integration.webhookSecretHash||!constantTimeSecretEquals(sha256(suppliedAuthorization),integration.webhookSecretHash))return {error:publicError(401,"EFOOD_TEST_SECRET_INVALID","Μη έγκυρο Authorization secret efood webhook.")};

    const parsed=normalizeEfoodWebhook(req.body||{});
    const replay=(await tx.$queryRaw`SELECT "id","payloadHash","processingStatus" FROM "EfoodWebhookEvent" WHERE "integrationId"=${integration.id} AND "idempotencyKey"=${parsed.idempotencyKey} LIMIT 1`)[0];
    if(replay){
      if(replay.payloadHash===parsed.payloadHash)return {result:{ok:true,id:replay.id,idempotent:true,parsed,processingStatus:replay.processingStatus},autoLocked:true};
      await tx.$executeRaw`UPDATE "EfoodWebhookEvent" SET "processingStatus"='CONFLICT',"lastError"='IDEMPOTENCY_HASH_CONFLICT',"processedAt"=NOW() WHERE "id"=${replay.id}`;
      return {error:publicError(409,"IDEMPOTENCY_HASH_CONFLICT","Το ίδιο efood event επαναλήφθηκε με διαφορετικό payload. Δεν έγινε καμία λειτουργική μεταβολή.")};
    }

    const expiresAt=integration.webhookTestExpiresAt?new Date(integration.webhookTestExpiresAt):null;
    if(expiresAt&&expiresAt.getTime()<=Date.now()){
      await tx.$executeRaw`UPDATE "StoreIntegrationCredential" SET "enabled"=false,"externalCallsEnabled"=false,"webhookTestClosedReason"='EXPIRED',"updatedAt"=NOW() WHERE "id"=${integration.id}`;
      return {error:publicError(410,"EFOOD_TEST_WINDOW_EXPIRED","Το προσωρινό LAB webhook έληξε και κλειδώθηκε αυτόματα.")};
    }
    if(integration.webhookTestConsumedAt)return {error:publicError(409,"EFOOD_TEST_WINDOW_CONSUMED","Το προσωρινό LAB webhook έχει ήδη χρησιμοποιηθεί και κλειδώθηκε.")};
    if(integration.enabled!==true||!integration.webhookTestOpenedAt||!expiresAt){
      return {error:publicError(503,"EFOOD_FAIL_CLOSED","Η διασύνδεση efood παραμένει κλειδωμένη. Άνοιξε πρώτα το προσωρινό one-shot LAB webhook από τον Super Admin.")};
    }

    const result=await recordEfoodWebhookEvent({integration,payload:req.body||{},mode:"LAB_WEBHOOK_TEST",authenticated:true,database:tx,captureMappings:false});
    await tx.$executeRaw`UPDATE "StoreIntegrationCredential" SET "enabled"=false,"externalCallsEnabled"=false,"sandboxValidatedAt"=COALESCE("sandboxValidatedAt",NOW()),"webhookTestConsumedAt"=NOW(),"webhookTestClosedReason"='CONSUMED',"webhookTestEventId"=${result.id},"updatedAt"=NOW() WHERE "id"=${integration.id}`;
    return {result,autoLocked:true};
  });
  if(outcome.error)throw outcome.error;
  const result=outcome.result;
  res.status(result.idempotent?200:202).json({ok:true,accepted:true,dryRun:true,idempotent:result.idempotent,eventId:result.id,status:result.parsed.status,processingStatus:result.processingStatus,labOnly:true,oneShot:true,windowAutoLocked:outcome.autoLocked===true,externalCall:false,orderCreated:false,saleCreated:false,stockChanged:false,paymentPosted:false,fiscalExecution:false});
}catch(error){
  if(error?.public)return res.status(error.status||500).json({error:error.message,code:error.code});
  next(error);
}});

export default router;
