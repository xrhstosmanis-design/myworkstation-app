import crypto from "crypto";
import {Router} from "express";
import {prisma} from "../prisma.js";

const router=Router();
let schemaPromise;

export function ensureBackupMonitorSchema(){
  if(!schemaPromise)schemaPromise=(async()=>{
    await prisma.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS "PlatformBackupRun" (
      "runId" TEXT PRIMARY KEY,"status" TEXT NOT NULL,
      "startedAt" TIMESTAMPTZ NOT NULL,"completedAt" TIMESTAMPTZ,
      "checksum" TEXT,"sizeBytes" BIGINT NOT NULL DEFAULT 0,"objectKey" TEXT,
      "appRevision" TEXT NOT NULL DEFAULT 'UNKNOWN',"dryRunStatus" TEXT NOT NULL DEFAULT 'NOT_RUN',
      "errorCode" TEXT,"createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),"updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      CHECK ("status" IN ('STARTED','SUCCEEDED','FAILED')),
      CHECK ("dryRunStatus" IN ('NOT_RUN','PASSED')))`);
    await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "PlatformBackupRun_started_idx" ON "PlatformBackupRun" ("startedAt" DESC)`);
  })().catch(error=>{schemaPromise=undefined;throw error});
  return schemaPromise;
}

function authorized(req){
  const secret=String(process.env.BACKUP_MONITOR_SECRET||"");
  const timestamp=String(req.headers["x-backup-timestamp"]||"");
  const signature=String(req.headers["x-backup-signature"]||"").toLowerCase();
  if(secret.length<24||!/^[0-9]{10,13}$/.test(timestamp)||!/^[a-f0-9]{64}$/.test(signature))return false;
  const millis=Number(timestamp)*1000;
  if(!Number.isFinite(millis)||Math.abs(Date.now()-millis)>5*60*1000)return false;
  const body=JSON.stringify(req.body||{});
  const expected=crypto.createHmac("sha256",secret).update(`${timestamp}.${body}`).digest("hex");
  return crypto.timingSafeEqual(Buffer.from(signature,"hex"),Buffer.from(expected,"hex"));
}

router.post("/",async(req,res,next)=>{
  try{
    if(!process.env.BACKUP_MONITOR_SECRET)return res.status(503).json({error:"Backup monitoring is not configured."});
    if(!authorized(req))return res.status(401).json({error:"Invalid backup monitor signature."});
    const body=req.body||{},runId=String(body.runId||""),status=String(body.status||"");
    if(!/^[A-Za-z0-9._:-]{8,100}$/.test(runId)||!["STARTED","SUCCEEDED","FAILED"].includes(status))return res.status(400).json({error:"Invalid backup monitor payload."});
    const startedAt=new Date(body.startedAt),completedAt=body.completedAt?new Date(body.completedAt):null;
    if(Number.isNaN(startedAt.getTime())||(completedAt&&Number.isNaN(completedAt.getTime())))return res.status(400).json({error:"Invalid backup timestamps."});
    const checksum=/^[a-f0-9]{64}$/.test(String(body.checksum||""))?String(body.checksum):null;
    const sizeBytes=Math.max(0,Math.trunc(Number(body.sizeBytes||0))),objectKey=String(body.objectKey||"").slice(0,500)||null;
    const appRevision=String(body.appRevision||"UNKNOWN").slice(0,100),dryRunStatus=body.dryRunStatus==="PASSED"?"PASSED":"NOT_RUN",errorCode=String(body.errorCode||"").slice(0,100)||null;
    if(status==="SUCCEEDED"&&(!checksum||sizeBytes<1||dryRunStatus!=="PASSED"))return res.status(400).json({error:"Successful backup evidence is incomplete."});
    await ensureBackupMonitorSchema();
    await prisma.$executeRaw`
      INSERT INTO "PlatformBackupRun" ("runId","status","startedAt","completedAt","checksum","sizeBytes","objectKey","appRevision","dryRunStatus","errorCode","updatedAt")
      VALUES (${runId},${status},${startedAt},${completedAt},${checksum},${BigInt(sizeBytes)},${objectKey},${appRevision},${dryRunStatus},${errorCode},NOW())
      ON CONFLICT ("runId") DO UPDATE SET "status"=EXCLUDED."status","completedAt"=EXCLUDED."completedAt","checksum"=EXCLUDED."checksum","sizeBytes"=EXCLUDED."sizeBytes","objectKey"=EXCLUDED."objectKey","appRevision"=EXCLUDED."appRevision","dryRunStatus"=EXCLUDED."dryRunStatus","errorCode"=EXCLUDED."errorCode","updatedAt"=NOW()`;
    res.json({ok:true,runId,status});
  }catch(error){next(error)}
});

export async function backupMonitorSummary(){
  await ensureBackupMonitorSchema();
  const runs=await prisma.$queryRaw`SELECT "runId","status","startedAt","completedAt","checksum","sizeBytes","objectKey","appRevision","dryRunStatus","errorCode" FROM "PlatformBackupRun" ORDER BY "startedAt" DESC LIMIT 20`;
  const normalized=runs.map(row=>({...row,sizeBytes:Number(row.sizeBytes||0)}));
  const latest=normalized[0]||null,lastSuccess=normalized.find(row=>row.status==="SUCCEEDED")||null;
  const overdue=!lastSuccess||Date.now()-new Date(lastSuccess.completedAt||lastSuccess.startedAt).getTime()>4*60*60*1000;
  const failed=latest?.status==="FAILED"||(latest?.status==="STARTED"&&Date.now()-new Date(latest.startedAt).getTime()>60*60*1000);
  return{configured:String(process.env.BACKUP_MONITOR_SECRET||"").length>=24,scheduleHours:3,overdue,failed,status:failed?"FAILED":overdue?"OVERDUE":"OK",latest,lastSuccess,runs:normalized};
}

export default router;
