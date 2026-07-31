import { Router } from "express";
import crypto from "crypto";
import jwt from "jsonwebtoken";
import { z } from "zod";
import { prisma } from "../prisma.js";
import { auth } from "../middleware/auth.js";

const router = Router();
const DEVICE_TOKEN_TTL = process.env.CLOUD_DEVICE_TOKEN_TTL || "180d";
let tablesPromise;

const tableStatements = [
  `CREATE TABLE IF NOT EXISTS "CloudPairingCode" (
    "id" TEXT PRIMARY KEY,
    "companyId" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "codeHash" TEXT NOT NULL UNIQUE,
    "expiresAt" TIMESTAMPTZ NOT NULL,
    "createdBy" TEXT NOT NULL,
    "usedAt" TIMESTAMPTZ,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`,
  `CREATE INDEX IF NOT EXISTS "CloudPairingCode_storeId_idx" ON "CloudPairingCode" ("storeId")`,
  `CREATE TABLE IF NOT EXISTS "CloudDevice" (
    "id" TEXT PRIMARY KEY,
    "companyId" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "deviceKey" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "platform" TEXT,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "tokenVersion" INTEGER NOT NULL DEFAULT 1,
    "metadata" JSONB NOT NULL DEFAULT '{}'::jsonb,
    "pairedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    "lastSeenAt" TIMESTAMPTZ,
    "revokedAt" TIMESTAMPTZ,
    UNIQUE ("storeId", "deviceKey")
  )`,
  `CREATE INDEX IF NOT EXISTS "CloudDevice_storeId_idx" ON "CloudDevice" ("storeId")`,
  `CREATE TABLE IF NOT EXISTS "CloudCatalogItem" (
    "id" TEXT PRIMARY KEY,
    "companyId" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "sku" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" TEXT NOT NULL DEFAULT 'Demo',
    "price" NUMERIC(12,2) NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT TRUE,
    "version" BIGINT NOT NULL DEFAULT 1,
    "updatedBy" TEXT,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE ("storeId", "sku")
  )`,
  `CREATE INDEX IF NOT EXISTS "CloudCatalogItem_storeId_idx" ON "CloudCatalogItem" ("storeId")`,
  `CREATE TABLE IF NOT EXISTS "CloudChange" (
    "sequence" BIGSERIAL PRIMARY KEY,
    "companyId" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`,
  `CREATE INDEX IF NOT EXISTS "CloudChange_store_sequence_idx" ON "CloudChange" ("storeId", "sequence")`,
  `CREATE TABLE IF NOT EXISTS "CloudDeviceCursor" (
    "deviceId" TEXT PRIMARY KEY,
    "lastSequence" BIGINT NOT NULL DEFAULT 0,
    "lastAckAt" TIMESTAMPTZ
  )`,
  `CREATE TABLE IF NOT EXISTS "CloudInboundEvent" (
    "id" TEXT PRIMARY KEY,
    "companyId" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "deviceId" TEXT NOT NULL,
    "eventKey" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "occurredAt" TIMESTAMPTZ NOT NULL,
    "payload" JSONB NOT NULL,
    "receivedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE ("deviceId", "eventKey")
  )`,
  `CREATE INDEX IF NOT EXISTS "CloudInboundEvent_storeId_idx" ON "CloudInboundEvent" ("storeId", "receivedAt")`,
  `CREATE TABLE IF NOT EXISTS "CloudAudit" (
    "id" TEXT PRIMARY KEY,
    "companyId" TEXT NOT NULL,
    "storeId" TEXT,
    "actorType" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "details" JSONB NOT NULL DEFAULT '{}'::jsonb,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`,
  `CREATE INDEX IF NOT EXISTS "CloudAudit_company_created_idx" ON "CloudAudit" ("companyId", "createdAt")`
];

async function ensureCloudTables(){
  if(!tablesPromise){
    tablesPromise=(async()=>{
      for(const sql of tableStatements) await prisma.$executeRawUnsafe(sql);
    })().catch(error=>{tablesPromise=undefined;throw error});
  }
  return tablesPromise;
}

