import crypto from "crypto";
import {Router} from "express";
import {z} from "zod";
import {prisma} from "../prisma.js";
import {auth} from "../middleware/auth.js";
import {ensureStoreIntegrationSchema} from "../store-integration-bootstrap.js";
import {ensureEfoodIntegrationSchema} from "../efood-integration-bootstrap.js";
import {decryptStoreIntegrationValue,encryptStoreIntegrationValue} from "../integrations/store-integration-crypto.js";
import {assertEfoodLabContext,buildEfoodCatalogPreview,buildEfoodOrderRecoveryPreview,buildEfoodPromoPreview,isEfoodLabContext,EFOOD_LAB_COMPANY_NAME,EFOOD_LAB_STORE_NAME} from "../integrations/efood/foundation.js";
import {recordEfoodWebhookEvent} from "./efood-pelican-webhook.js";

const router=Router();
const uid=()=>crypto.randomUUID();
const sha256=value=>crypto.createHash("sha256").update(String(value)).digest("hex");
router.use(auth);
router.use((req,res,next)=>{
  if(req.user?.isSuperAdmin!==true&&req.user?.platformRole!=="SUPER_ADMIN")return res.status(403).json({error:"Απαιτείται πρόσβαση Platform Super Admin."});
  next();
});

async function schemas(){await ensureStoreIntegrationSchema();await ensureEfoodIntegrationSchema()}
async function context(companyId,storeId){
  const store=await prisma.store.findFirst({where:{id:storeId,companyId},select:{id:true,name:true,companyId:true,company:{select:{name:true}}}});
  if(!store)throw Object.assign(new Error("Δεν βρέθηκε το κατάστημα στον συγκεκριμένο πελάτη."),{status:404});
  const companyName=store.company?.name||"";
  return {id:store.id,name:store.name,companyId:store.companyId,companyName,labAllowed:isEfoodLabContext({companyName,storeName:store.name})};
}
function requireEfoodLabStore(store){assertEfoodLabContext({companyName:store.companyName,storeName:store.name});return store}
function safeMetadata(value){return value&&typeof value==="object"&&!Array.isArray(value)?value:{}}
async function expireEfoodWebhookWindow(store){
  await prisma.$executeRaw`UPDATE "StoreIntegrationCredential" SET "enabled"=false,"externalCallsEnabled"=false,"webhookTestClosedReason"='EXPIRED',"updatedAt"=NOW() WHERE "companyId"=${store.companyId} AND "storeId"=${store.id} AND "kind"='EFOOD' AND "webhookTestExpiresAt" IS NOT NULL AND "webhookTestExpiresAt"<=NOW() AND "webhookTestConsumedAt" IS NULL AND ("enabled"=true OR "webhookTestClosedReason" IS NULL)`;
}
async function integrationFor(store,{required=true}={}){
  await expireEfoodWebhookWindow(store);
  const row=(await prisma.$queryRaw`SELECT "id","companyId","storeId","kind","providerName","environment","credentialsEnc","accountHint","enabled","metadataJson","webhookKey","webhookSecretHash","webhookTestOpenedAt","webhookTestExpiresAt","webhookTestConsumedAt","webhookTestClosedReason","webhookTestEventId","externalCallsEnabled","sandboxValidatedAt","updatedAt" FROM "StoreIntegrationCredential" WHERE "companyId"=${store.companyId} AND "storeId"=${store.id} AND "kind"='EFOOD' LIMIT 1`)[0];
  if(!row&&required)throw Object.assign(new Error("Η διασύνδεση efood δεν έχει ακόμη προετοιμαστεί για το LAB."),{status:404});
  return row||null;
}
function webhookTestView(row){
  if(!row)return {status:"LOCKED",accepting:false,secretConfigured:false,oneShot:true,maxTtlSeconds:900};
  const expiresAt=row.webhookTestExpiresAt?new Date(row.webhookTestExpiresAt):null;
  const accepting=Boolean(row.environment==="SANDBOX"&&row.enabled===true&&row.webhookSecretHash&&row.webhookTestOpenedAt&&expiresAt&&expiresAt.getTime()>Date.now()&&!row.webhookTestConsumedAt);
  const status=accepting?"OPEN":row.webhookTestConsumedAt?"CONSUMED":row.webhookTestClosedReason||((expiresAt&&expiresAt.getTime()<=Date.now())?"EXPIRED":"LOCKED");
  return {status,accepting,secretConfigured:Boolean(row.webhookSecretHash),oneShot:true,maxTtlSeconds:900,openedAt:row.webhookTestOpenedAt||null,expiresAt:row.webhookTestExpiresAt||null,consumedAt:row.webhookTestConsumedAt||null,closedReason:row.webhookTestClosedReason||null,eventId:row.webhookTestEventId||null};
}
function view(row){
  if(!row)return null;
  const metadata=safeMetadata(row.metadataJson);
  return {kind:"EFOOD",providerName:row.providerName,environment:row.environment,configured:true,accountHint:row.accountHint||null,enabled:false,updatedAt:row.updatedAt,phase:metadata.phase||"AWAITING_TEST_VENDOR",metadata:{chainId:metadata.chainId||null,vendorId:metadata.vendorId||null,externalPartnerConfigId:metadata.externalPartnerConfigId||null,testScope:metadata.testScope||"MYWORKSTATION_LAB_ONLY"},webhookPath:row.webhookKey?`/api/public/efood/pelican/${row.webhookKey}`:null,webhookTest:webhookTestView(row),externalCallsEnabled:false,sandboxValidated:Boolean(row.sandboxValidatedAt),labOnly:true,orderPostingEnabled:false,stockMutationEnabled:false,paymentPostingEnabled:false,fiscalExecutionEnabled:false};
}
function scopeResponse(store){return {labOnly:true,labAllowed:store.labAllowed,labScope:{companyName:EFOOD_LAB_COMPANY_NAME,storeName:EFOOD_LAB_STORE_NAME},selected:{companyName:store.companyName,storeName:store.name}}}
const optionalText=max=>z.preprocess(value=>String(value??"").trim()||undefined,z.string().max(max).optional());
const bodySchema=z.object({providerName:z.string().trim().min(2).max(120).default("efood / Delivery Hero"),environment:z.enum(["SANDBOX","PRODUCTION"]).default("SANDBOX"),chainId:optionalText(200),vendorId:optionalText(200),externalPartnerConfigId:optionalText(300),clientId:optionalText(500),clientSecret:optionalText(4000)});
const webhookWindowSchema=z.object({ttlSeconds:z.coerce.number().int().min(60).max(900).default(300)}).strict();

