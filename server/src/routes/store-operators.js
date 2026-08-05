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
   ON "StoreOperatorAudit" ("storeId","createdAt" DESC)`
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
function last4(value){
  const normalized=normalizeCard(value);
  return normalized.slice(-4)||null;
}
function operatorToken(row){
  return jwt.sign({
    id:row.id,
    operatorId:row.id,
    employeeId:row.employeeId,
    companyId:row.companyId,
    storeId:row.storeId,
    role:row.role,
    fullName:row.displayName,
    tokenType:"STORE_OPERATOR",
    permissions:["CASH_CONTROL"]
  },process.env.JWT_SECRET,{expiresIn:"12h"});
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
  return store;
}
async function ownedStore(storeId,companyId){
  const store=await prisma.store.findFirst({where:{id:storeId,companyId,active:true}});
  if(!store){const error=new Error("Δεν βρέθηκε ενεργό κατάστημα.");error.status=404;throw error}
  return store;
}

router.get("/stores/:storeId/directory",route(async(req,res)=>{
  const store=await activeStore(req.params.storeId);
  const rows=await prisma.$queryRaw`
    SELECT c."id",c."employeeId",c."displayName",c."role",
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
  const rows=await prisma.$queryRaw`
    SELECT c.*,e."active" AS "employeeActive",s."name" AS "storeName",co."name" AS "companyName"
    FROM "StoreOperatorCredential" c
    JOIN "Employee" e ON e."id"=c."employeeId"
    JOIN "Store" s ON s."id"=c."storeId"
    JOIN "Company" co ON co."id"=c."companyId"
    WHERE c."storeId"=${body.storeId} AND c."employeeId"=${body.employeeId}
      AND c."active"=TRUE AND e."active"=TRUE AND s."active"=TRUE
    LIMIT 1
  `;
  const operator=rows[0];
  if(!operator||!operator.pinHash||!(await bcrypt.compare(body.pin,operator.pinHash))){
    return res.status(401).json({error:"Λανθασμένο PIN."});
  }
  await prisma.$executeRaw`UPDATE "StoreOperatorCredential" SET "lastLoginAt"=NOW() WHERE "id"=${operator.id}`;
  await audit({companyId:operator.companyId,storeId:operator.storeId,operatorId:operator.id,actorId:operator.id,eventType:"OPERATOR_LOGIN_PIN",details:{employeeId:operator.employeeId}});
  res.json({
    token:operatorToken(operator),
    user:{id:operator.id,employeeId:operator.employeeId,fullName:operator.displayName,role:operator.role,operator:true},
    store:{id:operator.storeId,name:operator.storeName},
    company:{id:operator.companyId,name:operator.companyName}
  });
}));

router.post("/login/card",route(async(req,res)=>{
  const body=z.object({storeId:z.string().min(2),cardCode:z.string().min(3).max(120)}).parse(req.body);
  const normalized=normalizeCard(body.cardCode);
  if(normalized.length<3)return res.status(400).json({error:"Η κάρτα δεν είναι έγκυρη."});
  const hash=cardHash(normalized);
  const rows=await prisma.$queryRaw`
    SELECT c.*,e."active" AS "employeeActive",s."name" AS "storeName",co."name" AS "companyName"
    FROM "StoreOperatorCredential" c
    JOIN "Employee" e ON e."id"=c."employeeId"
    JOIN "Store" s ON s."id"=c."storeId"
    JOIN "Company" co ON co."id"=c."companyId"
    WHERE c."storeId"=${body.storeId} AND c."cardCodeHash"=${hash}
      AND c."active"=TRUE AND e."active"=TRUE AND s."active"=TRUE
    LIMIT 1
  `;
  const operator=rows[0];
  if(!operator)return res.status(401).json({error:"Η κάρτα δεν αναγνωρίστηκε."});
  await prisma.$executeRaw`UPDATE "StoreOperatorCredential" SET "lastLoginAt"=NOW() WHERE "id"=${operator.id}`;
  await audit({companyId:operator.companyId,storeId:operator.storeId,operatorId:operator.id,actorId:operator.id,eventType:"OPERATOR_LOGIN_CARD",details:{employeeId:operator.employeeId,cardLast4:operator.cardCodeLast4}});
  res.json({
    token:operatorToken(operator),
    user:{id:operator.id,employeeId:operator.employeeId,fullName:operator.displayName,role:operator.role,operator:true},
    store:{id:operator.storeId,name:operator.storeName},
    company:{id:operator.companyId,name:operator.companyName}
  });
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
  let pinHashValue=body.clearPin?null:(existing?.pinHash||null);
  let cardHashValue=body.clearCard?null:(existing?.cardCodeHash||null);
  let cardLast4Value=body.clearCard?null:(existing?.cardCodeLast4||null);
  if(body.pin)pinHashValue=await bcrypt.hash(body.pin,12);
  if(body.cardCode){cardHashValue=cardHash(body.cardCode);cardLast4Value=last4(body.cardCode)}
  if(body.active&&!pinHashValue&&!cardHashValue)return res.status(400).json({error:"Βάλε προσωπικό PIN ή κωδικό κάρτας πριν ενεργοποιήσεις την πρόσβαση."});

  let rows;
  if(existing){
    rows=await prisma.$queryRaw`
      UPDATE "StoreOperatorCredential"
      SET "displayName"=${employee.fullName},"role"=${body.role},"pinHash"=${pinHashValue},
          "cardCodeHash"=${cardHashValue},"cardCodeLast4"=${cardLast4Value},"active"=${body.active},"updatedAt"=NOW()
      WHERE "id"=${existing.id} RETURNING *
    `;
  }else{
    rows=await prisma.$queryRaw`
      INSERT INTO "StoreOperatorCredential" (
        "id","companyId","storeId","employeeId","displayName","role","pinHash","cardCodeHash","cardCodeLast4","active","createdBy"
      ) VALUES (
        ${crypto.randomUUID()},${req.user.companyId},${store.id},${employee.id},${employee.fullName},${body.role},
        ${pinHashValue},${cardHashValue},${cardLast4Value},${body.active},${req.user.id}
      ) RETURNING *
    `;
  }
  const saved=rows[0];
  await audit({companyId:req.user.companyId,storeId:store.id,operatorId:saved.id,actorId:req.user.id,eventType:"OPERATOR_ACCESS_UPDATED",details:{employeeId:employee.id,role:body.role,active:body.active,hasPin:Boolean(pinHashValue),hasCard:Boolean(cardHashValue)}});
  res.json({
    id:saved.id,employeeId:saved.employeeId,fullName:saved.displayName,role:saved.role,active:saved.active,
    hasPin:Boolean(saved.pinHash),hasCard:Boolean(saved.cardCodeHash),cardCodeLast4:saved.cardCodeLast4,lastLoginAt:saved.lastLoginAt
  });
}));

router.get("/stores/:storeId/audit",route(async(req,res)=>{
  const store=await ownedStore(req.params.storeId,req.user.companyId);
  const rows=await prisma.$queryRaw`
    SELECT a.*,c."displayName"
    FROM "StoreOperatorAudit" a
    LEFT JOIN "StoreOperatorCredential" c ON c."id"=a."operatorId"
    WHERE a."storeId"=${store.id} AND a."companyId"=${req.user.companyId}
    ORDER BY a."createdAt" DESC LIMIT 50
  `;
  res.json(rows);
}));

export default router;
