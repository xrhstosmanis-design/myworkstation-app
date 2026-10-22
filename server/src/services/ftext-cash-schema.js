import {reviewedFreshStoreManifest} from './store-lifecycle-manifest.js';
const name='FtextCashRequest';
const textRequired=['id','companyId','storeId','terminalPos','fiscalDeviceCode','serialNumber','clientTransactionId','requestHash','settingsHash','lifecycleGeneration','sessionId'];
const columns=[...textRequired.map(c=>[c,'text',true]),['plan','jsonb',true],['checkoutJson','jsonb',true],['total','numeric(14,2)',true],['status','text',true],['claimedByDeviceId','text',false],['claimedTokenVersion','integer',false],['dispatchedAt','timestamp with time zone',false],['result','jsonb',false],['resultHash','text',false],['saleId','text',false],['createdAt','timestamp with time zone',true],['updatedAt','timestamp with time zone',true]];
const reviewedColumns=['clientTransactionId','sessionId','plan','checkoutJson','claimedByDeviceId','result','saleId'].map(c=>name+'.'+c);
// A review proposal/test projection, NEVER installed as the canonical manifest.
// The retained recovery owner must review its full graph and restore semantics.
export function ftextCashLifecycleReviewProposal(){return {knownTables:[name],knownColumns:{[name]:structuredClone(columns)},reviewedColumns:[...reviewedColumns],tables:[{name,owner:{kind:'DIRECT'},reset:'REMOVE',references:[{parent:'CloudDevice',columns:[['claimedByDeviceId','id']],historical:true},{parent:'Sale',columns:[['saleId','id']],historical:true},{parent:'CashShiftSession',columns:[['sessionId','id']],historical:true}]}]};}
export function assertFtextCashLifecycleApproved(manifest=reviewedFreshStoreManifest()){
 const table=manifest?.tables?.find(t=>t.name===name);
 if(!manifest?.knownTables?.includes(name)||JSON.stringify(manifest.knownColumns?.[name])!==JSON.stringify(columns)||table?.owner?.kind!=='DIRECT'||table.reset!=='REMOVE'||reviewedColumns.some(c=>!manifest.reviewedColumns?.includes(c)))throw Object.assign(new Error('Η ενεργοποίηση μετρητών ftext αναμένει την ολοκλήρωση του τεχνικού ελέγχου εγκατάστασης.'),{status:409,code:'FTEXT_CASH_RECOVERY_REVIEW_REQUIRED'});
}
// Called only by the normal authenticated cash-setup path, never by a Work SQL
// migration or the communication-only heartbeat. No process-wide schema cache:
// native isolated schemas and transaction rollbacks must remain independent.
export async function ensureFtextCashSchema(db,{manifest}={}){
 assertFtextCashLifecycleApproved(manifest);
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