function jsonSafe(value){
  return JSON.parse(JSON.stringify(value,(_,item)=>typeof item==="bigint"?item.toString():item));
}
function send(res,value,status=200){
  return res.status(status).json(jsonSafe(value));
}
function route(handler){
  return async(req,res)=>{
    try{
      await ensureCloudTables();
      await handler(req,res);
    }catch(error){
      console.error("Cloud Store Connector:",error);
      if(error?.name==="ZodError") return res.status(400).json({error:"Ελέγξτε τα στοιχεία της φόρμας.",details:error.issues});
      return res.status(error?.status||500).json({error:error?.publicMessage||error?.message||"Σφάλμα Cloud Store Connector."});
    }
  };
}
function fail(status,message){
  const error=new Error(message);error.status=status;error.publicMessage=message;throw error;
}
function codeHash(code){
  return crypto.createHash("sha256").update(String(code).replace(/[^A-Z0-9]/gi,"").toUpperCase()).digest("hex");
}
function pairingCode(){
  const value=crypto.randomInt(0,100000000).toString().padStart(8,"0");
  return `${value.slice(0,4)}-${value.slice(4)}`;
}
function deviceSecret(){
  return `${process.env.JWT_SECRET}:STORE_DEVICE`;
}
function requireCloudManager(req,res,next){
  if(!["OWNER","ADMIN"].includes(req.user?.role)) return res.status(403).json({error:"Απαιτείται δικαίωμα ιδιοκτήτη ή διαχειριστή."});
  next();
}
async function ownedStore(storeId,companyId){
  const store=await prisma.store.findFirst({where:{id:storeId,companyId,active:true}});
  if(!store) fail(404,"Δεν βρέθηκε ενεργό κατάστημα.");
  return store;
}
async function audit({companyId,storeId=null,actorType,actorId,eventType,details={}}){
  await prisma.$executeRaw`
    INSERT INTO "CloudAudit" ("id","companyId","storeId","actorType","actorId","eventType","details")
    VALUES (${crypto.randomUUID()},${companyId},${storeId},${actorType},${actorId},${eventType},CAST(${JSON.stringify(details)} AS jsonb))
  `;
}
async function change({companyId,storeId,entityType,entityId,action,payload}){
  const rows=await prisma.$queryRaw`
    INSERT INTO "CloudChange" ("companyId","storeId","entityType","entityId","action","payload")
    VALUES (${companyId},${storeId},${entityType},${entityId},${action},CAST(${JSON.stringify(payload)} AS jsonb))
    RETURNING "sequence","createdAt"
  `;
  return rows[0];
}
function deviceToken(device){
  return jwt.sign({
    tokenType:"STORE_DEVICE",
    deviceId:device.id,
    companyId:device.companyId,
    storeId:device.storeId,
    tokenVersion:device.tokenVersion
  },deviceSecret(),{expiresIn:DEVICE_TOKEN_TTL});
}
async function deviceAuth(req,res,next){
  try{
    await ensureCloudTables();
    const token=req.headers.authorization?.replace(/^Bearer\s+/i,"");
    if(!token) return res.status(401).json({error:"Λείπει το device token."});
    const payload=jwt.verify(token,deviceSecret());
    if(payload.tokenType!=="STORE_DEVICE") return res.status(401).json({error:"Μη έγκυρο device token."});
    const rows=await prisma.$queryRaw`
      SELECT * FROM "CloudDevice" WHERE "id"=${payload.deviceId} LIMIT 1
    `;
    const device=rows[0];
    if(!device||device.status!=="ACTIVE"||device.tokenVersion!==payload.tokenVersion) return res.status(401).json({error:"Η συσκευή δεν είναι ενεργή."});
    req.device=device;
    next();
  }catch(error){
    console.error("Device auth:",error);
    res.status(401).json({error:"Το device token έληξε ή ανακλήθηκε."});
  }
}

