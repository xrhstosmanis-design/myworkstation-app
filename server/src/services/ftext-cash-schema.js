import {reviewedFreshStoreManifest} from './store-lifecycle-manifest.js';
const name='FtextCashRequest';
const textRequired=['id','companyId','storeId','terminalPos','fiscalDeviceCode','serialNumber','clientTransactionId','requestHash','settingsHash','lifecycleGeneration','sessionId'];
const columns=[...textRequired.map(c=>[c,'text',true]),['plan','jsonb',true],['checkoutJson','jsonb',true],['total','numeric(14,2)',true],['status','text',true],['claimedByDeviceId','text',false],['claimedTokenVersion','integer',false],['dispatchedAt','timestamp with time zone',false],['result','jsonb',false],['resultHash','text',false],['saleId','text',false],['createdAt','timestamp with time zone',true],['updatedAt','timestamp with time zone',true]];
const reviewedColumns=['clientTransactionId','sessionId','plan','checkoutJson','claimedByDeviceId','result','saleId'].map(c=>name+'.'+c);
// A review proposal/test projection, NEVER installed as the canonical manifest.
// The retained recovery owner must review its full graph and restore semantics.
export function ftextCashLifecycleReviewProposal(){return {knownTables:[name],knownColumns:{[name]:structuredClone(columns)},reviewedColumns:[...reviewedColumns],ftextRecoveryAcceptance:{format:'FTEXT_RECOVERY_ACCEPTANCE_V1',approved:true},tables:[{name,owner:{kind:'DIRECT'},reset:'REMOVE',references:[{parent:'CloudDevice',columns:[['claimedByDeviceId','id']],historical:true},{parent:'Sale',columns:[['saleId','id']],historical:true},{parent:'CashShiftSession',columns:[['sessionId','id']],historical:true}]}]};}
export function assertFtextCashLifecycleCatalogueReviewed(manifest=reviewedFreshStoreManifest()){
 const table=manifest?.tables?.find(t=>t.name===name);
 const expectedReferences=ftextCashLifecycleReviewProposal().tables[0].references;
 if(!manifest?.knownTables?.includes(name)||JSON.stringify(manifest.knownColumns?.[name])!==JSON.stringify(columns)||table?.owner?.kind!=='DIRECT'||table.reset!=='REMOVE'||JSON.stringify(table.references)!==JSON.stringify(expectedReferences)||reviewedColumns.some(c=>!manifest.reviewedColumns?.includes(c)))throw Object.assign(new Error('Η ενεργοποίηση μετρητών ftext αναμένει την ολοκλήρωση του τεχνικού ελέγχου εγκατάστασης.'),{status:409,code:'FTEXT_CASH_RECOVERY_REVIEW_REQUIRED'});
}
// Catalogue compatibility and actual recovery acceptance are separate gates.
// A reviewed empty queue may be provisioned during ordinary startup while
// physical checkout remains OFF until full recovery evidence is accepted.
export function assertFtextCashLifecycleApproved(manifest=reviewedFreshStoreManifest()){
 assertFtextCashLifecycleCatalogueReviewed(manifest);
 if(manifest.ftextRecoveryAcceptance?.format!=='FTEXT_RECOVERY_ACCEPTANCE_V1'||manifest.ftextRecoveryAcceptance.approved!==true)throw Object.assign(new Error('Η ενεργοποίηση ftext αναμένει τον πλήρη έλεγχο ανάκτησης.'),{status:409,code:'FTEXT_CASH_RECOVERY_REVIEW_REQUIRED'});
}
// Called only by the normal authenticated cash-setup path, never by a Work SQL
// migration or the communication-only heartbeat. No process-wide schema cache:
// native isolated schemas and transaction rollbacks must remain independent.
export async function ensureFtextCashSchema(db,{manifest}={}){
 assertFtextCashLifecycleApproved(manifest);
 return createReviewedFtextCashSchema(db);
}
export async function provisionFtextRecoverySchema(db,{manifest=reviewedFreshStoreManifest()}={}){
 assertFtextCashLifecycleCatalogueReviewed(manifest);
 return db.$transaction(async tx=>{
  await tx.$queryRawUnsafe("SELECT 1 AS locked FROM pg_advisory_xact_lock(hashtextextended('mws:ftext-recovery-schema-v1',0))");
  const state=(await tx.$queryRawUnsafe(`SELECT to_regclass(format('%I.%I',current_schema(),'StoreLifecycleFence'))::text AS name`))[0];
  if(state?.name&&(await tx.$queryRawUnsafe(`SELECT 1 FROM "StoreLifecycleFence" WHERE "maintenance" LIMIT 1`)).length)throw Object.assign(new Error('Cannot provision ftext during lifecycle maintenance.'),{code:'FTEXT_RECOVERY_MAINTENANCE'});
  await createReviewedFtextCashSchema(tx);
  const actual=await tx.$queryRawUnsafe(`SELECT a.attname AS name,format_type(a.atttypid,a.atttypmod) AS type,a.attnotnull AS required FROM pg_attribute a JOIN pg_class c ON c.oid=a.attrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname=current_schema() AND c.relname='FtextCashRequest' AND a.attnum>0 AND NOT a.attisdropped ORDER BY a.attnum`);
  if(JSON.stringify(actual.map(c=>[c.name,c.type,c.required]))!==JSON.stringify(columns))throw Object.assign(new Error('Ftext recovery schema differs from reviewed catalogue.'),{code:'FTEXT_RECOVERY_SCHEMA_CHANGED'});
  const indexes=await tx.$queryRawUnsafe(`SELECT i.indisunique AS "unique",i.indisvalid AS "valid",i.indisready AS "ready",i.indimmediate AS "immediate",i.indisprimary AS "primary",ARRAY(SELECT a.attname::text FROM unnest(i.indkey) WITH ORDINALITY k(n,p) LEFT JOIN pg_attribute a ON a.attrelid=i.indrelid AND a.attnum=k.n ORDER BY k.p) AS "columns",pg_get_expr(i.indpred,i.indrelid) AS "predicate",pg_get_expr(i.indexprs,i.indrelid) AS "expressions" FROM pg_index i JOIN pg_class c ON c.oid=i.indrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname=current_schema() AND c.relname='FtextCashRequest'`);
  const normalized=value=>String(value||'').replace(/[\s()"]/g,'');
  const has=(names,predicate='',expressions='',primary=false)=>indexes.some(i=>i.unique&&i.valid&&i.ready&&i.immediate&&(!primary||i.primary)&&JSON.stringify(i.columns)===JSON.stringify(names)&&normalized(i.predicate)===predicate&&normalized(i.expressions)===expressions);
  if(!has(['id'],'','',true)||!has(['companyId','storeId','clientTransactionId'])||!has(['companyId','storeId','serialNumber'],"status<>'SALE_COMMITTED'::text")||!has(['companyId','storeId','serialNumber',null,null],"status=ANYARRAY['CONFIRMED'::text,'SALE_COMMITTED'::text]","result->>'dayId'::text,result->>'dayCounter'::text"))throw Object.assign(new Error('Ftext immutable identity/index contract differs.'),{code:'FTEXT_RECOVERY_SCHEMA_CHANGED'});
  return {available:true,checkoutEnabled:false};
 },{maxWait:5000,timeout:30000});
}
async function createReviewedFtextCashSchema(db){
 await db.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS "FtextCashRequest" (
 "id" TEXT PRIMARY KEY,"companyId" TEXT NOT NULL,"storeId" TEXT NOT NULL,
 "terminalPos" TEXT NOT NULL,"fiscalDeviceCode" TEXT NOT NULL,"serialNumber" TEXT NOT NULL,
 "clientTransactionId" TEXT NOT NULL,"requestHash" TEXT NOT NULL,"settingsHash" TEXT NOT NULL,
 "lifecycleGeneration" TEXT NOT NULL,"sessionId" TEXT NOT NULL,
 "plan" JSONB NOT NULL,"checkoutJson" JSONB NOT NULL,"total" NUMERIC(14,2) NOT NULL,
 "status" TEXT NOT NULL DEFAULT 'PREPARED' CHECK ("status" IN ('PREPARED','DISPATCHED','CONFIRMED','REQUIRES_CHECK','SALE_COMMITTED')),
 "claimedByDeviceId" TEXT,"claimedTokenVersion" INTEGER,"dispatchedAt" TIMESTAMPTZ,
 "result" JSONB,"resultHash" TEXT,"saleId" TEXT,
 "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),"updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 UNIQUE("companyId","storeId","clientTransactionId"))`);
 await db.$executeRawUnsafe(`CREATE UNIQUE INDEX IF NOT EXISTS "FtextCashRequest_register_pending_idx" ON "FtextCashRequest" ("companyId","storeId","serialNumber") WHERE "status" <> 'SALE_COMMITTED'`);
 await db.$executeRawUnsafe(`CREATE UNIQUE INDEX IF NOT EXISTS "FtextCashRequest_receipt_idx" ON "FtextCashRequest" ("companyId","storeId","serialNumber",("result"->>'dayId'),("result"->>'dayCounter')) WHERE "status" IN ('CONFIRMED','SALE_COMMITTED')`);
}
export async function ftextCashTableExists(db){return Boolean((await db.$queryRaw`SELECT to_regclass(format('%I.%I',current_schema(),'FtextCashRequest'))::text AS name`)[0]?.name);}
