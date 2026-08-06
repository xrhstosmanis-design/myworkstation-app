import crypto from "crypto";
import {Router} from "express";
import {prisma} from "./prisma.js";

const router=Router();
const MUTATING_METHODS=new Set(["POST","PUT","PATCH","DELETE"]);

export async function ensurePlatformAuditSchema(){
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "PlatformAudit" (
      "id" TEXT NOT NULL,
      "actorUserId" TEXT,
      "actorName" TEXT,
      "actorEmail" TEXT,
      "action" TEXT NOT NULL,
      "targetType" TEXT NOT NULL,
      "targetId" TEXT,
      "targetName" TEXT,
      "details" JSONB NOT NULL DEFAULT '{}'::jsonb,
      "ipAddress" TEXT,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "PlatformAudit_pkey" PRIMARY KEY ("id")
    )
  `);
  await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "PlatformAudit_createdAt_idx" ON "PlatformAudit"("createdAt" DESC)`);
  await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "PlatformAudit_targetId_idx" ON "PlatformAudit"("targetId")`);
  await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "PlatformAudit_action_idx" ON "PlatformAudit"("action")`);
  await prisma.$executeRawUnsafe(`
    INSERT INTO "PlatformAudit" (
      "id","actorName","actorEmail","action","targetType","targetName","details"
    )
    SELECT
      '${crypto.randomUUID()}',
      'MyWorkStation System',
      'system@myworkstation.local',
      'AUDIT_ENABLED',
      'PLATFORM',
      'MyWorkStation Platform Admin',
      '{"message":"Ενεργοποιήθηκε το εμπορικό ιστορικό ενεργειών."}'::jsonb
    WHERE NOT EXISTS (SELECT 1 FROM "PlatformAudit" WHERE "action"='AUDIT_ENABLED')
  `);
}

function companyIdFromPath(path=""){
  return path.match(/^\/companies\/([^/]+)/)?.[1]||null;
}

export function actionFromRequest(req,responsePayload={}){
  const method=String(req.method||"").toUpperCase();
  const path=String(req.path||"");
  const companyId=companyIdFromPath(path);

  if(method==="POST"&&path==="/companies"){
    return {
      action:"CUSTOMER_CREATED",
      targetType:"COMPANY",
      targetId:responsePayload?.company?.id||null,
      targetName:responsePayload?.company?.name||req.body?.companyName||"Νέος πελάτης"
    };
  }
  if(method==="PUT"&&/^\/companies\/[^/]+\/owner$/.test(path)){
    return {action:"OWNER_UPDATED",targetType:"COMPANY",targetId:companyId,targetName:null};
  }
  if(method==="PUT"&&/^\/companies\/[^/]+\/license$/.test(path)){
    return {action:"SUBSCRIPTION_MODULES_UPDATED",targetType:"COMPANY",targetId:companyId,targetName:null};
  }
  if(method==="PATCH"&&/^\/companies\/[^/]+$/.test(path)){
    return {action:"CUSTOMER_STATUS_UPDATED",targetType:"COMPANY",targetId:companyId,targetName:null};
  }
  if(method==="POST"&&/^\/companies\/[^/]+\/reset-owner-password$/.test(path)){
    return {action:"OWNER_PASSWORD_RESET",targetType:"COMPANY",targetId:companyId,targetName:null};
  }
  return null;
}

export function safeAuditDetails(req,responsePayload={}){
  const body=req.body||{};
  const details={};
  const allowed=[
    "companyName","companyEmail","taxId","city","phone","storeName","storeCity",
    "ownerFullName","ownerEmail","fullName","email","plan","licenseStatus",
    "subscriptionStartsAt","subscriptionEndsAt","autoRenew","commercialNotes","active","trialDays"
  ];
  for(const key of allowed){
    if(body[key]!==undefined&&body[key]!=="")details[key]=body[key];
  }
  if(Array.isArray(body.modules)){
    details.modules=body.modules.map(module=>({key:String(module.key||""),active:Boolean(module.active)}));
    details.activeModuleCount=details.modules.filter(module=>module.active).length;
  }
  if(responsePayload?.owner){
    details.owner={
      fullName:responsePayload.owner.fullName||body.ownerFullName||body.fullName||null,
      email:responsePayload.owner.email||body.ownerEmail||body.email||null,
      mustChangePassword:Boolean(responsePayload.owner.mustChangePassword)
    };
  }else if(responsePayload?.fullName||responsePayload?.email){
    details.owner={
      fullName:responsePayload.fullName||body.fullName||null,
      email:responsePayload.email||body.email||null,
      mustChangePassword:Boolean(responsePayload.mustChangePassword)
    };
  }
  if(responsePayload?.store){
    details.store={id:responsePayload.store.id||null,name:responsePayload.store.name||null};
  }
  return details;
}

function ipAddress(req){
  const forwarded=req.headers?.["x-forwarded-for"];
  if(typeof forwarded==="string")return forwarded.split(",")[0].trim().slice(0,120);
  return String(req.ip||req.socket?.remoteAddress||"").slice(0,120)||null;
}

async function resolveTargetName(targetId,fallback){
  if(fallback)return fallback;
  if(!targetId)return null;
  const company=await prisma.company.findUnique({where:{id:targetId},select:{name:true}}).catch(()=>null);
  return company?.name||targetId;
}

async function writeAudit(req,responsePayload){
  const identified=actionFromRequest(req,responsePayload);
  if(!identified)return;
  const targetName=await resolveTargetName(identified.targetId,identified.targetName);
  const details=safeAuditDetails(req,responsePayload);
  await prisma.$executeRaw`
    INSERT INTO "PlatformAudit" (
      "id","actorUserId","actorName","actorEmail","action","targetType",
      "targetId","targetName","details","ipAddress"
    ) VALUES (
      ${crypto.randomUUID()},${req.user?.id||null},${req.user?.fullName||"Platform Super Admin"},
      ${req.user?.email||null},${identified.action},${identified.targetType},
      ${identified.targetId||null},${targetName||null},CAST(${JSON.stringify(details)} AS jsonb),${ipAddress(req)}
    )
  `;
}

export function platformAuditCapture(req,res,next){
  if(!req.user?.isSuperAdmin||!MUTATING_METHODS.has(String(req.method||"").toUpperCase()))return next();
  let responsePayload=null;
  const originalJson=res.json.bind(res);
  res.json=payload=>{
    responsePayload=payload;
    return originalJson(payload);
  };
  res.on("finish",()=>{
    if(res.statusCode>=200&&res.statusCode<300){
      setImmediate(()=>writeAudit(req,responsePayload).catch(error=>console.error("Platform audit write failed",error)));
    }
  });
  next();
}

router.get("/audit",async(req,res,next)=>{
  try{
    if(!req.user?.isSuperAdmin)return res.status(403).json({error:"Απαιτείται Platform Super Admin."});
    const requested=Number(req.query.limit||150);
    const limit=Math.max(1,Math.min(300,Number.isFinite(requested)?requested:150));
    const rows=await prisma.$queryRaw`
      SELECT "id","actorUserId","actorName","actorEmail","action","targetType",
             "targetId","targetName","details","ipAddress","createdAt"
      FROM "PlatformAudit"
      ORDER BY "createdAt" DESC
      LIMIT ${limit}
    `;
    res.json({rows,count:rows.length});
  }catch(error){next(error)}
});

export default router;
