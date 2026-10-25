import {reviewedFreshStoreManifest} from './store-lifecycle-manifest.js';
const walletColumns={
 AiOwnerWallet:[['companyId','text',true],['enabled','boolean',true],['emailEnabled','boolean',true],['notificationOwnerId','text',false],['balanceMicros','bigint',true],['reservedMicros','bigint',true],['lastCreditMicros','bigint',true],['cycleId','text',true],['version','integer',true],['updatedAt','timestamp with time zone',true]],
 AiOwnerWalletEntry:[['id','text',true],['companyId','text',true],['storeId','text',false],['kind','text',true],['reference','text',true],['status','text',true],['creditedMicros','bigint',true],['reservedMicros','bigint',true],['chargedMicros','bigint',true],['feature','text',false],['tariff','jsonb',false],['usage','jsonb',false],['actorId','text',false],['resolutionReference','text',false],['createdAt','timestamp with time zone',true],['settledAt','timestamp with time zone',false]],
 AiOwnerWalletNotice:[['id','text',true],['companyId','text',true],['kind','text',true],['cycleId','text',true],['balanceMicros','bigint',true],['amountMicros','bigint',true],['ownerId','text',false],['email','text',false],['emailStatus','text',true],['createdAt','timestamp with time zone',true],['attemptedAt','timestamp with time zone',false],['messageId','text',false]],
 AiOwnerWalletAudit:[['id','text',true],['companyId','text',true],['actorId','text',true],['event','text',true],['detail','jsonb',true],['createdAt','timestamp with time zone',true]]
};
export const aiWalletRecoveryColumns=()=>structuredClone(walletColumns);
const fail=code=>{throw Object.assign(new Error('AI wallet recovery schema is unavailable or changed.'),{code,status:409})};
export function assertAiWalletCatalogue(manifest=reviewedFreshStoreManifest()){
 for(const [name,columns] of Object.entries(walletColumns))if(!manifest.knownTables?.includes(name)||JSON.stringify(manifest.knownColumns?.[name])!==JSON.stringify(columns))fail('AI_WALLET_RECOVERY_REVIEW_REQUIRED');
 const entry=manifest.tables?.find(t=>t.name==='AiOwnerWalletEntry');
 if(entry?.owner?.kind!=='DIRECT'||entry.reset!=='KEEP')fail('AI_WALLET_RECOVERY_REVIEW_REQUIRED');
 for(const name of ['AiOwnerWallet','AiOwnerWalletNotice','AiOwnerWalletAudit'])if(manifest.tables.some(t=>t.name===name))fail('AI_WALLET_RECOVERY_REVIEW_REQUIRED');
}
export async function createAiWalletSchema(db){
      await db.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS "AiOwnerWallet" (
        "companyId" TEXT PRIMARY KEY,"enabled" BOOLEAN NOT NULL DEFAULT FALSE,
        "emailEnabled" BOOLEAN NOT NULL DEFAULT FALSE,"notificationOwnerId" TEXT,
        "balanceMicros" BIGINT NOT NULL DEFAULT 0 CHECK ("balanceMicros">=0 AND "balanceMicros"<=1000000000000),
        "reservedMicros" BIGINT NOT NULL DEFAULT 0 CHECK ("reservedMicros">=0 AND "reservedMicros"<="balanceMicros"),
        "lastCreditMicros" BIGINT NOT NULL DEFAULT 0,"cycleId" TEXT NOT NULL,
        "version" INTEGER NOT NULL DEFAULT 0,"updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW())`);
      await db.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS "AiOwnerWalletEntry" (
        "id" TEXT PRIMARY KEY,"companyId" TEXT NOT NULL REFERENCES "AiOwnerWallet"("companyId"),"storeId" TEXT,
        "kind" TEXT NOT NULL CHECK ("kind" IN ('CREDIT','USAGE')),"reference" TEXT NOT NULL,
        "status" TEXT NOT NULL CHECK ("status" IN ('CREDITED','RESERVED','SETTLED','REVIEW')),
        "creditedMicros" BIGINT NOT NULL DEFAULT 0,"reservedMicros" BIGINT NOT NULL DEFAULT 0,"chargedMicros" BIGINT NOT NULL DEFAULT 0,
        "feature" TEXT,"tariff" JSONB,"usage" JSONB,"actorId" TEXT,"resolutionReference" TEXT,
        "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),"settledAt" TIMESTAMPTZ,
        UNIQUE("kind","reference"),CHECK ("creditedMicros">=0 AND "reservedMicros">=0 AND "chargedMicros">=0 AND "chargedMicros"<="reservedMicros"))`);
      await db.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS "AiOwnerWalletNotice" (
        "id" TEXT PRIMARY KEY,"companyId" TEXT NOT NULL REFERENCES "AiOwnerWallet"("companyId"),
        "kind" TEXT NOT NULL CHECK ("kind" IN ('CREDIT','LOW','EMPTY')),"cycleId" TEXT NOT NULL,
        "balanceMicros" BIGINT NOT NULL,"amountMicros" BIGINT NOT NULL DEFAULT 0,
        "ownerId" TEXT,"email" TEXT,"emailStatus" TEXT NOT NULL DEFAULT 'DISABLED',
        "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),"attemptedAt" TIMESTAMPTZ,"messageId" TEXT,
        UNIQUE("companyId","kind","cycleId"))`);
      await db.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS "AiOwnerWalletAudit" (
        "id" TEXT PRIMARY KEY,"companyId" TEXT NOT NULL,"actorId" TEXT NOT NULL,"event" TEXT NOT NULL,"detail" JSONB NOT NULL,"createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW())`);
      await db.$executeRawUnsafe('CREATE INDEX IF NOT EXISTS "AiOwnerWalletEntry_company_created" ON "AiOwnerWalletEntry"("companyId","createdAt")');
      await db.$executeRawUnsafe(`CREATE UNIQUE INDEX IF NOT EXISTS "AiOwnerWalletEntry_provider_response" ON "AiOwnerWalletEntry" (("usage"->>'providerResponseId')) WHERE "status"='SETTLED' AND "usage" ? 'providerResponseId'`);
      await db.$executeRawUnsafe('CREATE INDEX IF NOT EXISTS "AiOwnerWalletNotice_pending" ON "AiOwnerWalletNotice"("emailStatus","createdAt")');
}
const normalize=value=>String(value||'').replace(/::(?:text|bigint)/g,'').replace(/[\s()"]/g,'');
export async function validateAiWalletSchema(db){
 const actual=await db.$queryRawUnsafe(`SELECT c.relname AS table,a.attname AS name,format_type(a.atttypid,a.atttypmod) AS type,a.attnotnull AS required FROM pg_attribute a JOIN pg_class c ON c.oid=a.attrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname=current_schema() AND c.relname=ANY($1::text[]) AND a.attnum>0 AND NOT a.attisdropped ORDER BY c.relname,a.attnum`,Object.keys(walletColumns));
 for(const [name,expected] of Object.entries(walletColumns))if(JSON.stringify(actual.filter(c=>c.table===name).map(c=>[c.name,c.type,c.required]))!==JSON.stringify(expected))fail('AI_WALLET_RECOVERY_SCHEMA_CHANGED');
 const expected={
 AiOwnerWallet:[`PRIMARY KEY ("companyId")`,`CHECK (("balanceMicros" >= 0) AND ("balanceMicros" <= '1000000000000'::bigint))`,`CHECK (("reservedMicros" >= 0) AND ("reservedMicros" <= "balanceMicros"))`],
 AiOwnerWalletEntry:[`PRIMARY KEY (id)`,`FOREIGN KEY ("companyId") REFERENCES "AiOwnerWallet"("companyId")`,`CHECK (kind = ANY (ARRAY['CREDIT'::text, 'USAGE'::text]))`,`CHECK (status = ANY (ARRAY['CREDITED'::text, 'RESERVED'::text, 'SETTLED'::text, 'REVIEW'::text]))`,`UNIQUE (kind, reference)`,`CHECK (("creditedMicros" >= 0) AND ("reservedMicros" >= 0) AND ("chargedMicros" >= 0) AND ("chargedMicros" <= "reservedMicros"))`],
 AiOwnerWalletNotice:[`PRIMARY KEY (id)`,`FOREIGN KEY ("companyId") REFERENCES "AiOwnerWallet"("companyId")`,`CHECK (kind = ANY (ARRAY['CREDIT'::text, 'LOW'::text, 'EMPTY'::text]))`,`UNIQUE ("companyId",kind,"cycleId")`],
 AiOwnerWalletAudit:[`PRIMARY KEY (id)`]
 };
 const constraints=await db.$queryRawUnsafe(`SELECT t.relname AS table,pg_get_constraintdef(c.oid) AS definition,c.convalidated AS valid,c.condeferrable AS deferrable FROM pg_constraint c JOIN pg_class t ON t.oid=c.conrelid JOIN pg_namespace n ON n.oid=t.relnamespace WHERE n.nspname=current_schema() AND t.relname=ANY($1::text[]) AND c.contype IN ('p','u','f','c')`,Object.keys(walletColumns));
 for(const [name,definitions] of Object.entries(expected)){
 const rows=constraints.filter(c=>c.table===name);
 if(rows.some(c=>!c.valid||c.deferrable)||JSON.stringify(rows.map(c=>normalize(c.definition)).sort())!==JSON.stringify(definitions.map(normalize).sort()))fail('AI_WALLET_RECOVERY_SCHEMA_CHANGED');
 }
 const indexes=await db.$queryRawUnsafe(`SELECT t.relname AS table,i.indisunique AS unique,i.indisvalid AS valid,i.indisready AS ready,i.indimmediate AS immediate,pg_get_expr(i.indpred,i.indrelid) AS predicate,pg_get_expr(i.indexprs,i.indrelid) AS expression,ARRAY(SELECT a.attname::text FROM unnest(i.indkey) WITH ORDINALITY k(n,p) LEFT JOIN pg_attribute a ON a.attrelid=i.indrelid AND a.attnum=k.n ORDER BY k.p) AS columns FROM pg_index i JOIN pg_class t ON t.oid=i.indrelid JOIN pg_namespace n ON n.oid=t.relnamespace WHERE n.nspname=current_schema() AND t.relname=ANY($1::text[])`,Object.keys(walletColumns));
 if(indexes.some(i=>!i.valid||!i.ready||!i.immediate))fail('AI_WALLET_RECOVERY_SCHEMA_CHANGED');
 for(const [table,columns,unique,predicate,expression] of [
 ['AiOwnerWalletEntry',['companyId','createdAt'],false,'',''],
 ['AiOwnerWalletNotice',['emailStatus','createdAt'],false,'',''],
 ['AiOwnerWalletEntry',[null],true,`status = 'SETTLED'::text AND usage ? 'providerResponseId'::text`,`usage ->> 'providerResponseId'::text`]
 ])if(!indexes.some(i=>i.table===table&&i.unique===unique&&JSON.stringify(i.columns)===JSON.stringify(columns)&&normalize(i.predicate)===normalize(predicate)&&normalize(i.expression)===normalize(expression)))fail('AI_WALLET_RECOVERY_SCHEMA_CHANGED');
}
export async function provisionAiWalletRecovery(db,{manifest=reviewedFreshStoreManifest()}={}){
 assertAiWalletCatalogue(manifest);
 return db.$transaction(async tx=>{
 await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('AI_OWNER_WALLET_SCHEMA_V1'))`;
 const state=(await tx.$queryRawUnsafe(`SELECT to_regclass(format('%I.%I',current_schema(),'StoreLifecycleFence'))::text AS name`))[0];
 if(state?.name&&(await tx.$queryRawUnsafe(`SELECT 1 FROM "StoreLifecycleFence" WHERE maintenance LIMIT 1`)).length)fail('AI_WALLET_RECOVERY_MAINTENANCE');
 await createAiWalletSchema(tx);await validateAiWalletSchema(tx);
 return {available:true,chargingEnabled:false};
 },{maxWait:5000,timeout:30000});
}
