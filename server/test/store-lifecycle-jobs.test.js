import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {lifecycleJobOrigin,withLifecycleJobBatches} from '../src/services/store-lifecycle-jobs.js';
import {withLifecyclePrisma} from '../src/services/store-lifecycle-context.js';
const isolated=(()=>{try{const u=new URL(process.env.DATABASE_URL);return process.env.NODE_ENV==='test'&&['localhost','127.0.0.1','postgres'].includes(u.hostname)&&/test/i.test(u.pathname)}catch{return false}})();
const q=x=>'"'+x.replaceAll('"','""')+'"';
test('persisted job origin never promotes a missing legacy generation',()=>{
 assert.equal(lifecycleJobOrigin({}),'0');assert.equal(lifecycleJobOrigin({lifecycleGeneration:'1'}),'1');
 for(const value of [1,'-1','bad','9223372036854775808'])assert.throws(()=>lifecycleJobOrigin({lifecycleGeneration:value}));
});
async function fixture(extra=[]){
 const {PrismaClient}=await import('@prisma/client'),admin=new PrismaClient(),schema='lifecycle_jobs_'+randomUUID().replaceAll('-','');await admin.$executeRawUnsafe(`CREATE SCHEMA ${q(schema)}`);
 const url=new URL(process.env.DATABASE_URL);url.searchParams.set('schema',schema);url.searchParams.set('connection_limit','4');const raw=new PrismaClient({datasourceUrl:url.toString()}),db=withLifecyclePrisma(raw);
 const metadata=JSON.parse(readFileSync(new URL('../../CHECKPOINTS/EVIDENCE/store-lifecycle-20261019/schema-ownership-candidates-0600.json',import.meta.url),'utf8'));
 for(const name of [...new Set(['AiReaderJob','PosInvoiceBackgroundTask',...extra])]){
  const columns=metadata.columns.filter(c=>c.table===name);assert.ok(columns.length,name);
  const defs=columns.map(c=>{const pk=c.name===(name==='PosInvoiceBackgroundTask'?'jobId':'id');let tail=pk?' PRIMARY KEY':'';
   if(!pk&&c.notNull){if(/timestamp|date/.test(c.type))tail+=' DEFAULT CURRENT_TIMESTAMP';else if(/integer|numeric|double|bigint/.test(c.type))tail+=' DEFAULT 0';else if(c.type==='boolean')tail+=' DEFAULT false';else if(c.type==='jsonb')tail+=" DEFAULT '{}'::jsonb";else if(c.type==='text')tail+=" DEFAULT ''";}
   return q(c.name)+' '+c.type+tail;});
  await raw.$executeRawUnsafe(`CREATE TABLE ${q(schema)}.${q(name)}(${defs.join(',')})`);
 }
 await raw.$executeRawUnsafe(`ALTER TABLE "PosInvoiceBackgroundTask" ADD FOREIGN KEY("jobId") REFERENCES "AiReaderJob"("id") ON DELETE CASCADE`);
 await raw.$executeRawUnsafe(`CREATE TABLE "StoreLifecycleFence"("storeId" text PRIMARY KEY,"companyId" text NOT NULL,"generation" bigint NOT NULL,"maintenance" boolean NOT NULL DEFAULT false,"retired" boolean NOT NULL DEFAULT false)`);
 await raw.$executeRawUnsafe(`CREATE FUNCTION ${q(schema)}.require_epoch() RETURNS trigger LANGUAGE plpgsql AS $$ DECLARE f record; BEGIN SELECT * INTO f FROM ${q(schema)}."StoreLifecycleFence" WHERE "storeId"=NEW."storeId"; IF FOUND THEN IF f."maintenance" OR f."retired" OR COALESCE(NULLIF(current_setting('mws.lifecycle_generations',true),'')::jsonb->>NEW."storeId",'0')<>f."generation"::text THEN RAISE EXCEPTION 'STALE_OR_FROZEN_JOB' USING ERRCODE='55000'; END IF; END IF; RETURN NEW; END $$`);
 return {db,raw,schema,async guard(tables){for(const name of tables)await raw.$executeRawUnsafe(`CREATE TRIGGER require_epoch BEFORE INSERT OR UPDATE ON ${q(schema)}.${q(name)} FOR EACH ROW EXECUTE FUNCTION ${q(schema)}.require_epoch()`)},async fence(storeId,generation='1',maintenance=false){await raw.$executeRawUnsafe(`INSERT INTO "StoreLifecycleFence"("storeId","companyId","generation","maintenance") VALUES($1,'company',$2::bigint,$3)`,storeId,generation,maintenance)},async job(id,storeId,generation,state='QUEUED'){
   const handoff=generation===undefined?{}:{lifecycleGeneration:generation};
   await raw.$executeRawUnsafe(`INSERT INTO "AiReaderJob"("id","companyId","storeId","stage","status","resultJson") VALUES($1,'company',$2,'LOCAL','POS_QUEUED',$3::jsonb)`,id,storeId,JSON.stringify({posHandoff:handoff}));
   await raw.$executeRawUnsafe(`INSERT INTO "PosInvoiceBackgroundTask"("jobId","companyId","storeId","state","availableAt","createdAt","attemptCount") VALUES($1,'company',$2,$3,NOW(),NOW(),0)`,id,storeId,state);
 },async close(){await raw.$disconnect();await admin.$executeRawUnsafe(`DROP SCHEMA ${q(schema)} CASCADE`);await admin.$disconnect()}};
}
test('native persisted job repair batches exceed100 stores without promoting old0, touching frozen work or leaking epochs',{skip:!isolated},async()=>{
 const f=await fixture();try{
  for(let i=0;i<101;i++){await f.fence('store-'+i);await f.job('job-'+i,'store-'+i,'1')}
  await f.job('stale','store-0');await f.fence('blocked','1',true);await f.job('blocked-job','blocked','1');await f.job('legacy','unenrolled');
  await f.guard(['AiReaderJob','PosInvoiceBackgroundTask']);
  await withLifecycleJobBatches(f.db,filter=>f.db.$executeRaw`UPDATE "AiReaderJob" j SET "localConfidence"=COALESCE("localConfidence",0)+1 WHERE ${filter}`);
  const rows=await f.raw.$queryRawUnsafe(`SELECT "id","localConfidence" FROM "AiReaderJob" ORDER BY "id"`);
  for(const row of rows)assert.equal(Number(row.localConfidence),['stale','blocked-job'].includes(row.id)?0:1,row.id);
  assert.deepEqual((await f.raw.$queryRawUnsafe(`SELECT COALESCE(NULLIF(current_setting('mws.lifecycle_generations',true),''),'{}')::jsonb AS context`))[0].context,{});
 }finally{await f.close()}
});
test('native actual POS claim uses the stored origin, ignores old/frozen heads and preserves sibling progress',{skip:!isolated},async()=>{
 const {claimFastBackground}=await import('../src/routes/commerce-pos-v244.js'),f=await fixture();try{
  await f.fence('target');await f.fence('blocked','1',true);await f.job('old','target');await f.job('frozen','blocked','1');await f.job('fresh','target','1');await f.job('sibling','unenrolled');
  await f.guard(['AiReaderJob','PosInvoiceBackgroundTask']);
  const first=await claimFastBackground({db:f.db});assert.equal(first.jobId,'fresh');assert.equal(first.handoff.lifecycleGeneration,'1');
  const second=await claimFastBackground({db:f.db});assert.equal(second.jobId,'sibling');assert.equal(await claimFastBackground({db:f.db}),null);
  const controls=await f.raw.$queryRawUnsafe(`SELECT "jobId","state","attemptCount" FROM "PosInvoiceBackgroundTask" WHERE "jobId" IN ('old','frozen') ORDER BY "jobId"`);for(const row of controls){assert.equal(row.state,'QUEUED');assert.equal(row.attemptCount,0)}
 }finally{await f.close()}
});
test('native actual startup repair does not reseed an old0 task after reset and retains new1 and legacy sibling work',{skip:!isolated},async()=>{
 const {ensurePosInvoiceBackgroundWorkerSchema}=await import('../src/routes/commerce-pos-v244.js'),f=await fixture(['PurchaseDocument','PurchaseOrder','PurchaseOrderLine','Supplier']);try{
  await f.fence('target');await f.fence('blocked','1',true);await f.job('old','target');await f.job('new','target','1');await f.job('blocked-job','blocked','1');await f.job('legacy','unenrolled');
  await f.raw.$executeRawUnsafe(`DELETE FROM "PosInvoiceBackgroundTask"`);await f.guard(['AiReaderJob','PosInvoiceBackgroundTask']);
  await ensurePosInvoiceBackgroundWorkerSchema({db:f.db});
  assert.deepEqual((await f.raw.$queryRawUnsafe(`SELECT "jobId" FROM "PosInvoiceBackgroundTask" ORDER BY "jobId"`)).map(r=>r.jobId),['legacy','new']);
 }finally{await f.close()}
});
test('native actual workforce auto-out derives current locked rows, skips maintenance and preserves sibling processing',{skip:!isolated},async()=>{
 const {closeStaleWorkforceAttendance}=await import('../src/workers/workforce-auto-out.js'),f=await fixture(['WorkforceEmployee','WorkforceAttendanceSession','WorkforceTimeClockEntry','WorkforceAuditLog']);try{
  await f.fence('target');await f.fence('blocked','1',true);
  for(const table of ['WorkforceAttendanceSession','WorkforceTimeClockEntry'])await f.raw.$executeRawUnsafe(`ALTER TABLE ${q(table)} ADD FOREIGN KEY("employeeId") REFERENCES "WorkforceEmployee"("id")`);
  for(const store of ['target','blocked','sibling'])await f.raw.$executeRawUnsafe(`INSERT INTO "WorkforceEmployee"("id","companyId","baseStoreId","fullName") VALUES($1,'company',$2,'ISOLATED EMPLOYEE')`,'employee-'+store,store);
  for(const store of ['target','blocked','sibling'])await f.raw.$executeRawUnsafe(`INSERT INTO "WorkforceAttendanceSession"("id","companyId","storeId","employeeId","startedAt","status") VALUES($1,'company',$1,$2,'2026-10-18T10:00:00Z','OPEN')`,store,'employee-'+store);
  await f.guard(['WorkforceAttendanceSession','WorkforceTimeClockEntry','WorkforceAuditLog']);
  assert.equal((await closeStaleWorkforceAttendance(new Date('2026-10-19T10:00:00Z'),{db:f.db})).closed,2);
  const rows=await f.raw.$queryRawUnsafe(`SELECT "id","status","workedMinutes" FROM "WorkforceAttendanceSession" ORDER BY "id"`);for(const row of rows){assert.equal(row.status,row.id==='blocked'?'OPEN':'NEEDS_APPROVAL');assert.equal(row.workedMinutes,row.id==='blocked'?0:720)}
  assert.equal((await f.raw.$queryRawUnsafe(`SELECT count(*)::int AS count FROM "WorkforceTimeClockEntry"`))[0].count,2);assert.equal((await f.raw.$queryRawUnsafe(`SELECT count(*)::int AS count FROM "WorkforceAuditLog"`))[0].count,2);
 }finally{await f.close()}
});
test('native actual myDATA service refuses old browser work and maintenance before any remote receiving setup',{skip:!isolated},async()=>{
 const {syncMyDataStore}=await import('../src/routes/commerce-mydata-inbox.js'),f=await fixture();try{
  await f.fence('target');await f.fence('blocked','1',true);
  for(const [storeId,code] of [['target','STORE_LIFECYCLE_STALE_GENERATION'],['blocked','STORE_LIFECYCLE_MAINTENANCE']])await assert.rejects(syncMyDataStore({user:{id:'owner',companyId:'company'},body:{storeId}},{db:f.db}),e=>e.code===code);
  assert.equal((await f.raw.$queryRawUnsafe(`SELECT count(*)::int AS count FROM "AiReaderJob"`))[0].count,0);
 }finally{await f.close()}
});
