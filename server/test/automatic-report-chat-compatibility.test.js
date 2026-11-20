import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {prepareReportChatInspection,reportChatCompatibilityDDL} from '../src/services/automatic-report-chat-compatibility.js';
const fixture=JSON.parse(readFileSync(new URL('../../ops/backup/lifecycle/report-chat-compatibility.proposed.json',import.meta.url),'utf8'));
function canonical(value){
 if(Array.isArray(value))return '['+value.map(canonical).join(',')+']';
 if(value&&typeof value==='object')return '{'+Object.keys(value).sort().map(key=>JSON.stringify(key)+':'+canonical(value[key])).join(',')+'}';
 return JSON.stringify(value);
}
const raw=(catalogue,rows=[])=>({$queryRawUnsafe:async sql=>{
 if(sql.includes('c.relowner=')&&sql.includes('c.relreplident'))return catalogue.relations;
 if(sql.includes('a.attnum::int AS position'))return catalogue.columns;
 if(sql.includes('c.condeferrable'))return catalogue.constraints;
 if(sql.includes('i.indisreplident'))return catalogue.indexes;
 if(sql.includes('p.prosupport'))return catalogue.triggers;
 return rows;
}});

test('chat fixture pins canonical metadata, complete FK graph and reviewed identities',()=>{
 assert.deepEqual(fixture.knownTables,['StoreChatGroup','StoreChatGroupMember','StoreChatGroupMessage','StoreChatMutedTopic']);
 assert.equal(fixture.catalogueHash,createHash('sha256').update(canonical(fixture.catalogue)).digest('hex'));
 assert.equal(fixture.catalogue.columns.length,17);
 assert.equal(fixture.catalogue.constraints.filter(row=>row.kind==='p').length,4);
 assert.equal(fixture.catalogue.constraints.filter(row=>row.kind==='f'&&row.onDelete==='c').length,2);
 assert.equal(fixture.catalogue.indexes.length,6);assert.deepEqual(fixture.catalogue.triggers,[]);
 for(const {name,columns} of fixture.tables)assert.deepEqual(columns,fixture.knownColumns[name]);
 assert.deepEqual(reportChatCompatibilityDDL(),fixture.ddl);
});

test('verified chat proxy masks only four reviewed metadata tables and preserves other queries and package guards',async()=>{
 const rows=[{table:'StoreChatGroup',name:'StoreChatGroup'},{table:'OtherChatTable',name:'OtherChatTable'},{table:'StoreProduct',name:'mws_guard_package_stock_change'},{table:'OtherChatTable',name:'unexpected_trigger'}];
 const {tx,evidence}=await prepareReportChatInspection(raw(fixture.catalogue,rows),'public');
 const triggerSQL='SELECT c.relname AS "table",t.tgname AS name,t.tgenabled::text AS enabled,p.prosrc AS body FROM pg_trigger t';
 assert.deepEqual(await tx.$queryRawUnsafe(triggerSQL,'public'),rows.slice(1));
 assert.deepEqual(await tx.$queryRawUnsafe(triggerSQL,'other'),rows);
 assert.deepEqual(await tx.$queryRawUnsafe(triggerSQL,'public','extra'),rows);
 assert.deepEqual(await tx.$queryRawUnsafe('SELECT * FROM pg_trigger','public'),rows);
 assert.equal(evidence.executionEnabled,false);assert.equal(evidence.preservedTables.length,4);
 const fks=[{child:'StoreChatGroupMember',childSchema:'public',parent:'StoreChatGroup',parentSchema:'public'},{child:'Unrelated',childSchema:'public',parent:'Other',parentSchema:'public'}];
 const fkProxy=(await prepareReportChatInspection(raw(fixture.catalogue,fks),'public')).tx;
 assert.deepEqual(await fkProxy.$queryRawUnsafe('SELECT child.relname AS child,parent.relname AS parent,extra FROM pg_constraint c','public'),fks.slice(1));
});

test('missing metadata, unexpected dependencies, physical changes and chat triggers fail before a proxy is returned',async()=>{
 for(const key of ['relations','columns','constraints','indexes','triggers']){
  const changed=structuredClone(fixture.catalogue);changed[key].push({unexpected:true});
  await assert.rejects(prepareReportChatInspection(raw(changed),'public'),{code:'REPORT_OPERATIONAL_CHAT_CATALOGUE_CHANGED'});
 }
 for(const [section,field,value] of [['relations','ownedByCurrentUser',false],['relations','persistence','u'],['relations','rls',true],['relations','inherited',true],['columns','defaultExpression',"'changed'::text"],['columns','notNull',false],['constraints','validated',false],['indexes','valid',false]]){
  const changed=structuredClone(fixture.catalogue);changed[section][0][field]=value;
  await assert.rejects(prepareReportChatInspection(raw(changed),'public'),{code:'REPORT_OPERATIONAL_CHAT_CATALOGUE_CHANGED'});
 }
});

