import crypto from "crypto";
import {Router} from "express";
import {z} from "zod";
import {prisma} from "../prisma.js";
import {auth} from "../middleware/auth.js";

const router=Router();
const kinds=new Set(["MYDATA","VAT_LOOKUP"]);
let schemaPromise;

router.use(auth);
router.use((req,res,next)=>{
  if(req.user?.isSuperAdmin!==true&&req.user?.platformRole!=="SUPER_ADMIN")return res.status(403).json({error:"Απαιτείται πρόσβαση Platform Super Admin."});
  next();
});

function encryptionKey(){
  const source=String(process.env.INTEGRATION_CREDENTIALS_KEY||process.env.PARAMETERS_ENCRYPTION_KEY||"");
  if(!source)throw Object.assign(new Error("Δεν έχει οριστεί το INTEGRATION_CREDENTIALS_KEY στον server."),{status:503});
  return crypto.createHash("sha256").update(source,"utf8").digest();
}
function encryptCredentials(value){
  const iv=crypto.randomBytes(12),cipher=crypto.createCipheriv("aes-256-gcm",encryptionKey(),iv);
  const ciphertext=Buffer.concat([cipher.update(JSON.stringify(value),"utf8"),cipher.final()]);
  return `v1:${iv.toString("base64")}:${cipher.getAuthTag().toString("base64")}:${ciphertext.toString("base64")}`;
}
export function decryptStoreIntegrationCredentials(value){
  const [version,iv,tag,ciphertext]=String(value||"").split(":");
  if(version!=="v1"||!iv||!tag||!ciphertext)throw new Error("Μη έγκυρη κρυπτογραφημένη διασύνδεση.");
  const decipher=crypto.createDecipheriv("aes-256-gcm",encryptionKey(),Buffer.from(iv,"base64"));
  decipher.setAuthTag(Buffer.from(tag,"base64"));
  return JSON.parse(Buffer.concat([decipher.update(Buffer.from(ciphertext,"base64")),decipher.final()]).toString("utf8"));
}
async function ensureSchema(){
  if(!schemaPromise)schemaPromise=(async()=>{
    await prisma.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS "StoreIntegrationCredential" (
      "id" TEXT PRIMARY KEY,"companyId" TEXT NOT NULL,"storeId" TEXT NOT NULL,
      "kind" TEXT NOT NULL CHECK ("kind" IN ('MYDATA','VAT_LOOKUP')),
      "providerName" TEXT NOT NULL,"environment" TEXT NOT NULL DEFAULT 'PRODUCTION',
      "credentialsEnc" TEXT NOT NULL,"accountHint" TEXT,"enabled" BOOLEAN NOT NULL DEFAULT TRUE,
      "updatedBy" TEXT,"createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),"updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE ("storeId","kind"))`);
    await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "StoreIntegrationCredential_company_store_idx" ON "StoreIntegrationCredential" ("companyId","storeId")`);
  })().catch(error=>{schemaPromise=undefined;throw error});
  return schemaPromise;
}
async function context(companyId,storeId){
  const store=await prisma.store.findFirst({where:{id:storeId,companyId},select:{id:true,name:true,companyId:true}});
  if(!store)throw Object.assign(new Error("Δεν βρέθηκε το κατάστημα στον συγκεκριμένο πελάτη."),{status:404});
  return store;
}
const view=row=>({kind:row.kind,providerName:row.providerName,environment:row.environment,configured:true,accountHint:row.accountHint||null,enabled:row.enabled,updatedAt:row.updatedAt});
const bodySchema=z.object({providerName:z.string().trim().min(2).max(120),environment:z.enum(["PRODUCTION","SANDBOX"]).default("PRODUCTION"),accountId:z.string().trim().min(1).max(300),secret:z.string().min(1).max(4000),enabled:z.boolean().default(true)});

