import { Router } from "express";
import bcrypt from "bcryptjs";
import crypto from "crypto";
import { z } from "zod";
import { prisma } from "../prisma.js";

const router=Router();
let schemaPromise;

const statements=[
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
  `CREATE TABLE IF NOT EXISTS "StoreOperatorProfile" (
    "id" TEXT PRIMARY KEY,
    "companyId" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "username" TEXT,
    "stationPhone" TEXT,
    "mobilePhone" TEXT,
    "hourlyRate" NUMERIC(12,4),
    "posAccess" BOOLEAN NOT NULL DEFAULT TRUE,
    "backofficeAccess" BOOLEAN NOT NULL DEFAULT FALSE,
    "powerUser" BOOLEAN NOT NULL DEFAULT FALSE,
    "permissions" JSONB NOT NULL DEFAULT '{}'::jsonb,
    "backofficeMenu" JSONB NOT NULL DEFAULT '{}'::jsonb,
    "backofficeTabs" JSONB NOT NULL DEFAULT '{}'::jsonb,
    "customerDisplay" JSONB NOT NULL DEFAULT '{}'::jsonb,
    "terminalPos" TEXT,
    "cashLimit" NUMERIC(12,2),
    "notes" TEXT,
    "retailSaleSeries" TEXT,
    "retailReturnSeries" TEXT,
    "installationAddress" TEXT,
    "installationPhone" TEXT,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE ("storeId","employeeId")
  )`,
  `CREATE INDEX IF NOT EXISTS "StoreOperatorProfile_store_idx" ON "StoreOperatorProfile" ("storeId")`,
  `CREATE INDEX IF NOT EXISTS "StoreOperatorAudit_store_created_idx" ON "StoreOperatorAudit" ("storeId","createdAt" DESC)`
];

async function ensureSchema(){
  if(!schemaPromise){
    schemaPromise=(async()=>{for(const sql of statements)await prisma.$executeRawUnsafe(sql)})().catch(error=>{schemaPromise=undefined;throw error});
  }
  return schemaPromise;
}
function allowed(req){return ["SUPER_ADMIN","OWNER","ADMIN"].includes(req.user?.role)}
async function scopedStore(req,storeId){
  const where=req.user?.role==="SUPER_ADMIN"?{id:storeId,active:true}:{id:storeId,companyId:req.user.companyId,active:true};
  const store=await prisma.store.findFirst({where});
  if(!store){const error=new Error("Δεν βρέθηκε ενεργό κατάστημα.");error.status=404;throw error}
  return store;
}
async function audit({store,operatorId=null,actorId,eventType,details={}}){
  await prisma.$executeRaw`
    INSERT INTO "StoreOperatorAudit" ("id","companyId","storeId","operatorId","actorId","eventType","details")
    VALUES (${crypto.randomUUID()},${store.companyId},${store.id},${operatorId},${actorId},${eventType},CAST(${JSON.stringify(details)} AS jsonb))
  `;
}
function route(handler){return async(req,res)=>{
  try{
    if(!allowed(req))return res.status(403).json({error:"Απαιτείται δικαίωμα διαχειριστή."});
    await ensureSchema();
    await handler(req,res);
  }catch(error){
    console.error("Operator Management V2:",error);
    if(error?.name==="ZodError")return res.status(400).json({error:"Ελέγξτε τα στοιχεία της φόρμας.",details:error.issues});
    return res.status(error?.status||500).json({error:error?.status?error.message:"Παρουσιάστηκε προσωρινό σφάλμα."});
  }
}}
const jsonRecord=z.record(z.string(),z.union([z.boolean(),z.string(),z.number(),z.null()])).default({});

router.get("/stores/:storeId/operators",route(async(req,res)=>{
  const store=await scopedStore(req,req.params.storeId);
  const rows=await prisma.$queryRaw`
    SELECT c."id" AS "credentialId",c."employeeId",c."displayName",c."role",c."active",
           c."lastLoginAt",c."createdAt",c."updatedAt",
           (c."pinHash" IS NOT NULL) AS "hasPin",
           (c."cardCodeHash" IS NOT NULL) AS "hasCard",c."cardCodeLast4",
           e."position",e."phone" AS "employeePhone",e."email" AS "employeeEmail",e."active" AS "employeeActive",e."userId",
           u."email" AS "userEmail",
           p."username",p."stationPhone",p."mobilePhone",p."hourlyRate",p."posAccess",p."backofficeAccess",p."powerUser",
           p."permissions",p."backofficeMenu",p."backofficeTabs",p."customerDisplay",p."terminalPos",p."cashLimit",p."notes",
           p."retailSaleSeries",p."retailReturnSeries",p."installationAddress",p."installationPhone"
    FROM "StoreOperatorCredential" c
    JOIN "Employee" e ON e."id"=c."employeeId" AND e."storeId"=c."storeId"
    LEFT JOIN "User" u ON u."id"=e."userId"
    LEFT JOIN "StoreOperatorProfile" p ON p."employeeId"=c."employeeId" AND p."storeId"=c."storeId"
    WHERE c."storeId"=${store.id}
    ORDER BY c."displayName" ASC
  `;
  res.json({store:{id:store.id,name:store.name},operators:rows});
}));