router.get("/health",route(async(req,res)=>{
  send(res,{ok:true,service:"Cloud Store Connector",version:"14.7.0C",time:new Date().toISOString()});
}));

router.post("/pair",route(async(req,res)=>{
  const body=z.object({
    code:z.string().min(6).max(20),
    deviceName:z.string().min(2).max(120),
    deviceKey:z.string().min(6).max(200).optional(),
    platform:z.string().max(80).optional(),
    metadata:z.record(z.unknown()).optional()
  }).parse(req.body);
  const hash=codeHash(body.code);
  const pairRows=await prisma.$queryRaw`
    SELECT p.*,s."name" AS "storeName",s."active" AS "storeActive"
    FROM "CloudPairingCode" p
    JOIN "Store" s ON s."id"=p."storeId"
    WHERE p."codeHash"=${hash} AND p."usedAt" IS NULL AND p."expiresAt">NOW()
    LIMIT 1
  `;
  const pair=pairRows[0];
  if(!pair||!pair.storeActive) fail(400,"Ο κωδικός σύνδεσης δεν είναι έγκυρος ή έχει λήξει.");

  const deviceKey=body.deviceKey||crypto.randomUUID();
  const existing=await prisma.$queryRaw`
    SELECT * FROM "CloudDevice" WHERE "storeId"=${pair.storeId} AND "deviceKey"=${deviceKey} LIMIT 1
  `;
  let device;
  if(existing[0]){
    const updated=await prisma.$queryRaw`
      UPDATE "CloudDevice"
      SET "name"=${body.deviceName},"platform"=${body.platform||null},"status"='ACTIVE',
          "tokenVersion"="tokenVersion"+1,"metadata"=CAST(${JSON.stringify(body.metadata||{})} AS jsonb),
          "pairedAt"=NOW(),"lastSeenAt"=NOW(),"revokedAt"=NULL
      WHERE "id"=${existing[0].id}
      RETURNING *
    `;
    device=updated[0];
  }else{
    const inserted=await prisma.$queryRaw`
      INSERT INTO "CloudDevice" ("id","companyId","storeId","deviceKey","name","platform","metadata","lastSeenAt")
      VALUES (${crypto.randomUUID()},${pair.companyId},${pair.storeId},${deviceKey},${body.deviceName},${body.platform||null},CAST(${JSON.stringify(body.metadata||{})} AS jsonb),NOW())
      RETURNING *
    `;
    device=inserted[0];
  }
  const consumed=await prisma.$executeRaw`
    UPDATE "CloudPairingCode" SET "usedAt"=NOW() WHERE "id"=${pair.id} AND "usedAt" IS NULL
  `;
  if(consumed!==1) fail(409,"Ο κωδικός σύνδεσης χρησιμοποιήθηκε ήδη.");
  await audit({companyId:pair.companyId,storeId:pair.storeId,actorType:"DEVICE",actorId:device.id,eventType:"DEVICE_PAIRED",details:{name:device.name,platform:device.platform}});
  send(res,{token:deviceToken(device),device:{id:device.id,name:device.name,deviceKey:device.deviceKey,storeId:device.storeId},store:{id:pair.storeId,name:pair.storeName}},201);
}));

router.get("/device/bootstrap",deviceAuth,route(async(req,res)=>{
  const [store,catalog,seq,cursor]=await Promise.all([
    prisma.store.findUnique({where:{id:req.device.storeId},select:{id:true,name:true,address:true,city:true,updatedAt:true}}),
    prisma.$queryRaw`SELECT * FROM "CloudCatalogItem" WHERE "storeId"=${req.device.storeId} AND "active"=TRUE ORDER BY "name" ASC`,
    prisma.$queryRaw`SELECT COALESCE(MAX("sequence"),0) AS value FROM "CloudChange" WHERE "storeId"=${req.device.storeId}`,
    prisma.$queryRaw`SELECT "lastSequence","lastAckAt" FROM "CloudDeviceCursor" WHERE "deviceId"=${req.device.id} LIMIT 1`
  ]);
  await prisma.$executeRaw`UPDATE "CloudDevice" SET "lastSeenAt"=NOW() WHERE "id"=${req.device.id}`;
  send(res,{store,catalog,latestSequence:seq[0]?.value||0,cursor:cursor[0]?.lastSequence||0,serverTime:new Date().toISOString()});
}));

