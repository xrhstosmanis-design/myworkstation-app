import crypto from "node:crypto";
import {prisma} from "../prisma.js";

export async function videoConnectorStatus(companyId,storeId,db=prisma){
  const rows=await db.$queryRaw`SELECT "id","deviceName","version","status","lastSeenAt","healthJson" FROM "ConnectorDevice" WHERE "companyId"=${companyId} AND "storeId"=${storeId} AND "connectorType"='VIDEO_DAHUA_READONLY' LIMIT 1`,row=rows[0],online=Boolean(row?.lastSeenAt&&Date.now()-new Date(row.lastSeenAt).getTime()<90000&&row.status==="ONLINE");
  return row?{...row,online}:null;
}

export async function enqueueVideoCommand({companyId,storeId,commandType,cameraKey=null,videoEventId=null,payload={},ttlSeconds=300},db=prisma){
  if(videoEventId){
    const existing=await db.$queryRaw`SELECT "id","status","createdAt","claimedAt","expiresAt" FROM "VideoConnectorCommand" WHERE "companyId"=${companyId} AND "storeId"=${storeId} AND "videoEventId"=${videoEventId} AND "commandType"=${commandType} AND "status" IN ('PENDING','CLAIMED') AND "expiresAt">NOW() ORDER BY "createdAt" DESC LIMIT 1`;
    const row=existing[0];
    if(row?.status==="PENDING")return row;
    if(row?.status==="CLAIMED"){
      const claimedAt=row.claimedAt?new Date(row.claimedAt).getTime():0;
      if(claimedAt&&Date.now()-claimedAt<90000)return row;
      await db.$executeRaw`UPDATE "VideoConnectorCommand" SET "status"='FAILED',"errorCode"='STALE_CLAIM_REQUEUED',"completedAt"=NOW() WHERE "id"=${row.id} AND "status"='CLAIMED'`;
    }
  }
  const rows=await db.$queryRaw`INSERT INTO "VideoConnectorCommand" ("id","companyId","storeId","commandType","cameraKey","videoEventId","payload","expiresAt") VALUES (${crypto.randomUUID()},${companyId},${storeId},${commandType},${cameraKey},${videoEventId},${JSON.stringify(payload)}::jsonb,NOW()+(${ttlSeconds}::integer*INTERVAL '1 second')) RETURNING "id","status","createdAt","expiresAt"`;return rows[0]
}

export async function videoCommandStatus({companyId,storeId,commandId},db=prisma){
  const rows=await db.$queryRaw`SELECT c."id",c."commandType",c."status",c."result",c."errorCode",c."createdAt",c."claimedAt",c."completedAt",a."id" AS "artifactId",a."kind",a."mimeType",a."filename",a."byteLength",a."status" AS "artifactStatus" FROM "VideoConnectorCommand" c LEFT JOIN "VideoMediaArtifact" a ON a."commandId"=c."id" AND a."expiresAt">NOW() WHERE c."id"=${commandId} AND c."companyId"=${companyId} AND c."storeId"=${storeId} LIMIT 1`;const row=rows[0];return row?{...row,byteLength:Number(row.byteLength||0)}:null
}

export async function readyVideoArtifact({companyId,storeId,artifactId},db=prisma){
  const artifacts=await db.$queryRaw`SELECT "id","mimeType","filename","byteLength","sha256","kind" FROM "VideoMediaArtifact" WHERE "id"=${artifactId} AND "companyId"=${companyId} AND "storeId"=${storeId} AND "status"='READY' AND "expiresAt">NOW() LIMIT 1`,artifact=artifacts[0];if(!artifact)return null;
  const chunks=await db.$queryRaw`SELECT "bytes" FROM "VideoMediaArtifactChunk" WHERE "artifactId"=${artifactId} ORDER BY "chunkIndex"`;return {...artifact,byteLength:Number(artifact.byteLength||0),bytes:Buffer.concat(chunks.map(row=>Buffer.from(row.bytes)))}
}

export async function latestEventArtifact({companyId,storeId,videoEventId,kind="CLIP"},db=prisma){
  const rows=await db.$queryRaw`SELECT "id","mimeType","filename","byteLength","status" FROM "VideoMediaArtifact" WHERE "companyId"=${companyId} AND "storeId"=${storeId} AND "videoEventId"=${videoEventId} AND "kind"=${kind} AND "status"='READY' AND "expiresAt">NOW() ORDER BY "completedAt" DESC LIMIT 1`;const row=rows[0];return row?{...row,byteLength:Number(row.byteLength||0)}:null
}
