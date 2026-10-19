import test from 'node:test';
import assert from 'node:assert/strict';
import {randomBytes,randomUUID} from 'node:crypto';
import {mkdtemp,readFile,readdir,writeFile,rm,stat} from 'node:fs/promises';
import path from 'node:path';
import {tmpdir} from 'node:os';
import {digestLifecycleRows,persistLifecycleRecoveryStream,readLifecycleRecoveryStream,verifyLifecycleRecoveryStream} from '../src/services/store-lifecycle-recovery-stream.js';
import {openLifecycleRecovery,sealLifecycleRecovery} from '../src/services/store-lifecycle-recovery.js';

const descriptor={scope:{companyId:'company',storeId:'target',mode:'RESET'},manifestHash:'a'.repeat(64),sourceRevision:'b'.repeat(40),schemaSignature:'c'.repeat(64),tables:[{name:'Sale',action:'REMOVE'},{name:'Settings',action:'KEEP'},{name:'Empty',action:'REMOVE'}]};
async function fixture(){
 const directory=await mkdtemp(path.join(tmpdir(),'mws-stream-'));
 const options={directory,encryptionKey:randomBytes(32),keyId:'isolated-stream-key',expectedScope:descriptor.scope,expectedManifestHash:descriptor.manifestHash,expectedSourceRevision:descriptor.sourceRevision,expectedSchemaSignature:descriptor.schemaSignature};
 return {options,close:()=>rm(directory,{recursive:true,force:true})};
}
test('streamed encrypted recovery exceeds the old total-size cap using bounded chunks, preserves exact row text and never claims SQL restore',async()=>{
 const f=await fixture();try{
  const expectedSettings='{"terminalPos":"KAT-POS-02","value":9007199254740993.123456789}';
  let produced=0,consumed=0;
  const saved=await persistLifecycleRecoveryStream(descriptor,{...f.options,readRows:async function*(name){
   if(name==='Sale')for(let n=0;n<18;n++){produced++;yield '{"id":"'+n+'","payload":"'+'x'.repeat(2*1024*1024)+'"}'}
   if(name==='Settings')yield expectedSettings;
  }});
  assert.equal(produced,18);assert.equal(saved.restoreVerified,false);assert.ok(saved.chunkCount>9);
  const bytes=await readFile(saved.artifactPath),options={...f.options,expectedSnapshotHash:saved.snapshotHash};
  assert.deepEqual(await verifyLifecycleRecoveryStream(bytes,options),{storageReadbackVerified:true,restoreVerified:false,rowCount:19,chunkCount:saved.chunkCount});
  for await(const chunk of readLifecycleRecoveryStream(bytes,options)){
   consumed+=chunk.rows.length;if(chunk.table==='Settings')assert.deepEqual(chunk.rows,[expectedSettings]);
  }
  assert.equal(consumed,19);
  for(const name of await readdir(f.options.directory))assert.ok((await stat(path.join(f.options.directory,name))).size<12*1024*1024);
  await assert.rejects(verifyLifecycleRecoveryStream(bytes,{...options,expectedSnapshotHash:'d'.repeat(64)}));
  await assert.rejects(verifyLifecycleRecoveryStream(bytes,{...options,expectedSchemaSignature:'d'.repeat(64)}));
 }finally{await f.close()}
});
test('missing, reordered, cross-scope or tampered chunks cannot verify a stream',async()=>{
 const f=await fixture();try{
  const saved=await persistLifecycleRecoveryStream(descriptor,{...f.options,chunkBytes:1024,readRows:async function*(name){if(name==='Sale')for(let n=0;n<3;n++)yield JSON.stringify({id:n,payload:'y'.repeat(900)})}});
  const bytes=await readFile(saved.artifactPath),options={...f.options,expectedSnapshotHash:saved.snapshotHash},index=openLifecycleRecovery(bytes,options);
  assert.equal(index.chunks.length,3);
  const reordered={...index,chunks:[...index.chunks].reverse()};
  await assert.rejects(verifyLifecycleRecoveryStream(sealLifecycleRecovery(reordered,options),options));
  await assert.rejects(verifyLifecycleRecoveryStream(bytes,{...options,expectedScope:{...descriptor.scope,storeId:'sibling'}}));
  const filename=path.join(f.options.directory,index.chunks[1].filename),original=await readFile(filename),tampered=Buffer.from(original);tampered[tampered.length-10]^=1;await writeFile(filename,tampered);
  await assert.rejects(verifyLifecycleRecoveryStream(bytes,options));await rm(filename);
  await assert.rejects(verifyLifecycleRecoveryStream(bytes,options));
 }finally{await f.close()}
});
test('failed source reads leave no complete index or usable partial stream',async()=>{
 const f=await fixture();try{
  await assert.rejects(persistLifecycleRecoveryStream(descriptor,{...f.options,chunkBytes:1024,readRows:async function*(name){if(name==='Sale'){yield JSON.stringify({payload:'x'.repeat(900)});yield JSON.stringify({payload:'y'.repeat(900)});throw Error('source disconnected')}}}),/source disconnected/);
  assert.deepEqual(await readdir(f.options.directory),[]);
 }finally{await f.close()}
});

