import test from 'node:test';
import assert from 'node:assert/strict';
import {randomBytes,randomUUID} from 'node:crypto';
import {mkdtemp,readFile,stat,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {STORE_RECOVERY_FORMAT,sealLifecycleRecovery,openLifecycleRecovery,persistLifecycleRecovery} from '../src/services/store-lifecycle-recovery.js';
const scope={companyId:'company',storeId:'target',mode:'RESET'};
const value=()=>({format:STORE_RECOVERY_FORMAT,scope,sourceRevision:'1'.repeat(40),createdAt:'2026-10-18T12:00:00Z',manifestHash:'a'.repeat(64),tables:[{name:'Sale',rows:['{"id":"sale","amount":9007199254740993.123456789,"secret":"PRIVATE PIN HASH"}']}]});
const options=()=>({encryptionKey:randomBytes(32),keyId:'recovery-key-1',expectedScope:scope,expectedManifestHash:'a'.repeat(64),expectedSourceRevision:'1'.repeat(40)});
test('authenticated encryption preserves exact SQL row text and reveals no row contents',()=>{
 const opts=options(),source=value(),first=sealLifecycleRecovery(source,opts),second=sealLifecycleRecovery(source,opts);
 assert.notDeepEqual(first,second);assert.doesNotMatch(first.toString(),/PRIVATE PIN HASH|9007199254740993/);
 assert.deepEqual(openLifecycleRecovery(first,opts),source);assert.equal(openLifecycleRecovery(first,opts).tables[0].rows[0],source.tables[0].rows[0]);
});
test('wrong key, key ID, company, store, mode, tampering and malformed artifacts fail closed',()=>{
 const opts=options(),bytes=sealLifecycleRecovery(value(),opts);
 for(const changed of [{encryptionKey:randomBytes(32)},{keyId:'other-key'},{expectedManifestHash:'b'.repeat(64)},{expectedSourceRevision:'2'.repeat(40)},...['companyId','storeId','mode'].map(field=>({expectedScope:{...scope,[field]:field==='mode'?'DELETE':'other'}}))])assert.throws(()=>openLifecycleRecovery(bytes,{...opts,...changed}),/Invalid or unverifiable/);
 for(const field of ['iv','tag','ciphertext']){const envelope=JSON.parse(bytes);const b=Buffer.from(envelope[field],'base64');b[0]^=1;envelope[field]=b.toString('base64');assert.throws(()=>openLifecycleRecovery(Buffer.from(JSON.stringify(envelope)),opts),/Invalid or unverifiable/)}
 for(const input of [Buffer.from('{}'),bytes.subarray(0,30),Buffer.from('not-json')])assert.throws(()=>openLifecycleRecovery(input,opts),/Invalid or unverifiable/);
 assert.throws(()=>sealLifecycleRecovery(value(),{...opts,encryptionKey:Buffer.alloc(31)}));
 assert.throws(()=>sealLifecycleRecovery({...value(),tables:[{name:'Sale',rows:['null']}]},opts));
 assert.throws(()=>sealLifecycleRecovery({...value(),tables:[...value().tables,...value().tables]},opts));
});
test('persisted encrypted file is exclusive, private, synced and read back; readback never claims verified restore',async()=>{
 const directory=await mkdtemp(path.join(tmpdir(),'mws-recovery-test-')),opts=options();
 try{
  const a=await persistLifecycleRecovery(value(),{...opts,directory}),b=await persistLifecycleRecovery(value(),{...opts,directory});
  assert.notEqual(a.artifactPath,b.artifactPath);assert.equal(a.storageReadbackVerified,true);assert.equal(a.restoreVerified,false);
  assert.equal((await stat(a.artifactPath)).mode&0o777,0o600);assert.deepEqual(openLifecycleRecovery(await readFile(a.artifactPath),opts),value());
  await assert.rejects(persistLifecycleRecovery(value(),{...opts,directory:'relative'}));
 }finally{await rm(directory,{recursive:true,force:true})}
});
const isolated=(()=>{try{const u=new URL(process.env.DATABASE_URL);return process.env.NODE_ENV==='test'&&['localhost','127.0.0.1','postgres'].includes(u.hostname)&&/test/i.test(u.pathname)}catch{return false}})();
test('native isolated recovery restores exact selected-store SQL rows and children, preserving source and sibling/foreign controls',{skip:!isolated},async()=>{
 const {PrismaClient}=await import('@prisma/client'),db=new PrismaClient(),source='recovery_source_'+randomUUID().replaceAll('-',''),target='recovery_target_'+randomUUID().replaceAll('-','');
 const q=s=>'"'+s+'"',directory=await mkdtemp(path.join(tmpdir(),'mws-recovery-native-'));
 try{
  for(const schema of [source,target]){
   await db.$executeRawUnsafe(`CREATE SCHEMA ${q(schema)}`);
   await db.$executeRawUnsafe(`CREATE TABLE ${q(schema)}."Sale" ("id" text PRIMARY KEY,"companyId" text,"storeId" text,"amount" numeric(30,9),"payload" jsonb,"binary" bytea,"createdAt" timestamptz)`);
   await db.$executeRawUnsafe(`CREATE TABLE ${q(schema)}."SaleLine" ("id" text PRIMARY KEY,"saleId" text REFERENCES ${q(schema)}."Sale"("id"),"quantity" bigint)`);
  }
  await db.$executeRawUnsafe(`INSERT INTO ${q(source)}."Sale" VALUES ('sale','company','target',9007199254740993.123456789,'{"secret":"PRIVATE RECOVERY DATA","n":9007199254740993}',decode('00ff0a','hex'),'2026-10-18T12:00:00.123456Z'),('sibling','company','sibling',1,'{}',NULL,NOW()),('foreign','other','foreign',2,'{}',NULL,NOW())`);
  await db.$executeRawUnsafe(`INSERT INTO ${q(source)}."SaleLine" VALUES ('line','sale',9007199254740993),('control','sibling',1)`);
  const all=async(schema,table,where='TRUE',params=[])=>db.$queryRawUnsafe(`SELECT row_to_json(t)::text AS row FROM ${q(schema)}.${q(table)} t WHERE ${where} ORDER BY "id"`,...params);
  const before={Sale:await all(source,'Sale'),SaleLine:await all(source,'SaleLine')};
  const selected=await all(source,'Sale','"companyId"=$1 AND "storeId"=$2',['company','target']);
  const lines=await all(source,'SaleLine',`"saleId" IN (SELECT "id" FROM ${q(source)}."Sale" WHERE "companyId"=$1 AND "storeId"=$2)`,['company','target']);
  const snapshot={...value(),tables:[{name:'Sale',rows:selected.map(x=>x.row)},{name:'SaleLine',rows:lines.map(x=>x.row)}]},opts=options();
  const persisted=await persistLifecycleRecovery(snapshot,{...opts,directory});
  const opened=openLifecycleRecovery(await readFile(persisted.artifactPath),opts);
  assert.equal(persisted.restoreVerified,false);
  // Fixture-only restore into a separate empty schema; no production restore API is exposed.
  await db.$transaction(async tx=>{for(const table of opened.tables)for(const row of table.rows)await tx.$executeRawUnsafe(`INSERT INTO ${q(target)}.${q(table.name)} SELECT * FROM json_populate_record(NULL::${q(target)}.${q(table.name)},$1::json)`,row)});
  assert.deepEqual(await all(target,'Sale'),selected);assert.deepEqual(await all(target,'SaleLine'),lines);
  assert.deepEqual(await all(source,'Sale'),before.Sale);assert.deepEqual(await all(source,'SaleLine'),before.SaleLine);
  assert.equal((await all(target,'Sale')).length,1);assert.equal((await all(target,'SaleLine')).length,1);
 }finally{for(const schema of [target,source])await db.$executeRawUnsafe(`DROP SCHEMA IF EXISTS ${q(schema)} CASCADE`).catch(()=>{});await db.$disconnect();await rm(directory,{recursive:true,force:true})}
});
