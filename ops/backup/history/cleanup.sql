BEGIN;
SET LOCAL lock_timeout='200ms';
SET LOCAL statement_timeout='10s';
DO $history$
DECLARE
 s text := current_schema();
 empty_payload jsonb := '{"schemaVersion":1,"threads":[]}';
 target record;
 fence record;
 has_fence boolean;
 erased integer := 0;
 changed integer;
 deferred integer := 0;
BEGIN
 PERFORM set_config('mws.history_cleanup_result','{"state":"UNAVAILABLE"}',true);
 IF to_regclass(format('%I.%I',s,'AssistantHistoryArchive')) IS NULL THEN RETURN; END IF;
 IF NOT pg_try_advisory_xact_lock(hashtextextended('assistant-history-cleanup-v1',0)) THEN
  PERFORM set_config('mws.history_cleanup_result','{"state":"BUSY"}',true); RETURN;
 END IF;
 has_fence := to_regclass(format('%I.%I',s,'StoreLifecycleFence')) IS NOT NULL;
 -- An indexed, bounded candidate window. No payload or identity leaves SQL.
 FOR target IN EXECUTE format('SELECT "companyId","storeId" FROM (SELECT "companyId","storeId" FROM %I."AssistantHistoryArchive" WHERE "expiresAt"<=transaction_timestamp() AND "payload"<>$1 ORDER BY "expiresAt","scopeKey" LIMIT 256) c GROUP BY "companyId","storeId" ORDER BY "storeId","companyId"',s) USING empty_payload LOOP
  EXIT WHEN erased>=256;
  BEGIN
   IF has_fence THEN
    EXECUTE format('SELECT "companyId","generation"::text AS generation,"maintenance","retired" FROM %I."StoreLifecycleFence" WHERE "storeId"=$1 FOR SHARE NOWAIT',s) INTO fence USING target."storeId";
    IF fence."companyId" IS NOT NULL THEN
     IF fence."companyId"<>target."companyId" OR fence."maintenance" OR fence."retired" THEN deferred:=deferred+1; CONTINUE; END IF;
     -- Fresh maintenance work only; never relabel the stored archive generation.
     PERFORM set_config('mws.lifecycle_generations',jsonb_build_object(target."storeId",fence.generation)::text,true);
    END IF;
   END IF;
   EXECUTE format('WITH batch AS (SELECT "scopeKey" FROM %I."AssistantHistoryArchive" WHERE "companyId"=$1 AND "storeId"=$2 AND "expiresAt"<=transaction_timestamp() AND "payload"<>$3 ORDER BY "expiresAt","scopeKey" LIMIT $4 FOR UPDATE SKIP LOCKED) UPDATE %I."AssistantHistoryArchive" h SET "payload"=$3 FROM batch b WHERE h."scopeKey"=b."scopeKey" AND h."expiresAt"<=transaction_timestamp() AND h."payload"<>$3',s,s) USING target."companyId",target."storeId",empty_payload,256-erased;
   GET DIAGNOSTICS changed=ROW_COUNT;
   erased:=erased+changed;
  EXCEPTION WHEN lock_not_available THEN deferred:=deferred+1;
  END;
 END LOOP;
 PERFORM set_config('mws.history_cleanup_result',jsonb_build_object('state','COMPLETED','erased',erased,'deferredScopes',deferred)::text,true);
END;
$history$;
SELECT current_setting('mws.history_cleanup_result',true);
COMMIT;
