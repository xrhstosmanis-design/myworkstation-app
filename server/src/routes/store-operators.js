import { Router } from "express";
import bcrypt from "bcryptjs";
import crypto from "crypto";
import jwt from "jsonwebtoken";
import { z } from "zod";
import { prisma } from "../prisma.js";
import { auth } from "../middleware/auth.js";

const router=Router();
let tablesPromise;

const tableStatements=[
  `CREATE TABLE IF NOT EXISTS "StoreOperatorCredential" (
    "id" TEXT PRIMARY KEY,
    "companyId" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'EMPLOYEE',
    "pinHash" TEXT,
    "cardCodeHash" TEXT,
    "cardCodeLast4" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT TRUE,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    "lastLoginAt" TIMESTAMPTZ,
    UNIQUE ("storeId","employeeId")
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "StoreOperatorCredential_card_hash_idx"
   ON "StoreOperatorCredential" ("cardCodeHash") WHERE "cardCodeHash" IS NOT NULL`,
  `CREATE INDEX IF NOT EXISTS "StoreOperatorCredential_store_active_idx"
   ON "StoreOperatorCredential" ("storeId","active")`,
  `CREATE TABLE IF NOT EXISTS "StoreOperatorAudit" (
    "id" TEXT PRIMARY KEY,
    "companyId" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "operatorId" TEXT,
    "actorId" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "details" JSONB NOT NULL DEFAULT '{}'::jsonb,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`,
  `CREATE INDEX IF NOT EXISTS "StoreOperatorAudit_store_created_idx"
   ON "StoreOperatorAudit" ("storeId","createdAt" DESC)`,
  `CREATE TABLE IF NOT EXISTS "StoreOperatorLoginGuard" (
    "id" TEXT PRIMARY KEY,
    "storeId" TEXT NOT NULL,
    "subjectKey" TEXT NOT NULL,
    "failedCount" INTEGER NOT NULL DEFAULT 0,
    "windowStartedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    "lockedUntil" TIMESTAMPTZ,
    "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE ("storeId","subjectKey")
  )`,
  `CREATE INDEX IF NOT EXISTS "StoreOperatorLoginGuard_lock_idx"
   ON "StoreOperatorLoginGuard" ("storeId","lockedUntil")`,
  `CREATE TABLE IF NOT EXISTS "StoreOperatorSession" (
    "id" TEXT PRIMARY KEY,
    "operatorId" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    "lastSeenAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    "expiresAt" TIMESTAMPTZ NOT NULL,
    "revokedAt" TIMESTAMPTZ,
    "userAgent" TEXT,
    "ipAddress" TEXT
  )`,
  `CREATE INDEX IF NOT EXISTS "StoreOperatorSession_operator_active_idx"
   ON "StoreOperatorSession" ("operatorId","expiresAt") WHERE "revokedAt" IS NULL`,
  `CREATE INDEX IF NOT EXISTS "StoreOperatorSession_expiry_idx"
   ON "StoreOperatorSession" ("expiresAt")`
];

async function ensureTables(){
  if(!tablesPromise){
    tablesPromise=(async()=>{
      for(const sql of tableStatements)await prisma.$executeRawUnsafe(sql);
    })().catch(error=>{tablesPromise=undefined;throw error});
  }
  return tablesPromise;
}

function route(handler){
  return async(req,res)=>{
    try{
      await ensureTables();
      await handler(req,res);
    }catch(error){
      console.error("Store Operator Login:",error);
      if(error?.name==="ZodError")return res.status(400).json({error:"Ελέγξτε τα στοιχεία εισόδου.",details:error.issues});
      if(error?.code==="P2010"||error?.code==="23505"||String(error?.message||"").includes("unique constraint")){
        return res.status(409).json({error:"Η κάρτα χρησιμοποιείται ήδη από άλλον εργαζόμενο."});
      }
      return res.status(error?.status||500).json({error:error?.publicMessage||error?.message||"Σφάλμα εισόδου καταστήματος."});
    }
  };
}