const isolated=(()=>{try{const u=new URL(process.env.DATABASE_URL);return process.env.NODE_ENV==='test'&&['localhost','127.0.0.1','postgres'].includes(u.hostname)&&/test/i.test(u.pathname)}catch{return false}})();
test('native streamed recovery restores every exact numeric/timestamp/inline attachment row into an isolated schema with unchanged source and sibling control',{skip:!isolated},async()=>{
 const {PrismaClient}=await import('@prisma/client'),db=new PrismaClient(),f=await fixture(),source='stream_src_'+randomUUID().replaceAll('-',''),restore='stream_dst_'+randomUUID().replaceAll('-','');
 try{
  for(const schema of [source,restore]){await db.$executeRawUnsafe(`CREATE SCHEMA "${schema}"`);await db.$executeRawUnsafe(`CREATE TABLE "${schema}"."Document"("id" text PRIMARY KEY,"storeId" text NOT NULL,"value" numeric(30,9),"time" timestamptz,"contentData" text)`)}
  for(let n=0;n<5;n++)await db.$executeRawUnsafe(`INSERT INTO "${source}"."Document" VALUES($1,'target',9007199254740993.123456789,'2026-10-18T15:40:20.228615Z',$2)`,String(n),'INLINE ORIGINAL '+String(n)+'z'.repeat(1500));
  await db.$executeRawUnsafe(`INSERT INTO "${source}"."Document" VALUES('sibling','sibling',2,NOW(),'CONTROL')`);
  const read=()=>db.$queryRawUnsafe(`SELECT row_to_json(t)::text AS row FROM "${source}"."Document" t ORDER BY "id"`),before=await read();
  const d={...descriptor,tables:[{name:'Document',action:'REMOVE'}]};
  const saved=await persistLifecycleRecoveryStream(d,{...f.options,chunkBytes:1024,readRows:async function*(){for(let offset=0;;offset++){const rows=await db.$queryRawUnsafe(`SELECT row_to_json(t)::text AS row FROM "${source}"."Document" t WHERE "storeId"='target' ORDER BY "id" OFFSET $1 LIMIT 1`,offset);if(!rows.length)return;yield rows[0].row}}});
  const bytes=await readFile(saved.artifactPath),options={...f.options,expectedSnapshotHash:saved.snapshotHash};
  await verifyLifecycleRecoveryStream(bytes,options);
  await db.$transaction(async tx=>{for await(const chunk of readLifecycleRecoveryStream(bytes,options))for(const row of chunk.rows)await tx.$executeRawUnsafe(`INSERT INTO "${restore}"."Document" SELECT * FROM json_populate_record(NULL::"${restore}"."Document",$1::json)`,row)});
  const restored=await db.$queryRawUnsafe(`SELECT row_to_json(t)::text AS row FROM "${restore}"."Document" t ORDER BY "id"`);
  assert.deepEqual(restored,before.filter(r=>!r.row.includes('"id":"sibling"')));assert.deepEqual(await read(),before);
 }finally{for(const schema of [source,restore])await db.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);await db.$disconnect();await f.close()}
});

test('row recovery digest is independent of collation order and preserves duplicate exact Unicode numeric bytes',async()=>{
 const rows=['{"id":"z","value":9007199254740993.123456789}','{"id":"Ω"}','{"id":"A"}','{"id":"Ω"}'];
 const digest=values=>digestLifecycleRows((async function*(){yield* values})());
 assert.deepEqual(await digest(rows),await digest([...rows].reverse()));
 assert.notEqual((await digest(rows)).sha256,(await digest(rows.slice(0,-1))).sha256);
 assert.notEqual((await digest(rows)).sha256,(await digest(rows.map(x=>x.replace('123456789','123456788')))).sha256);
});
