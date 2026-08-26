import {prisma} from "./prisma.js";
import crypto from "node:crypto";

export async function ensureVideoEventsSchema(){
  await prisma.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS "StoreVideoConnection" (
    "id" TEXT PRIMARY KEY,"companyId" TEXT NOT NULL,"storeId" TEXT NOT NULL UNIQUE,
    "provider" TEXT NOT NULL,"protocol" TEXT NOT NULL,"endpoint" TEXT NOT NULL,"username" TEXT,
    "passwordEnc" TEXT,"active" BOOLEAN NOT NULL DEFAULT FALSE,"timeOffsetSeconds" INTEGER NOT NULL DEFAULT 0,"retentionDays" INTEGER NOT NULL DEFAULT 30,
    "privacyMode" TEXT NOT NULL DEFAULT 'EVENT_ONLY',"audioEnabled" BOOLEAN NOT NULL DEFAULT FALSE,"privacyNoticeAcknowledgedAt" TIMESTAMPTZ,
    "connectionStatus" TEXT NOT NULL DEFAULT 'NOT_TESTED',"lastTestedAt" TIMESTAMPTZ,
    "timeSyncStatus" TEXT NOT NULL DEFAULT 'NOT_CHECKED',"timeCheckSource" TEXT,
    "lastSystemTime" TIMESTAMPTZ,"lastNvrTime" TIMESTAMPTZ,"measuredOffsetSeconds" INTEGER,
    "timeDeviationSeconds" INTEGER,"lastTimeCheckedAt" TIMESTAMPTZ,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),"updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT "StoreVideoConnection_company_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE,
    CONSTRAINT "StoreVideoConnection_store_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE
  )`);
  await prisma.$executeRawUnsafe(`ALTER TABLE "StoreVideoConnection" ADD COLUMN IF NOT EXISTS "timeSyncStatus" TEXT NOT NULL DEFAULT 'NOT_CHECKED'`);
  await prisma.$executeRawUnsafe(`ALTER TABLE "StoreVideoConnection" ADD COLUMN IF NOT EXISTS "timeCheckSource" TEXT`);
  await prisma.$executeRawUnsafe(`ALTER TABLE "StoreVideoConnection" ADD COLUMN IF NOT EXISTS "lastSystemTime" TIMESTAMPTZ`);
  await prisma.$executeRawUnsafe(`ALTER TABLE "StoreVideoConnection" ADD COLUMN IF NOT EXISTS "lastNvrTime" TIMESTAMPTZ`);
  await prisma.$executeRawUnsafe(`ALTER TABLE "StoreVideoConnection" ADD COLUMN IF NOT EXISTS "measuredOffsetSeconds" INTEGER`);
  await prisma.$executeRawUnsafe(`ALTER TABLE "StoreVideoConnection" ADD COLUMN IF NOT EXISTS "timeDeviationSeconds" INTEGER`);
  await prisma.$executeRawUnsafe(`ALTER TABLE "StoreVideoConnection" ADD COLUMN IF NOT EXISTS "lastTimeCheckedAt" TIMESTAMPTZ`);
  await prisma.$executeRawUnsafe(`ALTER TABLE "StoreVideoConnection" ADD COLUMN IF NOT EXISTS "retentionDays" INTEGER NOT NULL DEFAULT 30`);
  await prisma.$executeRawUnsafe(`ALTER TABLE "StoreVideoConnection" ADD COLUMN IF NOT EXISTS "privacyMode" TEXT NOT NULL DEFAULT 'EVENT_ONLY'`);
  await prisma.$executeRawUnsafe(`ALTER TABLE "StoreVideoConnection" ADD COLUMN IF NOT EXISTS "audioEnabled" BOOLEAN NOT NULL DEFAULT FALSE`);
  await prisma.$executeRawUnsafe(`ALTER TABLE "StoreVideoConnection" ADD COLUMN IF NOT EXISTS "privacyNoticeAcknowledgedAt" TIMESTAMPTZ`);
  await prisma.$executeRawUnsafe(`DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='StoreVideoConnection_retention_days_check') THEN ALTER TABLE "StoreVideoConnection" ADD CONSTRAINT "StoreVideoConnection_retention_days_check" CHECK ("retentionDays" BETWEEN 1 AND 365); END IF; END $$`);
  await prisma.$executeRawUnsafe(`DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='StoreVideoConnection_privacy_check') THEN ALTER TABLE "StoreVideoConnection" ADD CONSTRAINT "StoreVideoConnection_privacy_check" CHECK ("privacyMode"='EVENT_ONLY' AND "audioEnabled"=FALSE); END IF; END $$`);
  await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "StoreVideoConnection_company_idx" ON "StoreVideoConnection"("companyId")`);
  await prisma.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS "StoreVideoCamera" (
    "id" TEXT PRIMARY KEY,"companyId" TEXT NOT NULL,"storeId" TEXT NOT NULL,"connectionId" TEXT NOT NULL,
    "cameraKey" TEXT NOT NULL,"displayName" TEXT NOT NULL,"zone" TEXT NOT NULL,"streamReference" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT TRUE,"sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),"updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE ("storeId","cameraKey"),
    CONSTRAINT "StoreVideoCamera_company_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE,
    CONSTRAINT "StoreVideoCamera_store_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE,
    CONSTRAINT "StoreVideoCamera_connection_fkey" FOREIGN KEY ("connectionId") REFERENCES "StoreVideoConnection"("id") ON DELETE CASCADE,
    CONSTRAINT "StoreVideoCamera_zone_check" CHECK ("zone" IN ('POS_1','POS_2','WAREHOUSE','ENTRANCE','DELIVERY','OTHER'))
  )`);
  await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "StoreVideoCamera_store_active_idx" ON "StoreVideoCamera"("storeId","active","sortOrder")`);
  await prisma.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS "VideoOperationalEvent" (
    "id" TEXT PRIMARY KEY,"companyId" TEXT NOT NULL,"storeId" TEXT NOT NULL,
    "terminalPos" TEXT NOT NULL,"operatorId" TEXT,"operatorName" TEXT,"eventType" TEXT NOT NULL,
    "eventAt" TIMESTAMPTZ NOT NULL,"nvrEventAt" TIMESTAMPTZ NOT NULL,"timeOffsetSeconds" INTEGER NOT NULL DEFAULT 0,
    "clipStartAt" TIMESTAMPTZ NOT NULL,"clipEndAt" TIMESTAMPTZ NOT NULL,"clipStatus" TEXT NOT NULL DEFAULT 'NOT_REQUESTED',
    "sourceType" TEXT,"sourceId" TEXT,"amount" NUMERIC(14,2),"details" JSONB,
    "expiresAt" TIMESTAMPTZ NOT NULL,"createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT "VideoOperationalEvent_company_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE,
    CONSTRAINT "VideoOperationalEvent_store_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE
  )`);
  await prisma.$executeRawUnsafe(`ALTER TABLE "VideoOperationalEvent" ADD COLUMN IF NOT EXISTS "clipStartAt" TIMESTAMPTZ`);
  await prisma.$executeRawUnsafe(`ALTER TABLE "VideoOperationalEvent" ADD COLUMN IF NOT EXISTS "clipEndAt" TIMESTAMPTZ`);
  await prisma.$executeRawUnsafe(`ALTER TABLE "VideoOperationalEvent" ADD COLUMN IF NOT EXISTS "clipStatus" TEXT NOT NULL DEFAULT 'NOT_REQUESTED'`);
  await prisma.$executeRawUnsafe(`ALTER TABLE "VideoOperationalEvent" ADD COLUMN IF NOT EXISTS "expiresAt" TIMESTAMPTZ`);
  await prisma.$executeRawUnsafe(`UPDATE "VideoOperationalEvent" SET "clipStartAt"="nvrEventAt"-INTERVAL '30 seconds',"clipEndAt"="nvrEventAt"+INTERVAL '60 seconds' WHERE "clipStartAt" IS NULL OR "clipEndAt" IS NULL`);
  await prisma.$executeRawUnsafe(`UPDATE "VideoOperationalEvent" v SET "expiresAt"=v."eventAt"+(COALESCE(c."retentionDays",30)||' days')::interval FROM "StoreVideoConnection" c WHERE c."companyId"=v."companyId" AND c."storeId"=v."storeId" AND v."expiresAt" IS NULL`);
  await prisma.$executeRawUnsafe(`UPDATE "VideoOperationalEvent" SET "expiresAt"="eventAt"+INTERVAL '30 days' WHERE "expiresAt" IS NULL`);
  await prisma.$executeRawUnsafe(`ALTER TABLE "VideoOperationalEvent" ALTER COLUMN "expiresAt" SET NOT NULL`);
  await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "VideoOperationalEvent_expiry_idx" ON "VideoOperationalEvent"("expiresAt")`);
  await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "VideoOperationalEvent_store_time_idx" ON "VideoOperationalEvent"("storeId","eventAt" DESC)`);
  await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "VideoOperationalEvent_pos_operator_type_idx" ON "VideoOperationalEvent"("storeId","terminalPos","operatorId","eventType")`);
  await prisma.$executeRawUnsafe(`CREATE UNIQUE INDEX IF NOT EXISTS "VideoOperationalEvent_source_event_uq" ON "VideoOperationalEvent"("companyId","sourceType","sourceId","eventType") WHERE "sourceType" IS NOT NULL AND "sourceId" IS NOT NULL`);
  await prisma.$executeRawUnsafe(`CREATE OR REPLACE FUNCTION "captureVideoOperationalEvent"() RETURNS TRIGGER AS $$
  DECLARE mapped_type TEXT; source_id TEXT; terminal_pos TEXT; event_time TIMESTAMPTZ; actor_id TEXT; actor_name TEXT; event_amount NUMERIC(14,2); offset_seconds INTEGER; retention_days INTEGER;
  BEGIN
    IF TG_TABLE_NAME='StoreTransaction' THEN
      IF TG_OP='UPDATE' AND OLD."reversedAt" IS NULL AND NEW."reversedAt" IS NOT NULL THEN mapped_type:='REVERSAL';
      ELSIF TG_OP='INSERT' AND NEW."type"='SUPPLIER_PAYMENT' THEN mapped_type:='SUPPLIER_PAYMENT';
      ELSIF TG_OP='INSERT' AND NEW."type"='PERCENTAGES' THEN mapped_type:='SUSPICIOUS_ACTION'; ELSE RETURN NEW; END IF;
      source_id:=NEW."id";event_time:=COALESCE(NEW."reversedAt",NEW."occurredAt",NOW());actor_id:=COALESCE(NEW."reversedBy",NEW."actorId");actor_name:=COALESCE(NEW."reversedByName",NEW."actorName");event_amount:=NEW."amount";
      SELECT COALESCE(s."terminalPos",'MAIN') INTO terminal_pos FROM "CashShiftSession" s WHERE s."id"=NEW."sessionId";terminal_pos:=COALESCE(terminal_pos,'BACKOFFICE');
    ELSIF TG_TABLE_NAME='PosSaleActionAudit' THEN
      mapped_type:=CASE WHEN NEW."actionType" IN ('CANCEL','POS_CANCEL') THEN 'VOID' WHEN NEW."actionType" IN ('RETURN','RETURN_ITEMS') THEN 'RETURN' WHEN NEW."actionType" IN ('DISCOUNT','PRICE_CHANGE') THEN 'DISCOUNT' WHEN NEW."actionType" IN ('DRAWER_OPEN','SHIFT_OPEN') THEN 'DRAWER_OPEN' WHEN NEW."actionType" IN ('DUPLICATE_BLOCKED','DUPLICATE_CONFIRMED','UNKNOWN_PRODUCT_SCAN','SUSPICIOUS_ACTION') THEN 'SUSPICIOUS_ACTION' ELSE NULL END;
      IF mapped_type IS NULL THEN RETURN NEW; END IF;source_id:=NEW."id";event_time:=NEW."createdAt";actor_id:=NEW."actorId";actor_name:=NEW."actorName";event_amount:=NULL;terminal_pos:=COALESCE(NEW."details"->>'terminalPos','MAIN');
    ELSIF TG_TABLE_NAME='CashShiftSession' THEN
      IF TG_OP='INSERT' AND ABS(COALESCE(NEW."openingVariance",0))>0.009 THEN mapped_type:='CASH_DIFFERENCE';event_amount:=NEW."openingVariance";actor_id:=NEW."openedBy";actor_name:=NEW."openedByName";event_time:=NEW."openedAt";
      ELSIF TG_OP='UPDATE' AND OLD."status"='OPEN' AND NEW."status"='CLOSED' AND ABS(COALESCE(NEW."variance",0))>0.009 THEN mapped_type:='CASH_DIFFERENCE';event_amount:=NEW."variance";actor_id:=NEW."closedBy";actor_name:=NEW."closedByName";event_time:=NEW."closedAt"; ELSE RETURN NEW; END IF;
      source_id:=NEW."id";terminal_pos:=COALESCE(NEW."terminalPos",'MAIN');
    ELSE RETURN NEW; END IF;
    IF NOT EXISTS (SELECT 1 FROM "CompanyModule" m WHERE m."companyId"=NEW."companyId" AND m."moduleKey"='VIDEO_EVENTS' AND m."active"=TRUE) THEN RETURN NEW; END IF;
    SELECT c."timeOffsetSeconds",c."retentionDays" INTO offset_seconds,retention_days FROM "StoreVideoConnection" c WHERE c."companyId"=NEW."companyId" AND c."storeId"=NEW."storeId" AND c."active"=TRUE LIMIT 1;IF NOT FOUND THEN RETURN NEW;END IF;offset_seconds:=COALESCE(offset_seconds,0);retention_days:=COALESCE(retention_days,30);
    INSERT INTO "VideoOperationalEvent" ("id","companyId","storeId","terminalPos","operatorId","operatorName","eventType","eventAt","nvrEventAt","timeOffsetSeconds","clipStartAt","clipEndAt","sourceType","sourceId","amount","details","expiresAt")
    VALUES (md5(random()::text||clock_timestamp()::text),NEW."companyId",NEW."storeId",terminal_pos,actor_id,actor_name,mapped_type,event_time,event_time+(offset_seconds||' seconds')::interval,offset_seconds,event_time+(offset_seconds||' seconds')::interval-INTERVAL '30 seconds',event_time+(offset_seconds||' seconds')::interval+INTERVAL '60 seconds',TG_TABLE_NAME,source_id,event_amount,jsonb_build_object('capturedAutomatically',true),event_time+(retention_days||' days')::interval) ON CONFLICT DO NOTHING;RETURN NEW;
  END;$$ LANGUAGE plpgsql`);
  await prisma.$executeRawUnsafe(`DROP TRIGGER IF EXISTS "StoreTransaction_video_event" ON "StoreTransaction";CREATE TRIGGER "StoreTransaction_video_event" AFTER INSERT OR UPDATE OF "reversedAt" ON "StoreTransaction" FOR EACH ROW EXECUTE FUNCTION "captureVideoOperationalEvent"()`);
  await prisma.$executeRawUnsafe(`DROP TRIGGER IF EXISTS "PosSaleActionAudit_video_event" ON "PosSaleActionAudit";CREATE TRIGGER "PosSaleActionAudit_video_event" AFTER INSERT ON "PosSaleActionAudit" FOR EACH ROW EXECUTE FUNCTION "captureVideoOperationalEvent"()`);
  await prisma.$executeRawUnsafe(`DROP TRIGGER IF EXISTS "CashShiftSession_video_event" ON "CashShiftSession";CREATE TRIGGER "CashShiftSession_video_event" AFTER INSERT OR UPDATE OF "status" ON "CashShiftSession" FOR EACH ROW EXECUTE FUNCTION "captureVideoOperationalEvent"()`);
  await prisma.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS "VideoAccessAudit" (
    "id" TEXT PRIMARY KEY,"companyId" TEXT NOT NULL,"storeId" TEXT NOT NULL,"actorId" TEXT,
    "action" TEXT NOT NULL,"details" JSONB,"createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`);
  await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "VideoAccessAudit_store_created_idx" ON "VideoAccessAudit"("storeId","createdAt" DESC)`);
  await purgeExpiredVideoEventMetadata();
}

export async function recordVideoOperationalEvent(event,db=prisma){
  if(!event?.companyId||!event?.storeId||!event?.terminalPos||!event?.eventType)throw new Error("Το video event απαιτεί εταιρεία, κατάστημα, POS και τύπο συμβάντος.");
  const eventAt=event.eventAt instanceof Date?event.eventAt:new Date(event.eventAt||Date.now());
  if(Number.isNaN(eventAt.getTime()))throw new Error("Μη έγκυρη ώρα video event.");
  const connections=await db.$queryRaw`SELECT "timeOffsetSeconds","retentionDays" FROM "StoreVideoConnection" WHERE "companyId"=${event.companyId} AND "storeId"=${event.storeId} AND "active"=true LIMIT 1`,timeOffsetSeconds=Number(connections[0]?.timeOffsetSeconds||0),retentionDays=Number(connections[0]?.retentionDays||30),nvrEventAt=new Date(eventAt.getTime()+timeOffsetSeconds*1000),clipStartAt=new Date(nvrEventAt.getTime()-30000),clipEndAt=new Date(nvrEventAt.getTime()+60000),expiresAt=new Date(eventAt.getTime()+retentionDays*86400000),id=event.id||crypto.randomUUID();
  await db.$executeRaw`INSERT INTO "VideoOperationalEvent" ("id","companyId","storeId","terminalPos","operatorId","operatorName","eventType","eventAt","nvrEventAt","timeOffsetSeconds","clipStartAt","clipEndAt","sourceType","sourceId","amount","details","expiresAt") VALUES (${id},${event.companyId},${event.storeId},${event.terminalPos},${event.operatorId||null},${event.operatorName||null},${event.eventType},${eventAt},${nvrEventAt},${timeOffsetSeconds},${clipStartAt},${clipEndAt},${event.sourceType||null},${event.sourceId||null},${event.amount??null},${JSON.stringify(event.details||{})}::jsonb,${expiresAt})`;
  return {id,eventAt,nvrEventAt,timeOffsetSeconds,clipStartAt,clipEndAt,clipStatus:"NOT_REQUESTED",expiresAt};
}

export async function purgeExpiredVideoEventMetadata(now=new Date(),db=prisma){return db.$executeRaw`DELETE FROM "VideoOperationalEvent" WHERE "expiresAt"<${now}`}
