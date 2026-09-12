import crypto from "crypto";
import {Router} from "express";
import {prisma} from "../prisma.js";
import {ensureStoreIntegrationSchema} from "../store-integration-bootstrap.js";
import {ensureEfoodIntegrationSchema} from "../efood-integration-bootstrap.js";
import {constantTimeSecretEquals,decryptStoreIntegrationValue,encryptStoreIntegrationValue} from "../integrations/store-integration-crypto.js";
import {normalizeEfoodWebhook} from "../integrations/efood/foundation.js";

const router=Router();
const uid=()=>crypto.randomUUID();

async function schemas(){await ensureStoreIntegrationSchema();await ensureEfoodIntegrationSchema()}
function metadata(row){return row?.metadataJson&&typeof row.metadataJson==="object"?row.metadataJson:{}}

export async function recordEfoodWebhookEvent({integration,payload,mode="LOCAL_MOCK",authenticated=true}){
  await schemas();
  const parsed=normalizeEfoodWebhook(payload);
  const config=metadata(integration);
  if(config.vendorId&&parsed.providerStoreId&&String(config.vendorId)!==String(parsed.providerStoreId)){
    throw Object.assign(new Error("Το Vendor/Store ID του webhook δεν αντιστοιχεί στο επιλεγμένο κατάστημα."),{status:409,code:"VENDOR_MISMATCH"});
  }
  if(config.externalPartnerConfigId&&parsed.externalPartnerConfigId&&String(config.externalPartnerConfigId)!==String(parsed.externalPartnerConfigId)){
    throw Object.assign(new Error("Το external_partner_config_id δεν αντιστοιχεί στο επιλεγμένο κατάστημα."),{status:409,code:"PARTNER_CONFIG_MISMATCH"});
  }
  const existing=(await prisma.$queryRaw`SELECT "id","payloadHash","processingStatus" FROM "EfoodWebhookEvent" WHERE "integrationId"=${integration.id} AND "idempotencyKey"=${parsed.idempotencyKey} LIMIT 1`)[0];
  if(existing){
    if(existing.payloadHash===parsed.payloadHash)return {ok:true,id:existing.id,idempotent:true,parsed,processingStatus:existing.processingStatus};
    await prisma.$executeRaw`UPDATE "EfoodWebhookEvent" SET "processingStatus"='CONFLICT',"lastError"='IDEMPOTENCY_HASH_CONFLICT',"processedAt"=NOW() WHERE "id"=${existing.id}`;
    throw Object.assign(new Error("Το ίδιο efood event/order status επαναλήφθηκε με διαφορετικό payload. Δεν έγινε καμία λειτουργική μεταβολή."),{status:409,code:"IDEMPOTENCY_HASH_CONFLICT"});
  }
  const id=uid();
  const processingStatus=parsed.supported?"VALIDATED_ONLY":"IGNORED_UNSUPPORTED_STATUS";
  const payloadEnc=encryptStoreIntegrationValue(payload);
  await prisma.$transaction(async tx=>{
    await tx.$executeRaw`INSERT INTO "EfoodWebhookEvent" ("id","companyId","storeId","integrationId","mode","externalEventId","externalOrderId","externalStatus","providerStoreId","externalPartnerConfigId","idempotencyKey","payloadHash","payloadEnc","authenticated","supported","processingStatus","processedAt") VALUES (${id},${integration.companyId},${integration.storeId},${integration.id},${mode},${parsed.externalEventId},${parsed.externalOrderId},${parsed.status},${parsed.providerStoreId},${parsed.externalPartnerConfigId},${parsed.idempotencyKey},${parsed.payloadHash},${payloadEnc},${Boolean(authenticated)},${parsed.supported},${processingStatus},NOW())`;
    for(const ref of parsed.productRefs){
      const externalProductId=String(ref.externalProductId||ref.externalSku||"").trim();
      if(!externalProductId)continue;
      await tx.$executeRaw`INSERT INTO "EfoodProductMapping" ("id","companyId","storeId","integrationId","externalProductId","externalSku","providerName","status") VALUES (${uid()},${integration.companyId},${integration.storeId},${integration.id},${externalProductId},${ref.externalSku},${ref.name},'UNMATCHED') ON CONFLICT ("integrationId","externalProductId") DO UPDATE SET "externalSku"=COALESCE(EXCLUDED."externalSku","EfoodProductMapping"."externalSku"),"providerName"=COALESCE(EXCLUDED."providerName","EfoodProductMapping"."providerName"),"updatedAt"=NOW()`;
    }
  });
  return {ok:true,id,idempotent:false,parsed,processingStatus};
}

router.post("/pelican/:webhookKey",async(req,res,next)=>{try{
  await schemas();
  const integration=(await prisma.$queryRaw`SELECT "id","companyId","storeId","kind","environment","credentialsEnc","metadataJson","enabled","externalCallsEnabled","sandboxValidatedAt" FROM "StoreIntegrationCredential" WHERE "kind"='EFOOD' AND "webhookKey"=${req.params.webhookKey} LIMIT 1`)[0];
  if(!integration)return res.status(404).json({error:"Δεν βρέθηκε ενεργή διασύνδεση efood."});
  const credentials=decryptStoreIntegrationValue(integration.credentialsEnc);
  const expectedAuthorization=String(credentials.webhookSecret||"");
  if(!expectedAuthorization||!constantTimeSecretEquals(req.get("authorization")||"",expectedAuthorization))return res.status(401).json({error:"Μη έγκυρη εξουσιοδότηση efood webhook."});
  if(integration.environment!=="SANDBOX"||integration.enabled!==true||integration.externalCallsEnabled!==true||!integration.sandboxValidatedAt){
    return res.status(503).json({error:"Η διασύνδεση efood είναι προετοιμασμένη αλλά δεν έχει ενεργοποιηθεί μετά από test vendor και LAB PASS.",code:"EFOOD_FAIL_CLOSED"});
  }
  const result=await recordEfoodWebhookEvent({integration,payload:req.body,mode:"LIVE_WEBHOOK",authenticated:true});
  res.status(result.idempotent?200:202).json({ok:true,idempotent:result.idempotent,eventId:result.id,status:result.parsed.status,processingStatus:result.processingStatus,orderCreated:false,saleCreated:false,stockChanged:false,paymentPosted:false,fiscalExecution:false});
}catch(error){next(error)}});

export default router;