test('real PostgreSQL WASM rejects chat DDL drift and leaves unknown metadata visible',{skip:!process.env.MWS_TEST_PGLITE_MODULE,timeout:120000},async()=>{
 const {PGlite}=await import(process.env.MWS_TEST_PGLITE_MODULE),db=new PGlite();
 const tx={$queryRawUnsafe:async(sql,...args)=>(await db.query(sql,args)).rows};
 try{
  for(const sql of reportChatCompatibilityDDL())await db.exec(sql);
  await db.exec('CREATE ROLE chat_drift_owner');
  await db.exec('CREATE FUNCTION chat_fixture_trigger() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RETURN NEW; END $$');
  await db.exec('CREATE TABLE "OtherIdentity" (id text primary key)');
  assert.equal((await prepareReportChatInspection(tx,'public')).evidence.catalogueHash,fixture.catalogueHash);
  const changes=[
   'DROP TABLE "StoreChatMutedTopic"',
   'ALTER TABLE "StoreChatGroup" ADD COLUMN unexpected text',
   'ALTER TABLE "StoreChatGroup" ALTER COLUMN name TYPE varchar(80)',
   'ALTER TABLE "StoreChatGroupMessage" ALTER COLUMN "createdAt" SET DEFAULT clock_timestamp()',
   'ALTER TABLE "StoreChatGroup" ALTER COLUMN "createdBy" DROP NOT NULL',
   'ALTER TABLE "StoreChatGroup" ENABLE ROW LEVEL SECURITY',
   'ALTER TABLE "StoreChatGroup" FORCE ROW LEVEL SECURITY',
   'ALTER TABLE "StoreChatMutedTopic" SET UNLOGGED',
   'ALTER TABLE "StoreChatGroup" OWNER TO chat_drift_owner',
   'GRANT SELECT ON "StoreChatGroup" TO chat_drift_owner',
   'CREATE TABLE "InheritedChat" () INHERITS ("StoreChatGroup")',
   'ALTER TABLE "StoreChatGroup" ADD CHECK (length(name)>0)',
   'CREATE INDEX extra_chat_direct ON "StoreChatGroup"(name)',
   'CREATE INDEX extra_chat_expression ON "StoreChatGroup"(lower(name))',
   'CREATE INDEX extra_chat_partial ON "StoreChatGroup"(name) WHERE name IS NOT NULL',
   'DROP INDEX "StoreChatGroup_scope_idx"',
   'ALTER TABLE "StoreChatGroupMember" DROP CONSTRAINT "StoreChatGroupMember_groupId_fkey"',
   'ALTER TABLE "StoreChatGroup" ADD FOREIGN KEY ("createdBy") REFERENCES "OtherIdentity"(id)',
   'CREATE TABLE "ExternalChatReference" (id text REFERENCES "StoreChatGroup"(id))',
   'CREATE TRIGGER extra_chat_trigger BEFORE INSERT ON "StoreChatGroup" FOR EACH ROW EXECUTE FUNCTION chat_fixture_trigger()'
  ];
  for(const sql of changes){
   await db.exec('BEGIN');
   try{await db.exec(sql);await assert.rejects(prepareReportChatInspection(tx,'public'),{code:'REPORT_OPERATIONAL_CHAT_CATALOGUE_CHANGED'},sql)}finally{await db.exec('ROLLBACK')}
  }
  await db.exec('CREATE TABLE "UnreviewedChatTable" (id text)');
  const proxy=(await prepareReportChatInspection(tx,'public')).tx;
  const rows=await proxy.$queryRawUnsafe('SELECT c.relname AS name,c.relkind::text AS kind,c.relispartition AS partition,c.relrowsecurity AS rls FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname=$1 AND c.relkind=\'r\' ORDER BY c.relname','public');
  assert.ok(rows.some(row=>row.name==='UnreviewedChatTable'));
  assert.ok(!rows.some(row=>row.name==='StoreChatGroup'));
 }finally{await db.close()}
});
