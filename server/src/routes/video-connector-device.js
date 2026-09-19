import {Router} from "express";
import crypto from "node:crypto";
import jwt from "jsonwebtoken";
import {z} from "zod";
import {prisma} from "../prisma.js";
import {companyModuleState} from "../middleware/module-access.js";
import {ensureVideoEventsSchema} from "../video-events-bootstrap.js";

const router=Router();
const CONNECTOR_TYPE="VIDEO_DAHUA_READONLY";
const MAX_CHUNK_BYTES=5*1024*1024;
const MAX_ARTIFACT_BYTES=75*1024*1024;
const deviceSecret=()=>`${process.env.JWT_SECRET}:STORE_DEVICE`;
const safeError=error=>String(error?.message||error||"VIDEO_CONNECTOR_ERROR").replace(/https?:\/\/[^\s@]+@/gi,"[redacted]@").slice(0,500);

async function deviceAuth(req,res,next){
  try{
    const token=req.headers.authorization?.replace(/^Bearer\s+/i,"");
    if(!token)return res.status(401).json({error:"Λείπει το device token."});
    const payload=jwt.verify(token,deviceSecret());
    if(payload.tokenType!=="STORE_DEVICE")return res.status(401).json({error:"Μη έγκυρο device token."});
    const rows=await prisma.$queryRaw`SELECT * FROM "CloudDevice" WHERE "id"=${payload.deviceId} LIMIT 1`,device=rows[0];
    if(!device||device.status!=="ACTIVE"||device.tokenVersion!==payload.tokenVersion)return res.status(401).json({error:"Η συσκευή δεν είναι ενεργή."});
    const modules=await companyModuleState(device.companyId);
    if(!modules?.licenseAllowed||!modules.activeModules.includes("VIDEO_EVENTS"))return res.status(403).json({error:"Το Video Events δεν είναι ενεργό για την εταιρεία."});
    req.device=device;next();
  }catch{return res.status(401).json({error:"Το device token έληξε ή ανακλήθηκε."})}
}

router.use(deviceAuth);
let schemaReady;
router.use(async(req,res,next)=>{try{schemaReady||=(ensureVideoEventsSchema().catch(error=>{schemaReady=undefined;throw error}));await schemaReady;next()}catch(error){next(error)}});

router.post("/register",async(req,res,next)=>{
  try{
    const body=z.object({version:z.string().trim().min(1).max(40),protocol:z.enum(["DAHUA_CGI","ONVIF"]),deviceName:z.string().trim().min(2).max(120),cameraKeys:z.array(z.string().trim().min(1).max(80)).max(64).default([]),capabilities:z.object({health:z.boolean(),time:z.boolean(),snapshot:z.boolean(),clip:z.boolean()})}).parse(req.body||{});
    const rows=await prisma.$queryRaw`
      INSERT INTO "ConnectorDevice" ("id","companyId","storeId","connectorType","deviceName","version","status","lastSeenAt","cloudDeviceId","observerMode","healthJson")
      VALUES (${crypto.randomUUID()},${req.device.companyId},${req.device.storeId},${CONNECTOR_TYPE},${body.deviceName},${body.version},'DEGRADED',NOW(),${req.device.id},'READ_ONLY',${JSON.stringify({protocol:body.protocol,cameraKeys:body.cameraKeys,capabilities:body.capabilities,nvrOnline:false,outboundOnly:true})}::jsonb)
      ON CONFLICT ("storeId","connectorType") DO UPDATE SET "deviceName"=EXCLUDED."deviceName","version"=EXCLUDED."version","status"='DEGRADED',"lastSeenAt"=NOW(),"cloudDeviceId"=EXCLUDED."cloudDeviceId","observerMode"='READ_ONLY',"healthJson"=EXCLUDED."healthJson","updatedAt"=NOW()
      RETURNING "id","status","lastSeenAt"`;
    await prisma.$executeRaw`UPDATE "StoreVideoConnection" SET "connectionStatus"='CONNECTOR_ONLINE',"lastTestedAt"=NOW(),"updatedAt"=NOW() WHERE "companyId"=${req.device.companyId} AND "storeId"=${req.device.storeId}`;
    res.status(201).json({ok:true,connector:rows[0],readOnly:true,outboundOnly:true});
  }catch(error){next(error)}
});