router.post("/stores/:storeId/operators/copy-permissions",route(async(req,res)=>{
  const store=await scopedStore(req,req.params.storeId);
  const body=z.object({sourceEmployeeId:z.string().min(1),confirm:z.literal("COPY_SOURCE_TO_EMPLOYEES")}).parse(req.body||{});
  const sourceRows=await prisma.$queryRaw`SELECT c."employeeId",p."posAccess",p."backofficeAccess",p."powerUser",p."permissions",p."backofficeMenu",p."backofficeTabs",p."customerDisplay" FROM "StoreOperatorCredential" c LEFT JOIN "StoreOperatorProfile" p ON p."storeId"=c."storeId" AND p."employeeId"=c."employeeId" WHERE c."storeId"=${store.id} AND c."employeeId"=${body.sourceEmployeeId} LIMIT 1`;
  const source=sourceRows[0];
  if(!source){const error=new Error("Δεν βρέθηκε ο χειριστής-πρότυπο.");error.status=404;throw error}
  const targets=await prisma.$queryRaw`SELECT c."id" AS "credentialId",c."employeeId",c."displayName" FROM "StoreOperatorCredential" c WHERE c."storeId"=${store.id} AND c."employeeId"<>${body.sourceEmployeeId} AND UPPER(TRIM(c."displayName"))<>UPPER('ΧΡΗΣΤΟΣ ΜΑΝΗΣ')`;
  for(const target of targets){
    await prisma.$executeRaw`UPDATE "StoreOperatorCredential" SET "role"='EMPLOYEE',"active"=TRUE,"updatedAt"=NOW() WHERE "id"=${target.credentialId}`;
    await prisma.$executeRaw`INSERT INTO "StoreOperatorProfile" ("id","companyId","storeId","employeeId","posAccess","backofficeAccess","powerUser","permissions","backofficeMenu","backofficeTabs","customerDisplay","createdBy","updatedAt") VALUES (${crypto.randomUUID()},${store.companyId},${store.id},${target.employeeId},${source.posAccess!==false},${source.backofficeAccess===true},${source.powerUser===true},CAST(${JSON.stringify(source.permissions||{})} AS jsonb),CAST(${JSON.stringify(source.backofficeMenu||{})} AS jsonb),CAST(${JSON.stringify(source.backofficeTabs||{})} AS jsonb),CAST(${JSON.stringify(source.customerDisplay||{})} AS jsonb),${req.user.id},NOW()) ON CONFLICT ("storeId","employeeId") DO UPDATE SET "posAccess"=EXCLUDED."posAccess","backofficeAccess"=EXCLUDED."backofficeAccess","powerUser"=EXCLUDED."powerUser","permissions"=EXCLUDED."permissions","backofficeMenu"=EXCLUDED."backofficeMenu","backofficeTabs"=EXCLUDED."backofficeTabs","customerDisplay"=EXCLUDED."customerDisplay","updatedAt"=NOW()`;
    await audit({store,operatorId:target.credentialId,actorId:req.user.id,eventType:"OPERATOR_PERMISSIONS_COPIED",details:{sourceEmployeeId:body.sourceEmployeeId,targetEmployeeId:target.employeeId,sourceDisplayName:"Αθηνά Μάρη"}});
  }
  res.json({ok:true,updated:targets.length,sourceEmployeeId:body.sourceEmployeeId});
}));

router.post("/stores/:storeId/operators",route(async(req,res)=>{
  const store=await scopedStore(req,req.params.storeId);
  const body=z.object({
    username:z.string().trim().max(80).optional().default(""),
    fullName:z.string().trim().min(2).max(160),
    email:z.string().email().optional().or(z.literal("")),
    phone:z.string().trim().max(40).optional().default(""),
    role:z.enum(["MANAGER","EMPLOYEE"]).default("EMPLOYEE"),
    active:z.boolean().default(true),
    pin:z.string().regex(/^\d{4,8}$/).optional().or(z.literal(""))
  }).parse(req.body||{});
  const employee=await prisma.employee.create({data:{fullName:body.fullName,email:body.email||null,phone:body.phone||null,position:body.role==="MANAGER"?"Υπεύθυνος":"Εργαζόμενος",storeId:store.id,active:true}});
  const credentialId=crypto.randomUUID();
  const pinHash=body.pin?await bcrypt.hash(body.pin,12):null;
  await prisma.$executeRaw`
    INSERT INTO "StoreOperatorCredential" ("id","companyId","storeId","employeeId","displayName","role","pinHash","active","createdBy")
    VALUES (${credentialId},${store.companyId},${store.id},${employee.id},${body.fullName},${body.role},${pinHash},${body.active},${req.user.id})
  `;
  await prisma.$executeRaw`
    INSERT INTO "StoreOperatorProfile" ("id","companyId","storeId","employeeId","username","mobilePhone","createdBy")
    VALUES (${crypto.randomUUID()},${store.companyId},${store.id},${employee.id},${body.username||null},${body.phone||null},${req.user.id})
  `;
  await audit({store,operatorId:credentialId,actorId:req.user.id,eventType:"OPERATOR_CREATED",details:{employeeId:employee.id,role:body.role,active:body.active}});
  res.status(201).json({ok:true,employeeId:employee.id,credentialId});
}));