router.get("/companies/:companyId/stores/:storeId/efood",async(req,res,next)=>{try{
  await schemas();const store=await context(req.params.companyId,req.params.storeId);
  const integration=store.labAllowed?await integrationFor(store,{required:false}):null;
  res.json({store:{id:store.id,name:store.name,companyName:store.companyName},integration:view(integration),...scopeResponse(store)});
}catch(error){next(error)}});

router.put("/companies/:companyId/stores/:storeId/efood",async(req,res,next)=>{try{
  await schemas();const store=requireEfoodLabStore(await context(req.params.companyId,req.params.storeId)),body=bodySchema.parse(req.body||{});
  if(body.environment!=="SANDBOX")return res.status(409).json({error:"Η παραγωγική efood διασύνδεση παραμένει κλειδωμένη. Επιτρέπεται μόνο προετοιμασία SANDBOX στο MYWORKSTATION LAB έως το test vendor και το LAB PASS."});
  const existing=(await prisma.$queryRaw`SELECT "id","credentialsEnc","webhookKey","metadataJson" FROM "StoreIntegrationCredential" WHERE "companyId"=${store.companyId} AND "storeId"=${store.id} AND "kind"='EFOOD' LIMIT 1`)[0];
  let credentials={};
  if(existing?.credentialsEnc){try{credentials=decryptStoreIntegrationValue(existing.credentialsEnc)}catch(error){throw Object.assign(new Error("Δεν ήταν δυνατή η ασφαλής ανάγνωση των ήδη αποθηκευμένων efood credentials."),{status:503,cause:error})}}
  if(body.clientId)credentials.clientId=body.clientId;
  if(body.clientSecret)credentials.clientSecret=body.clientSecret;
  delete credentials.webhookSecret;
  const previous=safeMetadata(existing?.metadataJson);
  const chainId=body.chainId??previous.chainId??null,vendorId=body.vendorId??previous.vendorId??null,externalPartnerConfigId=body.externalPartnerConfigId??previous.externalPartnerConfigId??null;
  const hasProviderAccess=Boolean(credentials.clientId&&credentials.clientSecret&&vendorId);
  const metadata={chainId,vendorId,externalPartnerConfigId,phase:hasProviderAccess?"CONFIGURED_NOT_VALIDATED":"AWAITING_TEST_VENDOR",integrationMode:"INDIRECT_POS_PELICAN",testScope:"MYWORKSTATION_LAB_ONLY"};
  const id=existing?.id||uid(),webhookKey=existing?.webhookKey||crypto.randomBytes(32).toString("hex"),credentialsEnc=encryptStoreIntegrationValue(credentials),hint=credentials.clientId?`••••${String(credentials.clientId).slice(-4)}`:null,metadataJson=JSON.stringify(metadata);
  const rows=await prisma.$queryRaw`INSERT INTO "StoreIntegrationCredential" ("id","companyId","storeId","kind","providerName","environment","credentialsEnc","accountHint","enabled","metadataJson","webhookKey","externalCallsEnabled","sandboxValidatedAt","webhookTestClosedReason","updatedBy") VALUES (${id},${store.companyId},${store.id},'EFOOD',${body.providerName},'SANDBOX',${credentialsEnc},${hint},false,${metadataJson}::jsonb,${webhookKey},false,NULL,'CONFIG_CHANGED',${req.user.id||req.user.email||"platform-admin"}) ON CONFLICT ("storeId","kind") DO UPDATE SET "providerName"=EXCLUDED."providerName","environment"='SANDBOX',"credentialsEnc"=EXCLUDED."credentialsEnc","accountHint"=EXCLUDED."accountHint","enabled"=false,"metadataJson"=EXCLUDED."metadataJson","webhookKey"=COALESCE("StoreIntegrationCredential"."webhookKey",EXCLUDED."webhookKey"),"externalCallsEnabled"=false,"sandboxValidatedAt"=NULL,"webhookTestOpenedAt"=NULL,"webhookTestExpiresAt"=NULL,"webhookTestConsumedAt"=NULL,"webhookTestClosedReason"='CONFIG_CHANGED',"webhookTestEventId"=NULL,"updatedBy"=EXCLUDED."updatedBy","updatedAt"=NOW() RETURNING "id","companyId","storeId","kind","providerName","environment","accountHint","enabled","metadataJson","webhookKey","webhookSecretHash","webhookTestOpenedAt","webhookTestExpiresAt","webhookTestConsumedAt","webhookTestClosedReason","webhookTestEventId","externalCallsEnabled","sandboxValidatedAt","updatedAt"`;
  await prisma.authAudit.create({data:{userId:req.user.id,email:req.user.email||"platform-admin",event:`STORE_INTEGRATION_PREPARED_LAB_ONLY:${store.companyId}:${store.id}:EFOOD`,success:true,deviceName:req.headers["x-device-name"]||null,userAgent:req.headers["user-agent"]||null,ipAddress:req.ip||null}});
  res.json({ok:true,integration:view(rows[0]),...scopeResponse(store),message:"Η βάση efood/Pelican αποθηκεύτηκε αποκλειστικά στο LAB σε fail-closed SANDBOX κατάσταση. Δεν ενεργοποιήθηκε webhook, παραγγελία, stock, πληρωμή ή φορολογική ροή."});
}catch(error){next(error)}});

