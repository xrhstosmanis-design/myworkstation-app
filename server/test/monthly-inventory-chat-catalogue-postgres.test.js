import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash,randomBytes} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';

const childKey='MWS_CHAT_CATALOGUE_NATIVE_CHILD';
const factsMarker='MWS_CHAT_CATALOGUE_NATIVE_FACTS_V1',holdMarker='MWS_CHAT_CATALOGUE_OLD_HOLD_V1';
const names=['StoreChatDelivery','StoreChatReaction'];
const q=value=>'"'+value.replaceAll('"','""')+'"',literal=value=>"'"+value.replaceAll("'","''")+"'";
const digest=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
const normalize=value=>String(value).replace(/::text/g,'').replace(/[\s()\"]/g,'');
const isolated=()=>{try{const u=new URL(process.env.DATABASE_URL);return process.env.NODE_ENV==='test'&&['postgres:','postgresql:'].includes(u.protocol)&&['localhost','127.0.0.1','postgres'].includes(u.hostname)&&!u.search&&!u.hash&&/^\/[^/]*test[^/]*$/i.test(decodeURIComponent(u.pathname))}catch{return false}};

async function observe(db){
 const environment=(await db.$queryRawUnsafe(`SELECT current_schema() AS schema,current_user AS "currentRole",current_setting('server_version_num')::integer AS "serverVersionNum",to_char(clock_timestamp() AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS "observedAtUtc"`))[0];
 const relations=await db.$queryRawUnsafe(`SELECT c.relname AS name,c.relkind::text AS kind,c.relispartition AS partition,c.relrowsecurity AS rls,c.relforcerowsecurity AS forced,pg_get_userbyid(c.relowner) AS owner,EXISTS(SELECT 1 FROM pg_inherits i WHERE i.inhparent=c.oid OR i.inhrelid=c.oid) AS inherited,EXISTS(SELECT 1 FROM pg_rewrite r WHERE r.ev_class=c.oid AND r.rulename<>'_RETURN') AS rewritten FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname=current_schema() AND c.relkind IN ('r','p','f') ORDER BY c.relname`);
 const columns=await db.$queryRawUnsafe(`SELECT c.relname AS "table",a.attname AS name,a.attnum::integer AS ordinal,format_type(a.atttypid,a.atttypmod) AS type,a.attnotnull AS required,a.attidentity::text AS identity,a.attgenerated::text AS generated,pg_get_expr(d.adbin,d.adrelid) AS "defaultExpression" FROM pg_attribute a JOIN pg_class c ON c.oid=a.attrelid JOIN pg_namespace n ON n.oid=c.relnamespace LEFT JOIN pg_attrdef d ON d.adrelid=a.attrelid AND d.adnum=a.attnum WHERE n.nspname=current_schema() AND c.relkind IN ('r','p','f') AND a.attnum>0 AND NOT a.attisdropped ORDER BY c.relname,a.attnum`);
 const constraints=await db.$queryRawUnsafe(`SELECT c.relname AS "table",k.conname AS name,k.contype::text AS kind,k.convalidated AS valid,k.condeferrable AS deferrable,pg_get_constraintdef(k.oid) AS definition,pg_get_expr(k.conbin,k.conrelid) AS expression,ARRAY(SELECT a.attname::text FROM unnest(k.conkey) WITH ORDINALITY x(n,p) JOIN pg_attribute a ON a.attrelid=k.conrelid AND a.attnum=x.n ORDER BY x.p) AS columns FROM pg_constraint k JOIN pg_class c ON c.oid=k.conrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname=current_schema() AND c.relname=ANY($1::text[]) ORDER BY c.relname,k.conname`,names);
 const indexes=await db.$queryRawUnsafe(`SELECT c.relname AS "table",ix.relname AS name,i.indisprimary AS "primary",i.indisunique AS "unique",i.indisvalid AS valid,i.indisready AS ready,i.indimmediate AS immediate,i.indnkeyatts::integer AS "keyCount",i.indnatts::integer AS "attributeCount",am.amname::text AS method,(i.indoption[0]&1)<>0 AS "firstDescending",CASE WHEN i.indnkeyatts>=2 THEN (i.indoption[1]&1)<>0 ELSE NULL END AS "secondDescending",ARRAY(SELECT a.attname::text FROM unnest(i.indkey) WITH ORDINALITY x(n,p) JOIN pg_attribute a ON a.attrelid=c.oid AND a.attnum=x.n ORDER BY x.p) AS columns,pg_get_expr(i.indpred,i.indrelid) AS predicate,pg_get_expr(i.indexprs,i.indrelid) AS expressions,pg_get_indexdef(i.indexrelid) AS definition,CASE WHEN i.indnkeyatts>=2 THEN pg_get_indexdef(i.indexrelid,2,false) ELSE NULL END AS "secondKey" FROM pg_index i JOIN pg_class c ON c.oid=i.indrelid JOIN pg_class ix ON ix.oid=i.indexrelid JOIN pg_am am ON am.oid=ix.relam JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname=current_schema() ORDER BY c.relname,ix.relname`);
 const triggers=await db.$queryRawUnsafe(`SELECT c.relname AS "table",t.tgname AS name,t.tgenabled::text AS enabled,t.tgtype::integer AS mask FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname=current_schema() AND c.relname=ANY($1::text[]) AND NOT t.tgisinternal ORDER BY c.relname,t.tgname`,names);
 return{environment,relations,columns,constraints,indexes,triggers};
}

async function allRows(db){
 const tables=await db.$queryRawUnsafe(`SELECT tablename AS name FROM pg_tables WHERE schemaname=current_schema() ORDER BY tablename`),result={};
 for(const{name}of tables)result[name]=await db.$queryRawUnsafe(`SELECT row_to_json(t)::text AS row FROM ${q(name)} t ORDER BY row_to_json(t)::text`);
 return result;
}

async function nativeFacts(){
 // This process receives its fresh private DATABASE_URL before importing any
 // application module. The parent/shared CI database is never used by helpers.
 assert.ok(isolated(),'Fresh isolated child database required before imports');
 const{PrismaClient}=await import('@prisma/client'),db=new PrismaClient();
 try{
  const metadata=JSON.parse(readFileSync(new URL('./fixtures/ftext-full-schema-metadata-20261024.json',import.meta.url)));
  assert.equal(metadata.format,'FTEXT_FULL_SCHEMA_METADATA_NO_BUSINESS_ROWS_V1');assert.equal(metadata.serverVersion,'180004');assert.equal(new Set(metadata.columns.map(c=>c.table)).size,264);
  assert.ok(!metadata.columns.some(c=>names.includes(c.table)||c.table==='StoreChatMessage'&&c.name==='replyToId'),'dated metadata stays genuinely pre-Chat');
  for(const e of metadata.enums)await db.$executeRawUnsafe(`CREATE TYPE ${q(e.name)} AS ENUM (${e.labels.map(literal).join(',')})`);
  await db.$executeRawUnsafe('CREATE SEQUENCE "CloudChange_sequence_seq" AS bigint START 1 INCREMENT 1 MINVALUE 1 MAXVALUE 9223372036854775807 CACHE 1 NO CYCLE');
  for(const table of new Set(metadata.columns.map(c=>c.table)))await db.$executeRawUnsafe(`CREATE TABLE ${q(table)} (${metadata.columns.filter(c=>c.table===table).map(c=>`${q(c.name)} ${c.type}${c.required?' NOT NULL':''}`).join(',')})`);
  for(const fn of metadata.functions)await db.$executeRawUnsafe(fn);
  for(const c of metadata.columns.filter(c=>c.default!==null))await db.$executeRawUnsafe(`ALTER TABLE ${q(c.table)} ALTER COLUMN ${q(c.name)} SET DEFAULT ${c.default}`);
  // PG18 NOT NULL constraints are represented by required attributes on PG16.
  for(const kind of ['p','u','c'])for(const c of metadata.constraints.filter(c=>c.kind===kind))await db.$executeRawUnsafe(`ALTER TABLE ${q(c.table)} ADD CONSTRAINT ${q(c.name)} ${c.definition}`);
  for(const index of metadata.indexes)await db.$executeRawUnsafe(index);
  for(const c of metadata.constraints.filter(c=>c.kind==='f'))await db.$executeRawUnsafe(`ALTER TABLE ${q(c.table)} ADD CONSTRAINT ${q(c.name)} ${c.definition}`);
  for(const trigger of metadata.triggers){await db.$executeRawUnsafe(trigger.definition);await db.$executeRawUnsafe(`ALTER TABLE ${q(trigger.table)} ${trigger.enabled==='A'?'ENABLE ALWAYS':trigger.enabled==='D'?'DISABLE':'ENABLE'} TRIGGER ${q(trigger.name)}`)}
  const{provisionFtextRecoverySchema}=await import('../src/services/ftext-cash-schema.js'),{provisionAiWalletRecovery}=await import('../src/services/ai-owner-wallet-schema.js'),{ensureBackofficeStaffSchema}=await import('../src/backoffice-staff-bootstrap.js');
  await provisionFtextRecoverySchema(db);await provisionAiWalletRecovery(db);await ensureBackofficeStaffSchema(db);
  await db.$executeRawUnsafe(`INSERT INTO "Company"("id","name","updatedAt") VALUES ('fixture-company','SYNTHETIC',NOW())`);
  await db.$executeRawUnsafe(`INSERT INTO "Store"("id","name","companyId","updatedAt") VALUES ('target','SYNTHETIC','fixture-company',NOW())`);
  const{reviewedFreshStoreManifest}=await import('../src/services/store-lifecycle-manifest.js'),{createLifecycleInspectionCore}=await import('../src/services/store-lifecycle-executor.js');
  const manifest=reviewedFreshStoreManifest(),manifestBefore=JSON.stringify(manifest),actor={id:'isolated-lifecycle-admin',isSuperAdmin:true},scope={companyId:'fixture-company',storeId:'target'};
  assert.ok(names.every(name=>!manifest.knownTables.includes(name)));assert.ok(!manifest.knownColumns.StoreChatMessage.some(c=>c[0]==='replyToId'));
  const old=createLifecycleInspectionCore(manifest,{sourceRevision:'a'.repeat(40)});
  const beforeData=await allRows(db),accepted=await old.inspect(db,actor,scope);assert.equal(accepted.guardsInstalled,false);assert.equal(accepted.executionAvailable,false);assert.equal(accepted.recoveryVerified,false);assert.deepEqual(await allRows(db),beforeData);
  const before=await observe(db);
  assert.ok(names.every(name=>!before.relations.some(r=>r.name===name)));assert.ok(!before.columns.some(c=>c.table==='StoreChatMessage'&&c.name==='replyToId'));assert.ok(!before.indexes.some(i=>i.name==='StoreChatMessage_pinned_announcements_idx'));
  const{ensureStoreChatInteractions}=await import('../src/chat-interactions.mjs');
  await ensureStoreChatInteractions(db);
  const after=await observe(db),beforeRelations=new Set(before.relations.map(r=>r.name)),beforeColumns=new Set(before.columns.map(c=>c.table+'.'+c.name)),beforeIndexes=new Set(before.indexes.map(i=>i.name));
  const addedRelations=after.relations.filter(r=>!beforeRelations.has(r.name)),addedColumns=after.columns.filter(c=>!beforeColumns.has(c.table+'.'+c.name)),addedIndexes=after.indexes.filter(i=>!beforeIndexes.has(i.name));
  assert.deepEqual(addedRelations.map(r=>r.name),names);assert.equal(addedColumns.length,12);assert.equal(addedIndexes.length,3);
  assert.deepEqual(after.relations.filter(r=>beforeRelations.has(r.name)),before.relations,'no earlier relation definition changed');
  assert.deepEqual(after.columns.filter(c=>beforeColumns.has(c.table+'.'+c.name)),before.columns,'no earlier column definition changed');
  assert.deepEqual(after.indexes.filter(i=>beforeIndexes.has(i.name)),before.indexes,'no earlier index changed');
  const expected=[...['messageId','userId','companyId','storeId'].map((name,index)=>({table:'StoreChatDelivery',name,ordinal:index+1,type:'text',required:true,identity:'',generated:'',defaultExpression:null})),{table:'StoreChatDelivery',name:'deliveredAt',ordinal:5,type:'timestamp with time zone',required:true,identity:'',generated:'',defaultExpression:'now()'},
   {table:'StoreChatMessage',name:'replyToId',ordinal:22,type:'text',required:false,identity:'',generated:'',defaultExpression:null},
   ...['messageId','userId','companyId','storeId','reaction'].map((name,index)=>({table:'StoreChatReaction',name,ordinal:index+1,type:'text',required:true,identity:'',generated:'',defaultExpression:null})),{table:'StoreChatReaction',name:'updatedAt',ordinal:6,type:'timestamp with time zone',required:true,identity:'',generated:'',defaultExpression:'now()'}];
  assert.deepEqual(addedColumns,expected);
  const storeOwner=after.relations.find(r=>r.name==='Store').owner;
  for(const relation of addedRelations)assert.deepEqual(relation,{name:relation.name,kind:'r',partition:false,rls:false,forced:false,owner:storeOwner,inherited:false,rewritten:false});
  assert.equal(storeOwner,after.environment.currentRole,'actual CI creator/owner, never a production owner literal');
  assert.equal(after.constraints.filter(c=>c.kind==='f').length,0);assert.deepEqual(after.triggers,[]);
  // Keep real PG18 kind-n NOT NULL rows in emitted evidence. Required fields
  // were asserted above; only their catalogue representation is version-specific.
  const structural=after.constraints.filter(c=>c.kind!=='n');assert.equal(structural.length,3);
  for(const table of names){const primary=structural.filter(c=>c.table===table&&c.kind==='p');assert.equal(primary.length,1);assert.deepEqual(primary[0].columns,['messageId','userId']);assert.equal(primary[0].valid,true);assert.equal(primary[0].deferrable,false)}
  const checks=structural.filter(c=>c.kind==='c');assert.equal(checks.length,1);assert.equal(checks[0].table,'StoreChatReaction');assert.deepEqual(checks[0].columns,['reaction']);assert.equal(checks[0].valid,true);assert.equal(checks[0].deferrable,false);assert.equal(normalize(checks[0].expression),"reaction=ANYARRAY['👍','✅','❤️']");
  for(const table of names){const primary=addedIndexes.find(i=>i.table===table);assert.ok(primary);assert.equal(primary.primary,true);assert.equal(primary.unique,true);assert.deepEqual(primary.columns,['messageId','userId']);assert.equal(primary.predicate,null);assert.equal(primary.expressions,null)}
  // Per-column pg_get_indexdef returns attributes only. Verify btree direction
  // from the actual INDOPTION_DESC (0x0001) flags, retaining raw text as evidence.
  const pinned=addedIndexes.find(i=>i.name==='StoreChatMessage_pinned_announcements_idx');assert.ok(pinned);assert.equal(pinned.table,'StoreChatMessage');assert.equal(pinned.primary,false);assert.equal(pinned.unique,false);assert.deepEqual(pinned.columns,['storeId','createdAt']);assert.equal(normalize(pinned.predicate),"pinned=trueANDcategory='ANNOUNCEMENT'");assert.equal(pinned.expressions,null);assert.equal(pinned.method,'btree');assert.equal(pinned.firstDescending,false);assert.equal(pinned.secondDescending,true);
  for(const index of addedIndexes){assert.equal(index.valid,true);assert.equal(index.ready,true);assert.equal(index.immediate,true);assert.equal(index.keyCount,2);assert.equal(index.attributeCount,2)}
  const afterBootstrapData=await allRows(db);for(const name of Object.keys(beforeData))assert.deepEqual(afterBootstrapData[name],beforeData[name],name);for(const name of names)assert.deepEqual(afterBootstrapData[name],[]);
  let hold;try{await old.inspect(db,actor,scope);assert.fail('Old catalogue accepted unreviewed Chat relations')}catch(error){assert.equal(error.status,409);assert.equal(error.message,'Unreviewed database relation: StoreChatDelivery');hold=error}
  const afterHoldData=await allRows(db);assert.deepEqual(afterHoldData,afterBootstrapData);assert.equal(JSON.stringify(manifest),manifestBefore);
  const absent=(await db.$queryRawUnsafe(`SELECT to_regclass('"StoreLifecycleFence"')::text AS fence,to_regclass('"StoreLifecycleExecution"')::text AS execution,to_regclass('"MonthlyInventorySnapshot"')::text AS snapshot,to_regclass('"MonthlyInventoryCaptureGrant"')::text AS grant,to_regclass('"MonthlyInventoryCaptureJob"')::text AS job`))[0];assert.deepEqual(absent,{fence:null,execution:null,snapshot:null,grant:null,job:null});
  const facts={format:factsMarker,...after.environment,relations:addedRelations,columns:addedColumns,constraints:after.constraints,indexes:addedIndexes,triggers:after.triggers,foreignKeyCount:0};
  console.log(factsMarker+' '+JSON.stringify(facts));
  console.log(holdMarker+' '+JSON.stringify({format:holdMarker,status:hold.status,reason:hold.message,oldBaselineAccepted:true,oldManifestSha256:digest(manifest),beforeDataSha256:digest(afterBootstrapData),afterDataSha256:digest(afterHoldData),absent,capabilityConsulted:false,installationPerformed:false}));
 }finally{await db.$disconnect()}
}

if(process.env[childKey]==='1')await nativeFacts();
else test('native-first actual Chat bootstrap emits complete twelve-column facts and unchanged old catalogue refuses before installation',{
 skip:!isolated()&&!process.env.CI?'Actual isolated PostgreSQL unavailable locally':false,timeout:300000
},async()=>{
 assert.ok(isolated(),'Actual isolated PostgreSQL is mandatory in CI');const{PrismaClient}=await import('@prisma/client'),admin=new PrismaClient(),name='chat_catalogue_'+randomBytes(10).toString('hex')+'_test';let created=false;
 try{await admin.$executeRawUnsafe(`CREATE DATABASE ${q(name)}`);created=true;const url=new URL(process.env.DATABASE_URL);url.pathname='/'+name;
  const{stdout}=await promisify(execFile)(process.execPath,[fileURLToPath(import.meta.url)],{env:{...process.env,DATABASE_URL:url.href,NODE_ENV:'test',[childKey]:'1'},timeout:270000,maxBuffer:4*1024*1024});
  const factLine=stdout.split('\n').find(line=>line.startsWith(factsMarker+' ')),holdLine=stdout.split('\n').find(line=>line.startsWith(holdMarker+' '));assert.ok(factLine,'Actual native metadata output is required');assert.ok(holdLine,'Actual old-catalogue HOLD output is required');
  const facts=JSON.parse(factLine.slice(factsMarker.length+1)),hold=JSON.parse(holdLine.slice(holdMarker.length+1));assert.equal(facts.format,factsMarker);assert.equal(facts.columns.length,12);assert.equal(facts.foreignKeyCount,0);assert.equal(hold.oldBaselineAccepted,true);assert.equal(hold.beforeDataSha256,hold.afterDataSha256);assert.equal(hold.installationPerformed,false);
  console.log(factLine);console.log(holdLine);
 }finally{if(created)await admin.$executeRawUnsafe(`DROP DATABASE ${q(name)} WITH (FORCE)`);await admin.$disconnect()}
});