router.patch("/stores/:storeId/operators/:employeeId",route(async(req,res)=>{
  const store=await scopedStore(req,req.params.storeId);
  const body=z.object({
    username:z.string().trim().max(80).optional().nullable(),
    fullName:z.string().trim().min(2).max(160),
    stationPhone:z.string().trim().max(40).optional().nullable(),
    mobilePhone:z.string().trim().max(40).optional().nullable(),
    hourlyRate:z.number().min(0).max(100000).optional().nullable(),
    role:z.enum(["MANAGER","EMPLOYEE"]),active:z.boolean(),
    posAccess:z.boolean(),backofficeAccess:z.boolean(),powerUser:z.boolean(),
    permissions:jsonRecord,backofficeMenu:jsonRecord,backofficeTabs:jsonRecord,customerDisplay:jsonRecord,
    terminalPos:z.string().trim().max(120).optional().nullable(),cashLimit:z.number().min(0).max(10000000).optional().nullable(),notes:z.string().max(5000).optional().nullable(),
    retailSaleSeries:z.string().trim().max(120).optional().nullable(),retailReturnSeries:z.string().trim().max(120).optional().nullable(),
    installationAddress:z.string().trim().max(240).optional().nullable(),installationPhone:z.string().trim().max(60).optional().nullable()
  }).parse(req.body||{});
  const employee=await prisma.employee.findFirst({where:{id:req.params.employeeId,storeId:store.id}});
  if(!employee){const error=new Error("Δεν βρέθηκε ο χειριστής.");error.status=404;throw error}
  const credentials=await prisma.$queryRaw`SELECT * FROM "StoreOperatorCredential" WHERE "storeId"=${store.id} AND "employeeId"=${employee.id} LIMIT 1`;
  const credential=credentials[0];
  if(!credential){const error=new Error("Δεν υπάρχει ενεργή καρτέλα χειριστή για τον εργαζόμενο.");error.status=404;throw error}
  await prisma.employee.update({where:{id:employee.id},data:{fullName:body.fullName,phone:body.mobilePhone||null,position:body.role==="MANAGER"?"Υπεύθυνος":"Εργαζόμενος"}});
  await prisma.$executeRaw`UPDATE "StoreOperatorCredential" SET "displayName"=${body.fullName},"role"=${body.role},"active"=${body.active},"updatedAt"=NOW() WHERE "id"=${credential.id}`;
  await prisma.$executeRaw`
    INSERT INTO "StoreOperatorProfile" (
      "id","companyId","storeId","employeeId","username","stationPhone","mobilePhone","hourlyRate","posAccess","backofficeAccess","powerUser",
      "permissions","backofficeMenu","backofficeTabs","customerDisplay","terminalPos","cashLimit","notes","retailSaleSeries","retailReturnSeries","installationAddress","installationPhone","createdBy","updatedAt"
    ) VALUES (
      ${crypto.randomUUID()},${store.companyId},${store.id},${employee.id},${body.username||null},${body.stationPhone||null},${body.mobilePhone||null},${body.hourlyRate??null},${body.posAccess},${body.backofficeAccess},${body.powerUser},
      CAST(${JSON.stringify(body.permissions)} AS jsonb),CAST(${JSON.stringify(body.backofficeMenu)} AS jsonb),CAST(${JSON.stringify(body.backofficeTabs)} AS jsonb),CAST(${JSON.stringify(body.customerDisplay)} AS jsonb),${body.terminalPos||null},${body.cashLimit??null},${body.notes||null},${body.retailSaleSeries||null},${body.retailReturnSeries||null},${body.installationAddress||null},${body.installationPhone||null},${req.user.id},NOW()
    ) ON CONFLICT ("storeId","employeeId") DO UPDATE SET
      "username"=EXCLUDED."username","stationPhone"=EXCLUDED."stationPhone","mobilePhone"=EXCLUDED."mobilePhone","hourlyRate"=EXCLUDED."hourlyRate",
      "posAccess"=EXCLUDED."posAccess","backofficeAccess"=EXCLUDED."backofficeAccess","powerUser"=EXCLUDED."powerUser",
      "permissions"=EXCLUDED."permissions","backofficeMenu"=EXCLUDED."backofficeMenu","backofficeTabs"=EXCLUDED."backofficeTabs","customerDisplay"=EXCLUDED."customerDisplay",
      "terminalPos"=EXCLUDED."terminalPos","cashLimit"=EXCLUDED."cashLimit","notes"=EXCLUDED."notes","retailSaleSeries"=EXCLUDED."retailSaleSeries","retailReturnSeries"=EXCLUDED."retailReturnSeries",
      "installationAddress"=EXCLUDED."installationAddress","installationPhone"=EXCLUDED."installationPhone","updatedAt"=NOW()
  `;
  await audit({store,operatorId:credential.id,actorId:req.user.id,eventType:"OPERATOR_PROFILE_UPDATED",details:{employeeId:employee.id,role:body.role,active:body.active,posAccess:body.posAccess,backofficeAccess:body.backofficeAccess}});
  res.json({ok:true});
}));