router.post("/device/heartbeat",deviceAuth,route(async(req,res)=>{
  const body=z.object({metadata:z.record(z.unknown()).optional()}).parse(req.body||{});
  await prisma.$executeRaw`
    UPDATE "CloudDevice" SET "lastSeenAt"=NOW(),"metadata"=CAST(${JSON.stringify(body.metadata||req.device.metadata||{})} AS jsonb)
    WHERE "id"=${req.device.id}
  `;
  send(res,{ok:true,serverTime:new Date().toISOString()});
}));

router.get("/device/changes",deviceAuth,route(async(req,res)=>{
  const after=z.coerce.bigint().min(0n).catch(0n).parse(req.query.after||"0");
  const rows=await prisma.$queryRaw`
    SELECT * FROM "CloudChange"
    WHERE "storeId"=${req.device.storeId} AND "sequence">${after}
    ORDER BY "sequence" ASC LIMIT 200
  `;
  await prisma.$executeRaw`UPDATE "CloudDevice" SET "lastSeenAt"=NOW() WHERE "id"=${req.device.id}`;
  send(res,{changes:rows,nextCursor:rows.length?rows[rows.length-1].sequence:after,hasMore:rows.length===200});
}));

router.post("/device/ack",deviceAuth,route(async(req,res)=>{
  const body=z.object({sequence:z.union([z.string(),z.number(),z.bigint()]).transform(value=>BigInt(value))}).parse(req.body);
  await prisma.$executeRaw`
    INSERT INTO "CloudDeviceCursor" ("deviceId","lastSequence","lastAckAt")
    VALUES (${req.device.id},${body.sequence},NOW())
    ON CONFLICT ("deviceId") DO UPDATE
    SET "lastSequence"=GREATEST("CloudDeviceCursor"."lastSequence",EXCLUDED."lastSequence"),"lastAckAt"=NOW()
  `;
  send(res,{ok:true,sequence:body.sequence});
}));

router.post("/device/events",deviceAuth,route(async(req,res)=>{
  const body=z.object({events:z.array(z.object({
    id:z.string().min(6).max(200),
    type:z.string().min(2).max(80),
    occurredAt:z.coerce.date(),
    payload:z.record(z.unknown())
  })).min(1).max(100)}).parse(req.body);
  let accepted=0,duplicates=0;
  for(const event of body.events){
    const result=await prisma.$executeRaw`
      INSERT INTO "CloudInboundEvent" ("id","companyId","storeId","deviceId","eventKey","eventType","occurredAt","payload")
      VALUES (${crypto.randomUUID()},${req.device.companyId},${req.device.storeId},${req.device.id},${event.id},${event.type},${event.occurredAt},CAST(${JSON.stringify(event.payload)} AS jsonb))
      ON CONFLICT ("deviceId","eventKey") DO NOTHING
    `;
    if(result===1) accepted++; else duplicates++;
  }
  await prisma.$executeRaw`UPDATE "CloudDevice" SET "lastSeenAt"=NOW() WHERE "id"=${req.device.id}`;
  send(res,{ok:true,accepted,duplicates});
}));