function requireAdmin(req,res,next){
  if(!["OWNER","ADMIN"].includes(req.user?.role))return res.status(403).json({error:"Απαιτείται δικαίωμα ιδιοκτήτη ή διαχειριστή."});
  next();
}

function normalizeCard(value){
  return String(value||"").trim().toUpperCase().replace(/[^A-Z0-9]/g,"");
}
function cardHash(value){
  return crypto.createHash("sha256").update(normalizeCard(value)).digest("hex");
}
function loginSubject(kind,value){
  return `${kind}:${crypto.createHash("sha256").update(String(value||"")).digest("hex")}`;
}
async function assertLoginAllowed(storeId,subjectKey){
  const rows=await prisma.$queryRaw`
    SELECT "lockedUntil" FROM "StoreOperatorLoginGuard"
    WHERE "storeId"=${storeId} AND "subjectKey"=${subjectKey} LIMIT 1
  `;
  if(rows[0]?.lockedUntil&&new Date(rows[0].lockedUntil).getTime()>Date.now()){
    const error=new Error("Πολλές αποτυχημένες προσπάθειες. Δοκιμάστε ξανά σε 15 λεπτά.");
    error.status=429;
    throw error;
  }
}
async function recordLoginFailure(storeId,subjectKey){
  const lockUntil=new Date(Date.now()+15*60*1000);
  await prisma.$executeRaw`
    INSERT INTO "StoreOperatorLoginGuard"
      ("id","storeId","subjectKey","failedCount","windowStartedAt","lockedUntil","updatedAt")
    VALUES (${crypto.randomUUID()},${storeId},${subjectKey},1,NOW(),NULL,NOW())
    ON CONFLICT ("storeId","subjectKey") DO UPDATE SET
      "failedCount"=CASE
        WHEN "StoreOperatorLoginGuard"."windowStartedAt"<NOW()-INTERVAL '15 minutes' THEN 1
        ELSE "StoreOperatorLoginGuard"."failedCount"+1
      END,
      "windowStartedAt"=CASE
        WHEN "StoreOperatorLoginGuard"."windowStartedAt"<NOW()-INTERVAL '15 minutes' THEN NOW()
        ELSE "StoreOperatorLoginGuard"."windowStartedAt"
      END,
      "lockedUntil"=CASE
        WHEN "StoreOperatorLoginGuard"."windowStartedAt">=NOW()-INTERVAL '15 minutes'
          AND "StoreOperatorLoginGuard"."failedCount"+1>=5 THEN ${lockUntil}
        ELSE NULL
      END,
      "updatedAt"=NOW()
  `;
}
async function clearLoginFailures(storeId,subjectKey){
  await prisma.$executeRaw`
    DELETE FROM "StoreOperatorLoginGuard"
    WHERE "storeId"=${storeId} AND "subjectKey"=${subjectKey}
  `;
}
function last4(value){
  const normalized=normalizeCard(value);
  return normalized.slice(-4)||null;
}
function operatorToken(row,sessionId){
  const permissions=operatorPermissions(row.role);
  return jwt.sign({
    id:row.id,
    operatorId:row.id,
    employeeId:row.employeeId,
    companyId:row.companyId,
    storeId:row.storeId,
    role:row.role,
    fullName:row.displayName,
    tokenType:"STORE_OPERATOR",
    operatorSessionId:sessionId,
    permissions
  },process.env.JWT_SECRET,{expiresIn:"12h"});
}
async function createOperatorSession(req,row){
  const sessionId=crypto.randomUUID();
  const expiresAt=new Date(Date.now()+12*60*60*1000);
  await prisma.$executeRaw`
    INSERT INTO "StoreOperatorSession"
      ("id","operatorId","companyId","storeId","expiresAt","userAgent","ipAddress")
    VALUES (${sessionId},${row.id},${row.companyId},${row.storeId},${expiresAt},${req.headers["user-agent"]||null},${req.ip||null})
  `;
  return sessionId;
}
function operatorPermissions(role){
  const common=["CASH_CONTROL","ATTENDANCE","STORE_LEDGER"];
  return role==="MANAGER"?[...common,"STORE_LEDGER_REVIEW","TRANSACTION_REVERSAL"]:common;
}
async function audit({companyId,storeId,operatorId=null,actorId,eventType,details={}}){
  await prisma.$executeRaw`
    INSERT INTO "StoreOperatorAudit" ("id","companyId","storeId","operatorId","actorId","eventType","details")
    VALUES (${crypto.randomUUID()},${companyId},${storeId},${operatorId},${actorId},${eventType},CAST(${JSON.stringify(details)} AS jsonb))
  `;
}
async function activeStore(storeId){
  const store=await prisma.store.findFirst({where:{id:storeId,active:true},include:{company:true}});
  if(!store){const error=new Error("Δεν βρέθηκε ενεργό κατάστημα.");error.status=404;throw error}
  if(!store.company.active){const error=new Error("Η άδεια του καταστήματος είναι σε αναστολή ή έχει λήξει.");error.status=403;throw error}
  return store;
}
async function ownedStore(storeId,companyId){
  const store=await prisma.store.findFirst({where:{id:storeId,companyId,active:true},include:{company:true}});
  if(!store){const error=new Error("Δεν βρέθηκε ενεργό κατάστημα.");error.status=404;throw error}
  if(!store.company.active){const error=new Error("Η άδεια του πελάτη είναι σε αναστολή ή έχει λήξει.");error.status=403;throw error}
  return store;
}

