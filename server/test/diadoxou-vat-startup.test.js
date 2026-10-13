import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

// Execute the actual entrypoint with an isolated transaction adapter. No live DB access.
const source=fs.readFileSync(new URL('../scripts/repair-diadoxou-vat.js',import.meta.url),'utf8').replace(/^import .*;\n/gm,'');
const execute=new Function('return Object.getPrototypeOf(async function(){}).constructor')();
const script=new execute('prisma','console',source);
const canonical=[{id:'t',description:'1.ΚΑΠΝΙΚΑ',vatRate:0,cashRegisterDepartment:1,legacyVatCode:'12'},{id:'s',description:'ΕΙΔΗ 24',vatRate:24}];
async function run({departments=canonical,state={total:567,tobacco:567,other:0},moved=20}={}){
 let disconnected=0;const committed=[],attempted=[];
 const prisma={$disconnect:async()=>{disconnected++},$transaction:async fn=>{
  const pending=[];
  const result=await fn({$queryRaw:async(strings,...values)=>{
   assert.equal(values[0],'cmulmjjoa000oqlbfyi0h53ju');
   return strings.join('?').includes('COUNT(*)')?[state]:departments;
  },$executeRaw:async(strings,...values)=>{const row={sql:strings.join('?'),values};pending.push(row);attempted.push(row);return row.sql.includes('UPDATE "Product"')?moved:1}});
  committed.push(...pending);return result;
 }};
 let error;try{await script(prisma,{log(){}})}catch(e){error=e}
 return {error,committed,attempted,disconnected};
}
test('already repaired tobacco mapping tolerates current catalogue membership without any write',async()=>{
 for(const total of [0,1,565,567,1200]){const r=await run({state:{total,tobacco:total,other:0}});assert.equal(r.error,undefined);assert.deepEqual(r.committed,[]);assert.deepEqual(r.attempted,[]);assert.equal(r.disconnected,1)}
});
test('absent company is a no-op; missing/changed standard department remains rejected',async()=>{
 assert.deepEqual((await run({departments:[]})).committed,[]);
 for(const departments of [[canonical[0]],[{...canonical[0]}, {...canonical[1],vatRate:13}]]){const r=await run({departments});assert.match(r.error.message,/missing or changed/);assert.deepEqual(r.attempted,[]);assert.equal(r.disconnected,1)}
});
test('mixed products and wrong tobacco rate/register/code fail closed with zero writes',async()=>{
 for(const state of [{total:567,tobacco:566,other:0},{total:567,tobacco:566,other:1}]){const r=await run({state});assert.match(r.error.message,/unexpected data/);assert.deepEqual(r.attempted,[])}
 for(const change of [{vatRate:24},{cashRegisterDepartment:null},{cashRegisterDepartment:2},{legacyVatCode:null},{legacyVatCode:'42'}]){const r=await run({departments:[{...canonical[0],...change},canonical[1]]});assert.match(r.error.message,/unexpected data/);assert.deepEqual(r.attempted,[])}
});
test('only exact historical 585/565/20 state performs original scoped repair; mismatched write count rolls back',async()=>{
 const departments=[{...canonical[0],vatRate:24,cashRegisterDepartment:null,legacyVatCode:null},canonical[1]],state={total:585,tobacco:565,other:20};
 const r=await run({departments,state});assert.equal(r.error,undefined);assert.equal(r.committed.length,2);assert.match(r.committed[0].sql,/p\."companyId"/);assert.match(r.committed[0].sql,/c\."name" <> 'ΚΑΠΝΙΚΑ' AND p\."vatRate"=24/);assert.deepEqual(r.committed[0].values,['s','cmulmjjoa000oqlbfyi0h53ju','t']);assert.deepEqual(r.committed[1].values,['t']);assert.equal(r.disconnected,1);
 const failed=await run({departments,state,moved:19});assert.match(failed.error.message,/moved 19, expected 20/);assert.deepEqual(failed.committed,[]);assert.equal(failed.disconnected,1);
 const unexpected=await run({departments,state:{total:586,tobacco:566,other:20}});assert.match(unexpected.error.message,/unexpected data/);assert.deepEqual(unexpected.attempted,[]);
});
