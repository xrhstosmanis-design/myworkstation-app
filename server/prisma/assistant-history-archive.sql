-- Reviewed additive provisioning, invoked only by the guarded startup helper.
-- Provision only together with the reviewed lifecycle catalogue/guards.
-- No parent FKs or cascades: storeId is the sole reviewed DIRECT ownership.
CREATE TABLE IF NOT EXISTS "AssistantHistoryArchive" (
 "scopeKey" text PRIMARY KEY,
 "revision" bigint NOT NULL CHECK ("revision">0 AND "revision"<9007199254740991),
 "payload" jsonb NOT NULL CHECK (octet_length("payload"::text)<=262144),
 "requestId" text NOT NULL,
 "digest" text NOT NULL CHECK ("digest" ~ '^[a-f0-9]{64}$'),
 "expiresAt" timestamptz NOT NULL,
 "actorId" text NOT NULL CHECK (length("actorId") BETWEEN 1 AND 160),
 "mode" text NOT NULL CHECK ("mode" IN ('owner','platform')),
 "companyId" text NOT NULL CHECK (length("companyId") BETWEEN 1 AND 160),
 "storeId" text NOT NULL CHECK (length("storeId") BETWEEN 1 AND 160),
 "generation" bigint NOT NULL CHECK ("generation">=0),
 CONSTRAINT "AssistantHistoryArchive_scope_binding" CHECK (
   "scopeKey"::jsonb=jsonb_build_array('assistant-history-v1',"actorId","mode","companyId","storeId","generation"::text)
 )
);