router.get("/stores/:storeId/directory",route(async(req,res)=>{
  const store=await activeStore(req.params.storeId);
  const rows=await prisma.$queryRaw`
    SELECT c."id",c."employeeId",c."displayName",
           (c."pinHash" IS NOT NULL) AS "hasPin",
           (c."cardCodeHash" IS NOT NULL) AS "hasCard"
    FROM "StoreOperatorCredential" c
    JOIN "Employee" e ON e."id"=c."employeeId"
    WHERE c."storeId"=${store.id} AND c."active"=TRUE AND e."active"=TRUE
    ORDER BY c."displayName" ASC
  `;
  res.json({store:{id:store.id,name:store.name,companyName:store.company.name},operators:rows});
}));

router.post("/login/pin",route(async(req,res)=>{
  const body=z.object({storeId:z.string().min(2),employeeId:z.string().min(2),pin:z.string().regex(/^\d{4,8}$/)}).parse(req.body);
  await activeStore(body.storeId);
  const subjectKey=loginSubject("PIN",body.employeeId);
  await assertLoginAllowed(body.storeId,subjectKey);
  const rows=await prisma.$queryRaw`
    SELECT c.*,e."active" AS "employeeActive",s."name" AS "storeName",co."name" AS "companyName"
    FROM "StoreOperatorCredential" c
    JOIN "Employee" e ON e."id"=c."employeeId"
    JOIN "Store" s ON s."id"=c."storeId"
    JOIN "Company" co ON co."id"=c."companyId"
    WHERE c."storeId"=${body.storeId} AND c."employeeId"=${body.employeeId}
      AND c."active"=TRUE AND e."active"=TRUE AND s."active"=TRUE AND co."active"=TRUE
    LIMIT 1
  `;
  const operator=rows[0];
  if(!operator||!operator.pinHash||!(await bcrypt.compare(body.pin,operator.pinHash))){
    await recordLoginFailure(body.storeId,subjectKey);
    return res.status(401).json({error:"Λανθασμένο PIN."});
  }
  await clearLoginFailures(body.storeId,subjectKey);
  await prisma.$executeRaw`UPDATE "StoreOperatorCredential" SET "lastLoginAt"=NOW() WHERE "id"=${operator.id}`;
  const operatorSessionId=await createOperatorSession(req,operator);
  await audit({companyId:operator.companyId,storeId:operator.storeId,operatorId:operator.id,actorId:operator.id,eventType:"OPERATOR_LOGIN_PIN",details:{employeeId:operator.employeeId}});
  res.json({
    token:operatorToken(operator,operatorSessionId),
    user:{id:operator.id,employeeId:operator.employeeId,fullName:operator.displayName,role:operator.role,operator:true,permissions:operatorPermissions(operator.role)},
    store:{id:operator.storeId,name:operator.storeName},
    company:{id:operator.companyId,name:operator.companyName}
  });
}));