router.get("/stores/:storeId/overview",auth,requireCloudManager,route(async(req,res)=>{
  const store=await ownedStore(req.params.storeId,req.user.companyId);
  const [devices,catalog,latestChange,auditRows]=await Promise.all([
    prisma.$queryRaw`SELECT * FROM "CloudDevice" WHERE "storeId"=${store.id} ORDER BY "pairedAt" DESC`,
    prisma.$queryRaw`SELECT * FROM "CloudCatalogItem" WHERE "storeId"=${store.id} ORDER BY "name" ASC`,
    prisma.$queryRaw`SELECT MAX("sequence") AS "sequence",MAX("createdAt") AS "createdAt" FROM "CloudChange" WHERE "storeId"=${store.id}`,
    prisma.$queryRaw`SELECT * FROM "CloudAudit" WHERE "storeId"=${store.id} ORDER BY "createdAt" DESC LIMIT 20`
  ]);
  const now=Date.now();
  const normalized=devices.map(device=>({...device,isOnline:device.status==="ACTIVE"&&device.lastSeenAt&&now-new Date(device.lastSeenAt).getTime()<120000}));
  send(res,{store,devices:normalized,catalog,latestChange:latestChange[0]||null,audit:auditRows});
}));

router.post("/stores/:storeId/pairing-code",auth,requireCloudManager,route(async(req,res)=>{
  const store=await ownedStore(req.params.storeId,req.user.companyId);
  const body=z.object({minutes:z.coerce.number().int().min(5).max(120).default(15)}).parse(req.body||{});
  await prisma.$executeRaw`UPDATE "CloudPairingCode" SET "expiresAt"=NOW() WHERE "storeId"=${store.id} AND "usedAt" IS NULL`;
  let code,id;
  for(let i=0;i<5;i++){
    code=pairingCode();id=crypto.randomUUID();
    try{
      await prisma.$executeRaw`
        INSERT INTO "CloudPairingCode" ("id","companyId","storeId","codeHash","expiresAt","createdBy")
        VALUES (${id},${req.user.companyId},${store.id},${codeHash(code)},NOW()+make_interval(mins => ${body.minutes}),${req.user.id})
      `;
      break;
    }catch(error){
      if(i===4) throw error;
    }
  }
  const rows=await prisma.$queryRaw`SELECT "expiresAt" FROM "CloudPairingCode" WHERE "id"=${id}`;
  await audit({companyId:req.user.companyId,storeId:store.id,actorType:"USER",actorId:req.user.id,eventType:"PAIRING_CODE_CREATED",details:{expiresAt:rows[0].expiresAt}});
  send(res,{code,expiresAt:rows[0].expiresAt,store:{id:store.id,name:store.name}},201);
}));

router.post("/stores/:storeId/demo-catalog",auth,requireCloudManager,route(async(req,res)=>{
  const store=await ownedStore(req.params.storeId,req.user.companyId);
  const body=z.object({
    sku:z.string().min(2).max(80).default("DEMO-COFFEE-001"),
    name:z.string().min(2).max(160).default("Freddo Espresso Demo"),
    category:z.string().min(2).max(120).default("Καφέδες"),
    price:z.coerce.number().min(0).max(99999).default(2.5)
  }).parse(req.body||{});
  const existing=await prisma.$queryRaw`SELECT * FROM "CloudCatalogItem" WHERE "storeId"=${store.id} AND "sku"=${body.sku} LIMIT 1`;
  let item;
  if(existing[0]){
    const rows=await prisma.$queryRaw`
      UPDATE "CloudCatalogItem"
      SET "name"=${body.name},"category"=${body.category},"price"=${body.price},"active"=TRUE,
          "version"="version"+1,"updatedBy"=${req.user.id},"updatedAt"=NOW()
      WHERE "id"=${existing[0].id} RETURNING *
    `;
    item=rows[0];
  }else{
    const rows=await prisma.$queryRaw`
      INSERT INTO "CloudCatalogItem" ("id","companyId","storeId","sku","name","category","price","updatedBy")
      VALUES (${crypto.randomUUID()},${req.user.companyId},${store.id},${body.sku},${body.name},${body.category},${body.price},${req.user.id})
      RETURNING *
    `;
    item=rows[0];
  }
  const payload={id:item.id,sku:item.sku,name:item.name,category:item.category,price:Number(item.price),active:item.active,version:item.version.toString()};
  const queued=await change({companyId:req.user.companyId,storeId:store.id,entityType:"CATALOG_ITEM",entityId:item.id,action:existing[0]?"UPDATE":"CREATE",payload});
  await audit({companyId:req.user.companyId,storeId:store.id,actorType:"USER",actorId:req.user.id,eventType:"DEMO_CATALOG_SAVED",details:{sku:item.sku,price:Number(item.price),sequence:queued.sequence.toString()}});
  send(res,{item,change:queued},existing[0]?200:201);
}));

