import test from 'node:test';
import assert from 'node:assert/strict';
import {readStoredCashPaperPreview} from '../src/services/cash-paper-stored-preview.js';
const MiB=1024*1024,byteLimit=25*MiB,maxBudget=100*MiB,scope={companyId:'c',storeId:'s',generation:'0'};
const source=(n,sizeBytes=12)=>({sourceId:'source-'+n,checksum:n.toString(16).padStart(64,'0'),sizeBytes,references:[{messageId:'message-'+n}]});
const extracted={status:'EXTRACTED_UNVERIFIED',sourceKey:'stored',extraction:{lines:[{label:'synthetic'}]}};
const limited=(sources,reason='ATTACHMENT_BYTE_LIMIT',status='AWAITING_READING')=>({discovery:{status,sources},admitted:{status:'UNAVAILABLE',reason,sources:[]}});
function fixture(sources,{states=new Map(),failures=new Set(),getFailures=new Set(),originalChange}={}){
 const calls=[],repository={
  async get(actual,key){assert.deepEqual(actual,scope);calls.push(['get',key]);if(getFailures.has(key))throw Error('unavailable');return states.get(key)||extracted;},
  async source(actual,id,key){assert.deepEqual(actual,scope);calls.push(['source',key]);if(failures.has(key))throw Error('changed');const s=sources.find(s=>s.checksum===key);const original={messageId:id,checksum:key,bytes:{length:s.sizeBytes}};return originalChange?originalChange(original):original;},
  claim(){throw Error('unexpected writer');},complete(){throw Error('unexpected writer');},read(){throw Error('unexpected provider');}
 };return {repository,calls};
}
const run=(f,input,options={})=>readStoredCashPaperPreview({repository:f.repository,scope,byteLimit,...input,...options});
test('stored small original survives unrelated aggregate admission; inputs unchanged and discovery stays LIMITED',async()=>{
 const good=source(1),large=source(2,byteLimit),sources=[large,good],input=limited(sources),before=structuredClone(input);
 const f=fixture(sources,{states:new Map([[large.checksum,{status:'NOT_READ'}]])}),out=await run(f,input);
 assert.equal(out.papers[1].reading.status,'EXTRACTED_UNVERIFIED');assert.equal(out.papers[0].reading.status,'NOT_READ');
 assert.equal(out.discovery.status,'LIMITED');assert.equal(out.discovery.complete,false);assert.deepEqual(out.discovery.sources,sources);assert.deepEqual(input,before);
 assert.deepEqual(f.calls.filter(c=>c[0]==='source'),[['source',good.checksum]]);
});
test('unknown size does not suppress unrelated stored evidence or trigger byte validation',async()=>{
 const good=source(1),unknown=source(2,null),sources=[unknown,good],f=fixture(sources);
 const out=await run(f,limited(sources,'ATTACHMENT_SIZE_UNAVAILABLE'));
 assert.equal(out.papers[0].reading.status,'REQUIRES_REVIEW');assert.equal(out.papers[1].reading.status,'EXTRACTED_UNVERIFIED');
 assert.deepEqual(f.calls.filter(c=>c[0]==='source'),[['source',good.checksum]]);
});
test('pending, unread and uncertain states never dispatch or validate originals in fallback',async()=>{
 const sources=[source(1),source(2),source(3)],statuses=['PENDING','NOT_READ','REQUIRES_REVIEW'];
 const f=fixture(sources,{states:new Map(sources.map((s,i)=>[s.checksum,{status:statuses[i],sourceKey:'key',extraction:{secret:'must not escape'}}]))});
 const out=await run(f,limited(sources));assert.deepEqual(out.papers.map(p=>p.reading.status),statuses);
 assert.equal(f.calls.filter(c=>c[0]==='source').length,0);assert.doesNotMatch(JSON.stringify(out),/secret|must not escape/);
});
test('aggregate byte budget skips an oversized remaining original but permits a later small one',async()=>{
 const sources=[source(1,7*MiB),source(2,7*MiB),source(3,7*MiB),source(4,7*MiB),source(5,MiB)],f=fixture(sources),out=await run(f,limited(sources));
 assert.deepEqual(out.papers.map(p=>p.reading.status),['EXTRACTED_UNVERIFIED','EXTRACTED_UNVERIFIED','EXTRACTED_UNVERIFIED','REQUIRES_REVIEW','EXTRACTED_UNVERIFIED']);
 assert.equal(f.calls.filter(c=>c[0]==='source').reduce((n,c)=>n+sources.find(s=>s.checksum===c[1]).sizeBytes,0),22*MiB);
});
test('failed original validation is charged once and never exposes cached extraction',async()=>{
 const sources=[1,2,3,4].map(n=>source(n,7*MiB)),f=fixture(sources,{failures:new Set([sources[0].checksum])}),out=await run(f,limited(sources));
 assert.deepEqual(out.papers.map(p=>p.reading.status),['REQUIRES_REVIEW','EXTRACTED_UNVERIFIED','EXTRACTED_UNVERIFIED','REQUIRES_REVIEW']);
 assert.equal(f.calls.filter(c=>c[0]==='source').length,3);assert.equal(out.papers[0].reading.extraction,undefined);
});
test('current original identity, checksum and byte length must agree with discovery',async()=>{
 for(const originalChange of [o=>({...o,messageId:'wrong'}),o=>({...o,checksum:'f'.repeat(64)}),o=>({...o,bytes:{length:o.bytes.length+1}}),()=>null]){
  const sources=[source(1)],f=fixture(sources,{originalChange}),out=await run(f,limited(sources));
  assert.deepEqual(out.papers[0].reading,{status:'REQUIRES_REVIEW'});
 }
});
test('invalid, unknown, unavailable and over-50 discovery cannot reopen admission',async()=>{
 for(const input of [limited(Array.from({length:51},(_,i)=>source(i+1))),limited([], 'ATTACHMENT_BYTE_LIMIT'),limited([source(1)],'OTHER_REASON'),limited([source(1)],'ATTACHMENT_BYTE_LIMIT','UNAVAILABLE'),limited([source(1)],'ATTACHMENT_BYTE_LIMIT','forged'),{discovery:{status:'AWAITING_READING',sources:null},admitted:{status:'UNAVAILABLE',sources:[],reason:'ATTACHMENT_SIZE_UNAVAILABLE'}}]){
  const f=fixture([]),out=await run(f,input);assert.deepEqual(out.papers,[]);assert.equal(out.discovery.status,'UNAVAILABLE');assert.equal(f.calls.length,0);
 }
});
test('invalid source identifiers cannot load stored content and invalid sizes cannot fetch originals',async()=>{
 const bad=[{...source(1),checksum:null},{...source(2),references:[]},{...source(3),references:[{messageId:''}]},{...source(4),sourceId:null}],f=fixture(bad);
 const out=await run(f,limited(bad));assert.equal(f.calls.length,0);assert(out.papers.every(p=>p.reading.status==='REQUIRES_REVIEW'));
 for(const size of [0,-1,1.5,NaN,Infinity,'12',7*MiB+1,Number.MAX_SAFE_INTEGER]){
  const sources=[source(5,size)],g=fixture(sources),result=await run(g,limited(sources));assert.equal(result.papers[0].reading.status,'REQUIRES_REVIEW');assert.equal(g.calls.filter(c=>c[0]==='source').length,0);
 }
});
test('admitted path preserves validation-before-get, original order and unresolved shape',async()=>{
 const sources=[source(1),source(2),source(3)],discovery={status:'AWAITING_READING',sources},f=fixture(sources,{failures:new Set([sources[1].checksum])}),out=await run(f,{discovery,admitted:discovery});
 assert.equal(out.discovery,discovery);assert.deepEqual(out.papers.map(p=>p.reading),[extracted,{status:'REQUIRES_REVIEW'},extracted]);
 assert.deepEqual(f.calls,[['source',sources[0].checksum],['get',sources[0].checksum],['source',sources[1].checksum],['source',sources[2].checksum],['get',sources[2].checksum]]);
});
test('admitted get failure and fallback get failure remain unresolved without leaked content',async()=>{
 const sources=[source(1)],f=fixture(sources,{getFailures:new Set([sources[0].checksum])});
 assert.equal((await run(f,limited(sources))).papers[0].reading.status,'REQUIRES_REVIEW');assert.equal(f.calls.filter(c=>c[0]==='source').length,0);
 const discovery={status:'AWAITING_READING',sources};assert.equal((await run(f,{discovery,admitted:discovery})).papers[0].reading.status,'REQUIRES_REVIEW');
});
test('empty admitted discovery performs no query',async()=>{
 const f=fixture([]),discovery={status:'NO_ATTACHMENTS_IN_DISCOVERY',sources:[]},out=await run(f,{discovery,admitted:discovery});assert.deepEqual(out,{discovery,papers:[]});assert.equal(f.calls.length,0);
});
test('budget cannot be omitted, coerced, nonfinite or increased',async()=>{
 const f=fixture([]);for(const budget of [undefined,null,0,-1,NaN,Infinity,1.5,'100',maxBudget+1])await assert.rejects(run(f,limited([]),{byteLimit:budget}),TypeError);assert.equal(f.calls.length,0);
});