router.post("/login/card",route(async(req,res)=>{
  const body=z.object({storeId:z.string().min(2),cardCode:z.string().min(3).max(120)}).parse(req.body);
  await activeStore(body.storeId);
  const normalized=normalizeCard(body.cardCode);
  if(normalized.length<3)return res.status(400).json({error:"Η κάρτα δεν είναι έγκυρη."});
  const hash=cardHash(normalized);
  const subjectKey=loginSubject("CARD",hash);
  await assertLoginAllowed(body.storeId,subjectKey);
  const rows=await prisma.$queryRaw`
    SELECT c.*,e."active" AS "employeeActive",s."name" AS "storeName",co."name" AS "companyName"
    FROM "StoreOperatorCredential" c
    JOIN "Employee" e ON e."id"=c."employeeId"
    JOIN "Store" s ON s."id"=c."storeId"
    JOIN "Company" co ON co."id"=c."companyId"
    WHERE c."storeId"=${body.storeId} AND c."cardCodeHash"=${hash}
      AND c."active"=TRUE AND e."active"=TRUE AND s."active"=TRUE AND co."active"=TRUE
    LIMIT 1
  `;
  const operator=rows[0];
  if(!operator){
    await recordLoginFailure(body.storeId,subjectKey);
    return res.status(401).json({error:"Η κάρτα δεν αναγνωρίστηκε."});
  }
  await clearLoginFailures(body.storeId,subjectKey);
  await prisma.$executeRaw`UPDATE "StoreOperatorCredential" SET "lastLoginAt"=NOW() WHERE "id"=${operator.id}`;
  const operatorSessionId=await createOperatorSession(req,operator);
  await audit({companyId:operator.companyId,storeId:operator.storeId,operatorId:operator.id,actorId:operator.id,eventType:"OPERATOR_LOGIN_CARD",details:{employeeId:operator.employeeId,cardLast4:operator.cardCodeLast4}});
  res.json({
    token:operatorToken(operator,operatorSessionId),
    user:{id:operator.id,employeeId:operator.employeeId,fullName:operator.displayName,role:operator.role,operator:true,permissions:operatorPermissions(operator.role)},
    store:{id:operator.storeId,name:operator.storeName},
    company:{id:operator.companyId,name:operator.companyName}
  });
}));

router.post("/logout",auth,route(async(req,res)=>{
  if(req.user?.tokenType!=="STORE_OPERATOR"||!req.user?.operatorSessionId){
    return res.status(400).json({error:"Δεν υπάρχει ενεργή συνεδρία Store Mode."});
  }
  await prisma.$executeRaw`
    UPDATE "StoreOperatorSession" SET "revokedAt"=COALESCE("revokedAt",NOW())
    WHERE "id"=${req.user.operatorSessionId}
      AND "operatorId"=${req.user.operatorId||req.user.id}
      AND "storeId"=${req.user.storeId}
  `;
  await audit({companyId:req.user.companyId,storeId:req.user.storeId,operatorId:req.user.operatorId||req.user.id,actorId:req.user.operatorId||req.user.id,eventType:"OPERATOR_LOGOUT"});
  res.json({ok:true});
}));

router.use(auth,requireAdmin);

