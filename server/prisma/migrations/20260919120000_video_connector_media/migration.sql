-- KAT-10: outbound-only Dahua connector command queue and temporary requested media.
-- Continuous CCTV remains on the NVR; these artifacts are explicitly requested and expire.
CREATE TABLE IF NOT EXISTS "VideoConnectorCommand" (
  "id" TEXT PRIMARY KEY,
  "companyId" TEXT NOT NULL REFERENCES "Company"("id") ON DELETE CASCADE,
  "storeId" TEXT NOT NULL REFERENCES "Store"("id") ON DELETE CASCADE,
  "connectorDeviceId" TEXT,
  "commandType" TEXT NOT NULL CHECK ("commandType" IN ('HEALTH','SNAPSHOT','CLIP')),
  "cameraKey" TEXT,
  "videoEventId" TEXT,
  "payload" JSONB NOT NULL DEFAULT '{}'::jsonb,
  "status" TEXT NOT NULL DEFAULT 'PENDING' CHECK ("status" IN ('PENDING','CLAIMED','COMPLETED','FAILED','EXPIRED')),
  "result" JSONB,
  "errorCode" TEXT,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "claimedAt" TIMESTAMPTZ,
  "completedAt" TIMESTAMPTZ,
  "expiresAt" TIMESTAMPTZ NOT NULL DEFAULT (NOW()+INTERVAL '5 minutes')
);
CREATE INDEX IF NOT EXISTS "VideoConnectorCommand_store_status_idx" ON "VideoConnectorCommand"("storeId","status","createdAt");
CREATE UNIQUE INDEX IF NOT EXISTS "VideoConnectorCommand_event_active_uq" ON "VideoConnectorCommand"("videoEventId","commandType") WHERE "videoEventId" IS NOT NULL AND "status" IN ('PENDING','CLAIMED');

CREATE TABLE IF NOT EXISTS "VideoMediaArtifact" (
  "id" TEXT PRIMARY KEY,
  "companyId" TEXT NOT NULL,
  "storeId" TEXT NOT NULL,
  "commandId" TEXT NOT NULL UNIQUE REFERENCES "VideoConnectorCommand"("id") ON DELETE CASCADE,
  "videoEventId" TEXT,
  "cameraKey" TEXT,
  "kind" TEXT NOT NULL CHECK ("kind" IN ('SNAPSHOT','CLIP')),
  "mimeType" TEXT NOT NULL,
  "filename" TEXT NOT NULL,
  "byteLength" BIGINT NOT NULL DEFAULT 0,
  "sha256" TEXT,
  "status" TEXT NOT NULL DEFAULT 'UPLOADING' CHECK ("status" IN ('UPLOADING','READY','FAILED')),
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "completedAt" TIMESTAMPTZ,
  "expiresAt" TIMESTAMPTZ NOT NULL
);
CREATE INDEX IF NOT EXISTS "VideoMediaArtifact_event_idx" ON "VideoMediaArtifact"("videoEventId","kind","createdAt" DESC);

CREATE TABLE IF NOT EXISTS "VideoMediaArtifactChunk" (
  "artifactId" TEXT NOT NULL REFERENCES "VideoMediaArtifact"("id") ON DELETE CASCADE,
  "chunkIndex" INTEGER NOT NULL,
  "bytes" BYTEA NOT NULL,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY ("artifactId","chunkIndex")
);