router.patch("/stores/:storeId/catalog/:itemId",auth,requireCloudManager,route(async(req,res)=>{
  const store=await ownedStore(req.params.storeId,req.user.companyId);
  const body=z.object({name:z.string().min(2).max(160),category:z.string().min(2).max(120),price:z.coerce.number().min(0).max(99999),active:z.boolean()}).parse(req.body);
  const found=await prisma.$queryRaw`SELECT * FROM "CloudCatalogItem" WHERE "id"=${req.params.itemId} AND "storeId"=${store.id} LIMIT 1`;
  if(!found[0]) fail(404,"Δεν βρέθηκε προϊόν cloud catalog.");
  const rows=await prisma.$queryRaw`
    UPDATE "CloudCatalogItem"
    SET "name"=${body.name},"category"=${body.category},"price"=${body.price},"active"=${body.active},
        "version"="version"+1,"updatedBy"=${req.user.id},"updatedAt"=NOW()
    WHERE "id"=${found[0].id} RETURNING *
  `;
  const item=rows[0];
  const payload={id:item.id,sku:item.sku,name:item.name,category:item.category,price:Number(item.price),active:item.active,version:item.version.toString()};
  const queued=await change({companyId:req.user.companyId,storeId:store.id,entityType:"CATALOG_ITEM",entityId:item.id,action:"UPDATE",payload});
  await audit({companyId:req.user.companyId,storeId:store.id,actorType:"USER",actorId:req.user.id,eventType:"CATALOG_ITEM_UPDATED",details:{sku:item.sku,price:Number(item.price),sequence:queued.sequence.toString()}});
  send(res,{item,change:queued});
}));

router.post("/devices/:deviceId/revoke",auth,requireCloudManager,route(async(req,res)=>{
  const rows=await prisma.$queryRaw`
    SELECT * FROM "CloudDevice" WHERE "id"=${req.params.deviceId} AND "companyId"=${req.user.companyId} LIMIT 1
  `;
  const device=rows[0];
  if(!device) fail(404,"Δεν βρέθηκε συσκευή.");
  await prisma.$executeRaw`
    UPDATE "CloudDevice" SET "status"='REVOKED',"tokenVersion"="tokenVersion"+1,"revokedAt"=NOW() WHERE "id"=${device.id}
  `;
  await audit({companyId:req.user.companyId,storeId:device.storeId,actorType:"USER",actorId:req.user.id,eventType:"DEVICE_REVOKED",details:{deviceId:device.id,name:device.name}});
  send(res,{ok:true});
}));

router.post("/devices/:deviceId/reactivate",auth,requireCloudManager,route(async(req,res)=>{
  const rows=await prisma.$queryRaw`
    UPDATE "CloudDevice" SET "status"='ACTIVE',"revokedAt"=NULL,"tokenVersion"="tokenVersion"+1
    WHERE "id"=${req.params.deviceId} AND "companyId"=${req.user.companyId}
    RETURNING *
  `;
  if(!rows[0]) fail(404,"Δεν βρέθηκε συσκευή.");
  await audit({companyId:req.user.companyId,storeId:rows[0].storeId,actorType:"USER",actorId:req.user.id,eventType:"DEVICE_REACTIVATED",details:{deviceId:rows[0].id,name:rows[0].name}});
  send(res,{ok:true});
}));

export default router;