router.post("/heartbeat",async(req,res,next)=>{
  try{
    const body=z.object({version:z.string().trim().min(1).max(40),processRunning:z.boolean(),nvrOnline:z.boolean(),protocol:z.enum(["DAHUA_CGI","ONVIF"]),latencyMs:z.coerce.number().int().min(0).max(120000).optional().nullable(),nvrTime:z.string().datetime({offset:true}).optional().nullable(),systemTime:z.string().datetime({offset:true}).optional().nullable(),deviceInfo:z.record(z.unknown()).optional(),errorCode:z.string().trim().max(160).optional().nullable()}).parse(req.body||{});
    const connectorRows=await prisma.$queryRaw`UPDATE "ConnectorDevice" SET "version"=${body.version},"status"=${body.processRunning&&body.nvrOnline?'ONLINE':body.processRunning?'DEGRADED':'OFFLINE'},"lastSeenAt"=NOW(),"healthJson"=${JSON.stringify({processRunning:body.processRunning,nvrOnline:body.nvrOnline,protocol:body.protocol,latencyMs:body.latencyMs??null,deviceInfo:body.deviceInfo||{},errorCode:body.errorCode||null,outboundOnly:true,readOnly:true})}::jsonb,"updatedAt"=NOW() WHERE "companyId"=${req.device.companyId} AND "storeId"=${req.device.storeId} AND "cloudDeviceId"=${req.device.id} AND "connectorType"=${CONNECTOR_TYPE} RETURNING "id"`;
    if(!connectorRows[0])return res.status(409).json({error:"Ο Video Connector δεν έχει καταχωριστεί ακόμη."});
    let timeResult=null;
    if(body.nvrOnline&&body.nvrTime&&body.systemTime){
      const nvrTime=new Date(body.nvrTime),systemTime=new Date(body.systemTime),measuredOffsetSeconds=Math.round((nvrTime-systemTime)/1000),absolute=Math.abs(measuredOffsetSeconds),timeSyncStatus=absolute<=5?"IN_SYNC":absolute<=60?"DRIFT":"OUT_OF_SYNC";
      timeResult={nvrTime,systemTime,measuredOffsetSeconds,timeSyncStatus};
      await prisma.$executeRaw`UPDATE "StoreVideoConnection" SET "connectionStatus"='ONLINE',"lastTestedAt"=NOW(),"timeOffsetSeconds"=${measuredOffsetSeconds},"timeSyncStatus"=${timeSyncStatus},"timeCheckSource"='NVR_API',"lastSystemTime"=${systemTime},"lastNvrTime"=${nvrTime},"measuredOffsetSeconds"=${measuredOffsetSeconds},"timeDeviationSeconds"=0,"lastTimeCheckedAt"=NOW(),"updatedAt"=NOW() WHERE "companyId"=${req.device.companyId} AND "storeId"=${req.device.storeId}`;
    }else await prisma.$executeRaw`UPDATE "StoreVideoConnection" SET "connectionStatus"=${body.nvrOnline?'ONLINE':'OFFLINE'},"lastTestedAt"=NOW(),"updatedAt"=NOW() WHERE "companyId"=${req.device.companyId} AND "storeId"=${req.device.storeId}`;
    const commands=await prisma.$queryRaw`UPDATE "VideoConnectorCommand" SET "status"='CLAIMED',"claimedAt"=NOW(),"connectorDeviceId"=${connectorRows[0].id} WHERE "id" IN (SELECT "id" FROM "VideoConnectorCommand" WHERE "companyId"=${req.device.companyId} AND "storeId"=${req.device.storeId} AND "status"='PENDING' AND "expiresAt">NOW() ORDER BY "createdAt" LIMIT 3 FOR UPDATE SKIP LOCKED) RETURNING "id","commandType","cameraKey","videoEventId","payload","expiresAt"`;
    res.json({ok:true,serverTime:new Date().toISOString(),timeResult,commands});
  }catch(error){next(error)}
});

router.post("/commands/:commandId/complete",async(req,res,next)=>{
  try{
    const body=z.object({result:z.record(z.unknown()).default({})}).parse(req.body||{});
    const changed=await prisma.$executeRaw`UPDATE "VideoConnectorCommand" SET "status"='COMPLETED',"result"=${JSON.stringify(body.result)}::jsonb,"completedAt"=NOW() WHERE "id"=${req.params.commandId} AND "companyId"=${req.device.companyId} AND "storeId"=${req.device.storeId} AND "status"='CLAIMED'`;
    if(!changed)return res.status(404).json({error:"Δεν βρέθηκε ενεργή εντολή."});
    res.json({ok:true});
  }catch(error){next(error)}
});