router.post("/companies/:companyId/stores/:storeId/efood/webhook-secret",async(req,res,next)=>{try{
  await schemas();const store=requireEfoodLabStore(await context(req.params.companyId,req.params.storeId)),integration=await integrationFor(store);
  if(integration.environment!=="SANDBOX")return res.status(409).json({error:"Το προσωρινό webhook επιτρέπεται μόνο σε SANDBOX."});
  const secret=`mws_lab_${crypto.randomBytes(32).toString("base64url")}`;
  const secretHash=sha256(secret);
  const rows=await prisma.$queryRaw`UPDATE "StoreIntegrationCredential" SET "webhookSecretHash"=${secretHash},"enabled"=false,"externalCallsEnabled"=false,"webhookTestOpenedAt"=NULL,"webhookTestExpiresAt"=NULL,"webhookTestConsumedAt"=NULL,"webhookTestClosedReason"='SECRET_ROTATED',"webhookTestEventId"=NULL,"updatedBy"=${req.user.id||req.user.email||"platform-admin"},"updatedAt"=NOW() WHERE "id"=${integration.id} RETURNING "id","companyId","storeId","kind","providerName","environment","accountHint","enabled","metadataJson","webhookKey","webhookSecretHash","webhookTestOpenedAt","webhookTestExpiresAt","webhookTestConsumedAt","webhookTestClosedReason","webhookTestEventId","externalCallsEnabled","sandboxValidatedAt","updatedAt"`;
  await prisma.authAudit.create({data:{userId:req.user.id,email:req.user.email||"platform-admin",event:`EFOOD_LAB_WEBHOOK_SECRET_ROTATED:${store.companyId}:${store.id}`,success:true,deviceName:req.headers["x-device-name"]||null,userAgent:req.headers["user-agent"]||null,ipAddress:req.ip||null}});
  res.status(201).json({ok:true,secret,authorizationHeader:secret,copyOnce:true,integration:view(rows[0]),...scopeResponse(store),message:"Δημιουργήθηκε νέο ισχυρό Authorization secret. Εμφανίζεται μόνο τώρα και στη βάση αποθηκεύτηκε μόνο SHA-256 hash."});
}catch(error){next(error)}});