router.get("/stores/:storeId",route(async(req,res)=>{
  const store=await ownedStore(req.params.storeId,req.user.companyId);
  const rows=await prisma.$queryRaw`
    SELECT e."id" AS "employeeId",e."fullName",e."position",e."active" AS "employeeActive",
           c."id" AS "credentialId",COALESCE(c."role",'EMPLOYEE') AS "role",
           COALESCE(c."active",FALSE) AS "active",
           (c."pinHash" IS NOT NULL) AS "hasPin",
           (c."cardCodeHash" IS NOT NULL) AS "hasCard",
           c."cardCodeLast4",c."lastLoginAt",c."updatedAt"
    FROM "Employee" e
    LEFT JOIN "StoreOperatorCredential" c
      ON c."employeeId"=e."id" AND c."storeId"=e."storeId"
    WHERE e."storeId"=${store.id}
    ORDER BY e."fullName" ASC
  `;
  res.json({store:{id:store.id,name:store.name,operatorUrl:`/store/${store.id}`},operators:rows});
}));

router.put("/stores/:storeId/employees/:employeeId",route(async(req,res)=>{
  const store=await ownedStore(req.params.storeId,req.user.companyId);
  const body=z.object({
    role:z.enum(["MANAGER","EMPLOYEE"]).default("EMPLOYEE"),
    active:z.boolean().default(true),
    pin:z.string().regex(/^\d{4,8}$/).optional().or(z.literal("")),
    cardCode:z.string().max(120).optional().or(z.literal("")),
    clearPin:z.boolean().optional().default(false),
    clearCard:z.boolean().optional().default(false)
  }).parse(req.body||{});
  const employee=await prisma.employee.findFirst({where:{id:req.params.employeeId,storeId:store.id}});
  if(!employee)return res.status(404).json({error:"Δεν βρέθηκε εργαζόμενος στο κατάστημα."});

  const existingRows=await prisma.$queryRaw`
    SELECT * FROM "StoreOperatorCredential"
    WHERE "storeId"=${store.id} AND "employeeId"=${employee.id} LIMIT 1
  `;
  const existing=existingRows[0];
  const pinHash=body.clearPin?null:body.pin?await bcrypt.hash(body.pin,12):(existing?.pinHash||null);
  const normalized=body.cardCode?normalizeCard(body.cardCode):"";
  const cardCodeHash=body.clearCard?null:normalized?cardHash(normalized):(existing?.cardCodeHash||null);
  const cardCodeLast4=body.clearCard?null:normalized?last4(normalized):(existing?.cardCodeLast4||null);
  const id=existing?.id||crypto.randomUUID();

  await prisma.$executeRaw`
    INSERT INTO "StoreOperatorCredential"
      ("id","companyId","storeId","employeeId","displayName","role","pinHash","cardCodeHash","cardCodeLast4","active","createdBy","updatedAt")
    VALUES
      (${id},${store.companyId},${store.id},${employee.id},${employee.fullName},${body.role},${pinHash},${cardCodeHash},${cardCodeLast4},${body.active},${req.user.id},NOW())
    ON CONFLICT ("storeId","employeeId") DO UPDATE SET
      "displayName"=EXCLUDED."displayName",
      "role"=EXCLUDED."role",
      "pinHash"=EXCLUDED."pinHash",
      "cardCodeHash"=EXCLUDED."cardCodeHash",
      "cardCodeLast4"=EXCLUDED."cardCodeLast4",
      "active"=EXCLUDED."active",
      "updatedAt"=NOW()
  `;
  // A credential reset by an administrator must also release any previous
  // failed-login guard for this employee and their old/new card.
  await clearLoginFailures(store.id,loginSubject("PIN",employee.id));
  if(existing?.cardCodeHash)await clearLoginFailures(store.id,loginSubject("CARD",existing.cardCodeHash));
  if(cardCodeHash)await clearLoginFailures(store.id,loginSubject("CARD",cardCodeHash));
  await audit({companyId:store.companyId,storeId:store.id,operatorId:id,actorId:req.user.id,eventType:"OPERATOR_CREDENTIAL_UPDATED",details:{employeeId:employee.id,role:body.role,active:body.active,hasPin:!!pinHash,hasCard:!!cardCodeHash}});
  res.json({ok:true,employeeId:employee.id,credentialId:id,hasPin:!!pinHash,hasCard:!!cardCodeHash,cardCodeLast4,active:body.active,role:body.role});
}));

export default router;
