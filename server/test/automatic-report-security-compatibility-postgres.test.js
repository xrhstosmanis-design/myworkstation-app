import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {inspectReportSecurityCatalogue,projectReportSecurityCatalogue} from '../src/services/automatic-report-security-compatibility.js';
const connectionString=process.env.REPORT_SECURITY_TEST_DATABASE_URL||process.env.DATABASE_URL;
function assertIsolated(value){const u=new URL(value);assert.equal(u.search,'','Input URL query parameters are not permitted');assert.ok(['localhost','127.0.0.1','[::1]'].includes(u.hostname)&&/_[a-z]*test$/.test(u.pathname)&&process.env.NODE_ENV==='test','Only explicit local test databases are permitted');}
test('native isolated security metadata, multi-tenant deny preservation and drift refusal',{skip:!connectionString},async()=>{
 assertIsolated(connectionString);
 let db;
 if(process.env.REPORT_SECURITY_PG_CLIENT){const require=createRequire(import.meta.url);const {Client}=require(process.env.REPORT_SECURITY_PG_CLIENT);db=new Client({connectionString});await db.connect();}
 else{const boundUrl=new URL(connectionString);boundUrl.searchParams.set('connection_limit','1');const {PrismaClient}=await import('@prisma/client');const prisma=new PrismaClient({datasources:{db:{url:boundUrl.toString()}}});db={query:async(sql,args=[])=>/^(SELECT|WITH)/i.test(sql)?{rows:await prisma.$queryRawUnsafe(sql,...args)}:{rows:[],count:await prisma.$executeRawUnsafe(sql,...args)},end:()=>prisma.$disconnect()};}
 const schema='security_stage_a_'+Date.now();const q=s=>'"'+s.replaceAll('"','""')+'"';
 const tx={$queryRawUnsafe:async(sql,...args)=>(await db.query(sql,args)).rows};
 try{
 await db.query('CREATE SCHEMA '+q(schema));await db.query('SET search_path TO '+q(schema));
 await db.query('CREATE TABLE "Store" (id text PRIMARY KEY)');await db.query('CREATE TABLE "StoreChatAccessRevocation" ("companyId" TEXT NOT NULL,"storeId" TEXT NOT NULL,"userId" TEXT NOT NULL,PRIMARY KEY("companyId","storeId","userId"))');
 await db.query(`INSERT INTO "StoreChatAccessRevocation" VALUES ('a','one','u'),('a','two','u'),('b','three','v')`);
 const snapshot=async()=>JSON.stringify((await db.query('SELECT * FROM "StoreChatAccessRevocation" ORDER BY 1,2,3')).rows);const before=await snapshot();
 await db.query('BEGIN READ ONLY');const proof=await inspectReportSecurityCatalogue(tx,schema);projectReportSecurityCatalogue({schema,relations:[{name:'Store'},{name:'StoreChatAccessRevocation',catalogue:proof.catalogue}],security:proof.catalogue},{knownTables:['Store']});await db.query('COMMIT');assert.equal(await snapshot(),before);
 for(const ddl of ['ALTER TABLE "StoreChatAccessRevocation" ADD COLUMN extra text','ALTER TABLE "StoreChatAccessRevocation" ALTER COLUMN "userId" SET DEFAULT \'x\'','CREATE INDEX extra ON "StoreChatAccessRevocation"("userId")','ALTER TABLE "StoreChatAccessRevocation" ADD CHECK(length("userId")>0)','ALTER TABLE "StoreChatAccessRevocation" ENABLE ROW LEVEL SECURITY',['ALTER TABLE \"StoreChatAccessRevocation\" ADD COLUMN gone text','ALTER TABLE \"StoreChatAccessRevocation\" DROP COLUMN gone'],['CREATE FUNCTION bad_trigger() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RETURN NEW; END $$','CREATE TRIGGER extra BEFORE INSERT ON \"StoreChatAccessRevocation\" FOR EACH ROW EXECUTE FUNCTION bad_trigger()'],['CREATE ROLE stage_a_owner','ALTER TABLE \"StoreChatAccessRevocation\" OWNER TO stage_a_owner'],['ALTER TABLE \"StoreChatAccessRevocation\" DROP CONSTRAINT \"StoreChatAccessRevocation_pkey\"','CREATE UNIQUE INDEX \"StoreChatAccessRevocation_pkey\" ON \"StoreChatAccessRevocation\"(\"companyId\" text_pattern_ops,\"storeId\",\"userId\")'],'CREATE TABLE inbound (c text,s text,u text,FOREIGN KEY(c,s,u) REFERENCES "StoreChatAccessRevocation")']){
 await db.query('BEGIN');for(const statement of (Array.isArray(ddl)?ddl:[ddl]))await db.query(statement);await assert.rejects(inspectReportSecurityCatalogue(tx,schema));await db.query('ROLLBACK');assert.equal(await snapshot(),before);
 }
 }finally{await db.query('ROLLBACK').catch(()=>{});await db.query('DROP SCHEMA '+q(schema)+' CASCADE');await db.end();}
});
if(!process.env.REPORT_SECURITY_GUARD_PROBE)test('both native adapters refuse unsafe routing before connecting',async()=>{
 const {spawnSync}=await import('node:child_process');
 for(const client of ['', '/nonexistent-client-must-not-load'])for(const url of ['postgresql://agent@remote.invalid/security_test','postgresql://agent@127.0.0.1/production','postgresql://agent@127.0.0.1/security_test?host=remote.invalid','postgresql://agent@127.0.0.1/security_test?service=remote']){
  const env={...process.env,NODE_ENV:'test',REPORT_SECURITY_GUARD_PROBE:'1',REPORT_SECURITY_TEST_DATABASE_URL:url,REPORT_SECURITY_PG_CLIENT:client};delete env.NODE_TEST_CONTEXT;
  const r=spawnSync(process.execPath,['--test',new URL(import.meta.url).pathname],{encoding:'utf8',env});
  assert.notEqual(r.status,0);assert.match(r.stdout+r.stderr,/Only explicit local test databases|Input URL query parameters/);assert.doesNotMatch(r.stdout+r.stderr,/ENOTFOUND|ECONNREFUSED|Cannot find module/);
 }
});