router.post("/companies/:companyId/stores/:storeId/efood/webhook-test-window",async(req,res,next)=>{try{
  await schemas();const store=requireEfoodLabStore(await context(req.params.companyId,req.params.storeId)),body=webhookWindowSchema.parse(req.body||{}),integration=await integrationFor(store),config=safeMetadata(integration.metadataJson);
  if(integration.environment!=="SANDBOX")return res.status(409).json({error:"Το προσωρινό webhook επιτρέπεται μόνο σε SANDBOX."});
  if(!integration.webhookSecretHash)return res.status(409).json({error:"Δημιούργησε πρώτα νέο ισχυρό Authorization secret.",code:"EFOOD_TEST_SECRET_REQUIRED"});
  if(!config.vendorId)return res.status(409).json({error:"Συμπλήρωσε πρώτα το Test Vendor / Store ID του efood.",code:"EFOOD_TEST_VENDOR_REQUIRED"});
  const openedAt=new Date(),expiresAt=new Date(openedAt.getTime()+body.ttlSeconds*1000);
  const rows=await prisma.$queryRaw`UPDATE "StoreIntegrationCredential" SET "enabled"=true,"externalCallsEnabled"=false,"webhookTestOpenedAt"=${openedAt},"webhookTestExpiresAt"=${expiresAt},"webhookTestConsumedAt"=NULL,"webhookTestClosedReason"=NULL,"webhookTestEventId"=NULL,"updatedBy"=${req.user.id||req.user.email||"platform-admin"},"updatedAt"=NOW() WHERE "id"=${integration.id} RETURNING "id","companyId","storeId","kind","providerName","environment","accountHint","enabled","metadataJson","webhookKey","webhookSecretHash","webhookTestOpenedAt","webhookTestExpiresAt","webhookTestConsumedAt","webhookTestClosedReason","webhookTestEventId","externalCallsEnabled","sandboxValidatedAt","updatedAt"`;
  await prisma.authAudit.create({data:{userId:req.user.id,email:req.user.email||"platform-admin",event:`EFOOD_LAB_WEBHOOK_TEST_WINDOW_OPENED:${store.companyId}:${store.id}:${body.ttlSeconds}`,success:true,deviceName:req.headers["x-device-name"]||null,userAgent:req.headers["user-agent"]||null,ipAddress:req.ip||null}});
  res.status(201).json({ok:true,integration:view(rows[0]),...scopeResponse(store),ttlSeconds:body.ttlSeconds,expiresAt,oneShot:true,externalCallsEnabled:false,orderPostingEnabled:false,stockMutationEnabled:false,paymentPostingEnabled:false,fiscalExecutionEnabled:false,message:"Άνοιξε προσωρινό one-shot LAB webhook. Θα κλειδώσει στο πρώτο έγκυρο event ή αυτόματα στη λήξη."});
}catch(error){next(error)}});