router.post("/stores/:storeId/operators/:employeeId/pin",route(async(req,res)=>{
  const store=await scopedStore(req,req.params.storeId);
  const body=z.object({pin:z.string().regex(/^\d{4,8}$/)}).parse(req.body||{});
  const employee=await prisma.employee.findFirst({where:{id:req.params.employeeId,storeId:store.id}});
  if(!employee){const error=new Error("Δεν βρέθηκε ο χειριστής.");error.status=404;throw error}
  const rows=await prisma.$queryRaw`SELECT * FROM "StoreOperatorCredential" WHERE "storeId"=${store.id} AND "employeeId"=${employee.id} LIMIT 1`;
  const credential=rows[0];
  if(!credential){const error=new Error("Δεν υπάρχει καρτέλα χειριστή.");error.status=404;throw error}
  const pinHash=await bcrypt.hash(body.pin,12);
  await prisma.$executeRaw`UPDATE "StoreOperatorCredential" SET "pinHash"=${pinHash},"updatedAt"=NOW() WHERE "id"=${credential.id}`;
  await prisma.$executeRawUnsafe(`UPDATE "StoreOperatorSession" SET "revokedAt"=COALESCE("revokedAt",NOW()) WHERE "operatorId"=$1 AND "revokedAt" IS NULL`,credential.id).catch(()=>{});
  await audit({store,operatorId:credential.id,actorId:req.user.id,eventType:"OPERATOR_PIN_CHANGED",details:{employeeId:employee.id}});
  res.json({ok:true});
}));

router.post("/stores/:storeId/operators/:employeeId/pin/random",route(async(req,res)=>{
  const store=await scopedStore(req,req.params.storeId);
  const employee=await prisma.employee.findFirst({where:{id:req.params.employeeId,storeId:store.id}});
  if(!employee){const error=new Error("Δεν βρέθηκε ο χειριστής.");error.status=404;throw error}
  const rows=await prisma.$queryRaw`SELECT * FROM "StoreOperatorCredential" WHERE "storeId"=${store.id} AND "employeeId"=${employee.id} LIMIT 1`;
  const credential=rows[0];
  if(!credential){const error=new Error("Δεν υπάρχει καρτέλα χειριστή.");error.status=404;throw error}
  const pin=String(crypto.randomInt(100000,1000000));
  const pinHash=await bcrypt.hash(pin,12);
  await prisma.$executeRaw`UPDATE "StoreOperatorCredential" SET "pinHash"=${pinHash},"updatedAt"=NOW() WHERE "id"=${credential.id}`;
  await audit({store,operatorId:credential.id,actorId:req.user.id,eventType:"OPERATOR_PIN_RANDOMIZED",details:{employeeId:employee.id}});
  res.json({ok:true,pin,displayName:credential.displayName,username:null});
}));

router.delete("/stores/:storeId/operators/:employeeId",route(async(req,res)=>{
  const store=await scopedStore(req,req.params.storeId);
  const rows=await prisma.$queryRaw`SELECT * FROM "StoreOperatorCredential" WHERE "storeId"=${store.id} AND "employeeId"=${req.params.employeeId} LIMIT 1`;
  const credential=rows[0];
  if(!credential){const error=new Error("Δεν βρέθηκε ο χειριστής.");error.status=404;throw error}
  await prisma.$executeRaw`UPDATE "StoreOperatorCredential" SET "active"=FALSE,"updatedAt"=NOW() WHERE "id"=${credential.id}`;
  await audit({store,operatorId:credential.id,actorId:req.user.id,eventType:"OPERATOR_DEACTIVATED",details:{employeeId:req.params.employeeId}});
  res.json({ok:true});
}));

export default router;