router.post("/commands/:commandId/chunks",async(req,res,next)=>{
  try{
    const body=z.object({kind:z.enum(["SNAPSHOT","CLIP"]),cameraKey:z.string().trim().max(80).optional().nullable(),mimeType:z.enum(["image/jpeg","image/png","video/mp4"]),filename:z.string().trim().min(1).max(180),chunkIndex:z.coerce.number().int().min(0).max(999),chunkBase64:z.string().min(1),final:z.boolean().default(false),sha256:z.string().regex(/^[a-f0-9]{64}$/i).optional().nullable(),totalBytes:z.coerce.number().int().min(1).max(MAX_ARTIFACT_BYTES).optional().nullable()}).parse(req.body||{}),bytes=Buffer.from(body.chunkBase64,"base64");
    if(!bytes.length||bytes.length>MAX_CHUNK_BYTES)return res.status(413).json({error:"Μη έγκυρο μέγεθος video chunk."});
    const commands=await prisma.$queryRaw`SELECT "id","videoEventId","commandType" FROM "VideoConnectorCommand" WHERE "id"=${req.params.commandId} AND "companyId"=${req.device.companyId} AND "storeId"=${req.device.storeId} AND "status"='CLAIMED' LIMIT 1`,command=commands[0];
    if(!command)return res.status(404).json({error:"Δεν βρέθηκε ενεργή εντολή."});
    const expected=command.commandType==="SNAPSHOT"?"SNAPSHOT":"CLIP";if(body.kind!==expected)return res.status(400).json({error:"Ο τύπος αρχείου δεν ταιριάζει με την εντολή."});
    const artifacts=await prisma.$queryRaw`INSERT INTO "VideoMediaArtifact" ("id","companyId","storeId","commandId","videoEventId","cameraKey","kind","mimeType","filename","expiresAt") VALUES (${crypto.randomUUID()},${req.device.companyId},${req.device.storeId},${command.id},${command.videoEventId||null},${body.cameraKey||null},${body.kind},${body.mimeType},${body.filename},NOW()+INTERVAL '24 hours') ON CONFLICT ("commandId") DO UPDATE SET "mimeType"=EXCLUDED."mimeType","filename"=EXCLUDED."filename" RETURNING "id"`,artifactId=artifacts[0].id;
    await prisma.$executeRaw`INSERT INTO "VideoMediaArtifactChunk" ("artifactId","chunkIndex","bytes") VALUES (${artifactId},${body.chunkIndex},${bytes}) ON CONFLICT ("artifactId","chunkIndex") DO UPDATE SET "bytes"=EXCLUDED."bytes"`;
    if(body.final){
      const chunks=await prisma.$queryRaw`SELECT "chunkIndex","bytes" FROM "VideoMediaArtifactChunk" WHERE "artifactId"=${artifactId} ORDER BY "chunkIndex"`,combined=Buffer.concat(chunks.map(row=>Buffer.from(row.bytes)));
      if(combined.length>MAX_ARTIFACT_BYTES||body.totalBytes&&combined.length!==body.totalBytes)return res.status(400).json({error:"Το τελικό μέγεθος του αρχείου δεν συμφωνεί."});
      const sha256=crypto.createHash("sha256").update(combined).digest("hex");if(body.sha256&&sha256!==body.sha256.toLowerCase())return res.status(400).json({error:"Το checksum του αρχείου δεν συμφωνεί."});
      const updates=[prisma.$executeRaw`UPDATE "VideoMediaArtifact" SET "status"='READY',"byteLength"=${combined.length},"sha256"=${sha256},"completedAt"=NOW() WHERE "id"=${artifactId}`,prisma.$executeRaw`UPDATE "VideoConnectorCommand" SET "status"='COMPLETED',"result"=${JSON.stringify({artifactId,kind:body.kind,byteLength:combined.length,sha256})}::jsonb,"completedAt"=NOW() WHERE "id"=${command.id}`];if(command.videoEventId)updates.push(prisma.$executeRaw`UPDATE "VideoOperationalEvent" SET "clipStatus"='AVAILABLE' WHERE "id"=${command.videoEventId} AND "companyId"=${req.device.companyId} AND "storeId"=${req.device.storeId}`);await prisma.$transaction(updates);
    }
    res.json({ok:true,artifactId,completed:body.final});
  }catch(error){next(error)}
});

router.post("/commands/:commandId/fail",async(req,res,next)=>{
  try{const body=z.object({errorCode:z.string().trim().min(1).max(160)}).parse(req.body||{}),commands=await prisma.$queryRaw`UPDATE "VideoConnectorCommand" SET "status"='FAILED',"errorCode"=${body.errorCode},"completedAt"=NOW() WHERE "id"=${req.params.commandId} AND "companyId"=${req.device.companyId} AND "storeId"=${req.device.storeId} AND "status"='CLAIMED' RETURNING "videoEventId"`;if(!commands[0])return res.status(404).json({error:"Δεν βρέθηκε ενεργή εντολή."});if(commands[0].videoEventId)await prisma.$executeRaw`UPDATE "VideoOperationalEvent" SET "clipStatus"='FAILED' WHERE "id"=${commands[0].videoEventId} AND "companyId"=${req.device.companyId} AND "storeId"=${req.device.storeId}`;res.json({ok:true})}catch(error){next(error)}
});

router.use((error,req,res,next)=>{if(res.headersSent)return next(error);if(error?.name==="ZodError")return res.status(400).json({error:"Μη έγκυρο αίτημα Video Connector.",details:error.issues});console.error("Video Connector device:",safeError(error));res.status(500).json({error:"Αποτυχία ασφαλούς λειτουργίας Video Connector."})});

export default router;