router.delete("/companies/:companyId/stores/:storeId/efood/webhook-test-window",async(req,res,next)=>{try{
  await schemas();const store=requireEfoodLabStore(await context(req.params.companyId,req.params.storeId)),integration=await integrationFor(store);
  const rows=await prisma.$queryRaw`UPDATE "StoreIntegrationCredential" SET "enabled"=false,"externalCallsEnabled"=false,"webhookTestClosedReason"='MANUAL',"updatedBy"=${req.user.id||req.user.email||"platform-admin"},"updatedAt"=NOW() WHERE "id"=${integration.id} RETURNING "id","companyId","storeId","kind","providerName","environment","accountHint","enabled","metadataJson","webhookKey","webhookSecretHash","webhookTestOpenedAt","webhookTestExpiresAt","webhookTestConsumedAt","webhookTestClosedReason","webhookTestEventId","externalCallsEnabled","sandboxValidatedAt","updatedAt"`;
  await prisma.authAudit.create({data:{userId:req.user.id,email:req.user.email||"platform-admin",event:`EFOOD_LAB_WEBHOOK_TEST_WINDOW_CLOSED:${store.companyId}:${store.id}`,success:true,deviceName:req.headers["x-device-name"]||null,userAgent:req.headers["user-agent"]||null,ipAddress:req.ip||null}});
  res.json({ok:true,integration:view(rows[0]),...scopeResponse(store),message:"Το προσωρινό LAB webhook κλειδώθηκε."});
}catch(error){next(error)}});

router.get("/companies/:companyId/stores/:storeId/efood/readiness",async(req,res,next)=>{try{
  await schemas();const store=requireEfoodLabStore(await context(req.params.companyId,req.params.storeId)),integration=await integrationFor(store),integrationView=view(integration);
  const [events,mappings,previews]=await Promise.all([
    prisma.$queryRaw`SELECT COUNT(*)::int AS "total",COUNT(*) FILTER (WHERE "processingStatus"='CONFLICT')::int AS "conflicts" FROM "EfoodWebhookEvent" WHERE "companyId"=${store.companyId} AND "storeId"=${store.id} AND "integrationId"=${integration.id}`,
    prisma.$queryRaw`SELECT COUNT(*)::int AS "total",COUNT(*) FILTER (WHERE "status"='MATCHED')::int AS "matched",COUNT(*) FILTER (WHERE "status"<>'MATCHED')::int AS "unmatched" FROM "EfoodProductMapping" WHERE "companyId"=${store.companyId} AND "storeId"=${store.id} AND "integrationId"=${integration.id}`,
    prisma.$queryRaw`SELECT COUNT(*)::int AS "total" FROM "EfoodIntegrationPreview" WHERE "companyId"=${store.companyId} AND "storeId"=${store.id} AND "integrationId"=${integration.id}`
  ]);
  res.json({integration:integrationView,events:events[0]||{total:0,conflicts:0},mappings:mappings[0]||{total:0,matched:0,unmatched:0},previews:previews[0]?.total||0,...scopeResponse(store),externalCallsEnabled:false,webhookAcceptingLiveEvents:integrationView.webhookTest.accepting,webhookTest:integrationView.webhookTest,orderPostingEnabled:false,stockMutationEnabled:false,paymentPostingEnabled:false,fiscalExecutionEnabled:false,blocker:integrationView.webhookTest.accepting?"ONE_SHOT_LAB_WEBHOOK_ONLY":"AWAITING_EFOOD_TEST_VENDOR_AND_SANDBOX_PASS"});
}catch(error){next(error)}});