test('100 MiB stored-paper budget validates 37 originals sequentially without paid reader or writes',async()=>{
 const sources=Array.from({length:37},(_,i)=>source(i+1,i===36?5*MiB:2*MiB));
 const f=fixture(sources),discovery={status:'AWAITING_READING',sources};
 const result=await run(f,{discovery,admitted:discovery},{byteLimit:maxBudget});
 assert.equal(result.discovery.status,'AWAITING_READING');
 assert.equal(result.papers.length,37);
 assert(result.papers.every(p=>p.reading.status==='EXTRACTED_UNVERIFIED'));
 assert.equal(f.calls.filter(call=>call[0]==='source').length,37);
 assert.equal(f.calls.filter(call=>call[0]==='get').length,37);
 assert.equal(f.calls.length,74,'one original validation and cached read per file, no provider invocation');
});
test('100 MiB fallback still caps a single original at 7 MiB and reports LIMITED',async()=>{
 const sources=[source(1,8*MiB),source(2,6*MiB)],f=fixture(sources);
 const result=await run(f,limited(sources),{byteLimit:maxBudget});
 assert.equal(result.discovery.status,'LIMITED');
 assert.equal(result.discovery.complete,false);
 assert.deepEqual(result.papers.map(p=>p.reading.status),['REQUIRES_REVIEW','EXTRACTED_UNVERIFIED']);
 assert.deepEqual(f.calls.filter(c=>c[0]==='source'),[['source',sources[1].checksum]]);
});