router.get("/companies/:companyId/stores/:storeId/integrations",async(req,res,next)=>{try{
  await ensureSchema();const store=await context(req.params.companyId,req.params.storeId);
  const rows=await prisma.$queryRaw`SELECT "kind","providerName","environment","accountHint","enabled","updatedAt" FROM "StoreIntegrationCredential" WHERE "companyId"=${store.companyId} AND "storeId"=${store.id} ORDER BY "kind"`;
  res.json({store:{id:store.id,name:store.name},integrations:rows.map(view)});
}catch(error){next(error)}});

router.put("/companies/:companyId/stores/:storeId/integrations/:kind",async(req,res,next)=>{try{
  await ensureSchema();const kind=String(req.params.kind||"").toUpperCase();if(!kinds.has(kind))return res.status(404).json({error:"Άγνωστος τύπος διασύνδεσης."});
  const store=await context(req.params.companyId,req.params.storeId),body=bodySchema.parse(req.body||{}),id=crypto.randomUUID(),credentialsEnc=encryptCredentials({accountId:body.accountId,secret:body.secret}),hint=`••••${body.accountId.slice(-4)}`;
  const rows=await prisma.$queryRaw`INSERT INTO "StoreIntegrationCredential" ("id","companyId","storeId","kind","providerName","environment","credentialsEnc","accountHint","enabled","updatedBy") VALUES (${id},${store.companyId},${store.id},${kind},${body.providerName},${body.environment},${credentialsEnc},${hint},${body.enabled},${req.user.id||req.user.email||"platform-admin"}) ON CONFLICT ("storeId","kind") DO UPDATE SET "providerName"=EXCLUDED."providerName","environment"=EXCLUDED."environment","credentialsEnc"=EXCLUDED."credentialsEnc","accountHint"=EXCLUDED."accountHint","enabled"=EXCLUDED."enabled","updatedBy"=EXCLUDED."updatedBy","updatedAt"=NOW() RETURNING "kind","providerName","environment","accountHint","enabled","updatedAt"`;
  await prisma.authAudit.create({data:{userId:req.user.id,email:req.user.email||"platform-admin",event:`STORE_INTEGRATION_CONFIGURED:${store.companyId}:${store.id}:${kind}`,success:true,deviceName:req.headers["x-device-name"]||null,userAgent:req.headers["user-agent"]||null,ipAddress:req.ip||null}});
  res.json({ok:true,integration:view(rows[0])});
}catch(error){next(error)}});

router.patch("/companies/:companyId/stores/:storeId/integrations/:kind/status",async(req,res,next)=>{try{
  await ensureSchema();const kind=String(req.params.kind||"").toUpperCase();if(!kinds.has(kind))return res.status(404).json({error:"Άγνωστος τύπος διασύνδεσης."});
  const store=await context(req.params.companyId,req.params.storeId),body=z.object({enabled:z.boolean()}).parse(req.body||{});
  const rows=await prisma.$queryRaw`UPDATE "StoreIntegrationCredential" SET "enabled"=${body.enabled},"updatedBy"=${req.user.id||req.user.email||"platform-admin"},"updatedAt"=NOW() WHERE "companyId"=${store.companyId} AND "storeId"=${store.id} AND "kind"=${kind} RETURNING "kind","providerName","environment","accountHint","enabled","updatedAt"`;
  if(!rows[0])return res.status(404).json({error:"Η διασύνδεση δεν έχει ακόμη ρυθμιστεί."});
  await prisma.authAudit.create({data:{userId:req.user.id,email:req.user.email||"platform-admin",event:`STORE_INTEGRATION_${body.enabled?"ENABLED":"DISABLED"}:${store.companyId}:${store.id}:${kind}`,success:true,deviceName:req.headers["x-device-name"]||null,userAgent:req.headers["user-agent"]||null,ipAddress:req.ip||null}});
  res.json({ok:true,integration:view(rows[0])});
}catch(error){next(error)}});

export default router;