router.get("/companies/:companyId/stores/:storeId/efood/events",async(req,res,next)=>{try{
  await schemas();const store=requireEfoodLabStore(await context(req.params.companyId,req.params.storeId)),integration=await integrationFor(store);
  const rows=await prisma.$queryRaw`SELECT "id","mode","externalEventId","externalOrderId","externalStatus","providerStoreId","externalPartnerConfigId","idempotencyKey","payloadHash","authenticated","supported","processingStatus","lastError","receivedAt","processedAt","expiresAt" FROM "EfoodWebhookEvent" WHERE "companyId"=${store.companyId} AND "storeId"=${store.id} AND "integrationId"=${integration.id} ORDER BY "receivedAt" DESC LIMIT 200`;
  res.json({events:rows,payloadsEncrypted:true,...scopeResponse(store)});
}catch(error){next(error)}});

router.post("/companies/:companyId/stores/:storeId/efood/mock-webhook",async(req,res,next)=>{try{
  await schemas();const store=requireEfoodLabStore(await context(req.params.companyId,req.params.storeId)),integration=await integrationFor(store),payload=z.record(z.unknown()).parse(req.body?.payload??req.body??{});
  const result=await recordEfoodWebhookEvent({integration,payload,mode:"LOCAL_MOCK",authenticated:false});
  await prisma.authAudit.create({data:{userId:req.user.id,email:req.user.email||"platform-admin",event:`EFOOD_LAB_MOCK_WEBHOOK_VALIDATED:${store.companyId}:${store.id}:${result.parsed.status}`,success:true,deviceName:req.headers["x-device-name"]||null,userAgent:req.headers["user-agent"]||null,ipAddress:req.ip||null}});
  res.status(result.idempotent?200:201).json({ok:true,idempotent:result.idempotent,eventId:result.id,status:result.parsed.status,supported:result.parsed.supported,processingStatus:result.processingStatus,labOnly:true,externalCall:false,orderCreated:false,saleCreated:false,stockChanged:false,paymentPosted:false,fiscalExecution:false});
}catch(error){next(error)}});

router.get("/companies/:companyId/stores/:storeId/efood/product-mappings",async(req,res,next)=>{try{
  await schemas();const store=requireEfoodLabStore(await context(req.params.companyId,req.params.storeId)),integration=await integrationFor(store);
  const rows=await prisma.$queryRaw`SELECT m."id",m."externalProductId",m."externalSku",m."providerName",m."productId",m."status",m."notes",m."updatedAt",p."name" AS "productName",p."sku" AS "productSku" FROM "EfoodProductMapping" m LEFT JOIN "Product" p ON p."id"=m."productId" AND p."companyId"=m."companyId" WHERE m."companyId"=${store.companyId} AND m."storeId"=${store.id} AND m."integrationId"=${integration.id} ORDER BY m."status",m."providerName",m."externalProductId"`;
  res.json({mappings:rows,...scopeResponse(store)});
}catch(error){next(error)}});

router.put("/companies/:companyId/stores/:storeId/efood/product-mappings",async(req,res,next)=>{try{
  await schemas();const store=requireEfoodLabStore(await context(req.params.companyId,req.params.storeId)),integration=await integrationFor(store);
  const body=z.object({externalProductId:z.string().trim().min(1).max(300),externalSku:optionalText(300),providerName:optionalText(500),productId:z.preprocess(value=>String(value??"").trim()||null,z.string().max(300).nullable()),notes:optionalText(1000)}).parse(req.body||{});
  if(body.productId){
    const product=(await prisma.$queryRaw`SELECT p."id" FROM "Product" p JOIN "StoreProduct" sp ON sp."productId"=p."id" AND sp."storeId"=${store.id} WHERE p."id"=${body.productId} AND p."companyId"=${store.companyId} LIMIT 1`)[0];
    if(!product)return res.status(404).json({error:"Το προϊόν δεν ανήκει στο MYWORKSTATION LAB / ΕΡΓΑΣΤΗΡΙΟ ΔΟΚΙΜΩΝ."});
  }
  const status=body.productId?"MATCHED":"UNMATCHED";
  const rows=await prisma.$queryRaw`INSERT INTO "EfoodProductMapping" ("id","companyId","storeId","integrationId","externalProductId","externalSku","providerName","productId","status","notes") VALUES (${uid()},${store.companyId},${store.id},${integration.id},${body.externalProductId},${body.externalSku},${body.providerName},${body.productId},${status},${body.notes}) ON CONFLICT ("integrationId","externalProductId") DO UPDATE SET "externalSku"=EXCLUDED."externalSku","providerName"=EXCLUDED."providerName","productId"=EXCLUDED."productId","status"=EXCLUDED."status","notes"=EXCLUDED."notes","updatedAt"=NOW() RETURNING "id","externalProductId","externalSku","providerName","productId","status","notes","updatedAt"`;
  await prisma.authAudit.create({data:{userId:req.user.id,email:req.user.email||"platform-admin",event:`EFOOD_LAB_PRODUCT_MAPPING_${status}:${store.companyId}:${store.id}:${body.externalProductId}`,success:true,deviceName:req.headers["x-device-name"]||null,userAgent:req.headers["user-agent"]||null,ipAddress:req.ip||null}});
  res.json({ok:true,mapping:rows[0],labOnly:true,stockChanged:false,priceChanged:false});
}catch(error){next(error)}});

router.post("/companies/:companyId/stores/:storeId/efood/previews/:kind",async(req,res,next)=>{try{
  await schemas();const store=requireEfoodLabStore(await context(req.params.companyId,req.params.storeId)),integration=await integrationFor(store),metadata=safeMetadata(integration.metadataJson),kind=String(req.params.kind||"").toUpperCase();
  const input={...(req.body||{}),vendorId:req.body?.vendorId||metadata.vendorId,externalPartnerConfigId:req.body?.externalPartnerConfigId||metadata.externalPartnerConfigId,environment:integration.environment};
  const preview=kind==="CATALOG"?buildEfoodCatalogPreview(input):kind==="PROMO"?buildEfoodPromoPreview(input):kind==="ORDERS"?buildEfoodOrderRecoveryPreview(input):null;
  if(!preview)return res.status(404).json({error:"Άγνωστος τύπος efood προεπισκόπησης."});
  const id=uid(),requestJson=JSON.stringify(preview.request);
  await prisma.$executeRaw`INSERT INTO "EfoodIntegrationPreview" ("id","companyId","storeId","integrationId","kind","requestHash","requestJson","externalCall","status","createdByUserId") VALUES (${id},${store.companyId},${store.id},${integration.id},${preview.kind},${preview.requestHash},${requestJson}::jsonb,false,'LOCAL_VALIDATED',${req.user.id||null})`;
  res.status(201).json({ok:true,id,...preview,labOnly:true,orderCreated:false,stockChanged:false,priceChanged:false,promotionChanged:false});
}catch(error){next(error)}});

router.get("/companies/:companyId/stores/:storeId/efood/previews",async(req,res,next)=>{try{
  await schemas();const store=requireEfoodLabStore(await context(req.params.companyId,req.params.storeId)),integration=await integrationFor(store);
  const rows=await prisma.$queryRaw`SELECT "id","kind","requestHash","externalCall","status","createdAt" FROM "EfoodIntegrationPreview" WHERE "companyId"=${store.companyId} AND "storeId"=${store.id} AND "integrationId"=${integration.id} ORDER BY "createdAt" DESC LIMIT 100`;
  res.json({previews:rows,labOnly:true,externalCallsEnabled:false});
}catch(error){next(error)}});

export default router;
