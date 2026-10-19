import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {parseHistoryArchive,historyAccessSchema,historyScopeKey,historyAccessKey,assertHistoryCapabilities,HISTORY_MAX_BYTES} from '../src/services/assistant-history-contract.js';
const access=()=>({userId:'owner',mode:'owner',companyId:'company',storeId:'store',generation:'2',sessionId:'session',sessionVersion:3,capabilities:['cash_details','business_records:PAYMENTS']});
const archive=()=>({schemaVersion:1,threads:[{id:randomUUID(),title:'Ιστορική αναφορά',messages:[{id:randomUUID(),role:'user',content:'Ταμεία χθες',createdAt:'2026-10-19T12:00:00+03:00',requiredCapabilities:[]},{id:randomUUID(),role:'assistant',content:'Η καταγεγραμμένη απάντηση.',createdAt:'2026-10-19T12:00:01+03:00',requiredCapabilities:['cash_details']}]}]});
test('history normalizes timestamps and requirements while preserving literal Greek historical text',()=>{
 const a=archive(),out=parseHistoryArchive(a);assert.equal(out.threads[0].messages[0].createdAt,'2026-10-19T09:00:00.000Z');assert.equal(out.threads[0].messages[1].content,a.threads[0].messages[1].content);
 assertHistoryCapabilities(out,access());assert.throws(()=>assertHistoryCapabilities(out,{...access(),capabilities:[]}),e=>e.status===403);
});
test('strict archive has no credential, ticket, evidence, bytes, attachment or client authority fields at any level',()=>{
 for(const key of ['token','exportTicket','base64','evidence','attachments','userId','companyId','role','provider'])for(const level of ['archive','thread','message']){
  const a=archive(),target=level==='archive'?a:level==='thread'?a.threads[0]:a.threads[0].messages[0];target[key]='PRIVATE';assert.throws(()=>parseHistoryArchive(a),`${level}:${key}`);
 }
});
test('archive identity, role, ordering, count, text and UTF8 byte bounds refuse invalid input rather than truncate',()=>{
 for(const mutate of [a=>a.schemaVersion=2,a=>a.threads[0].messages[0].role='system',a=>a.threads[0].messages[0].content='x'.repeat(601),a=>a.threads[0].messages[1].content='x'.repeat(2001),a=>a.threads[0].messages[1].createdAt='2026-10-18T00:00:00Z',a=>a.threads[0].messages.push(a.threads[0].messages[0]),a=>a.threads.push(a.threads[0]),a=>a.threads[0].messages[0].requiredCapabilities=['cash_details'],a=>a.threads[0].messages[1].requiredCapabilities=['arbitrary_sql'],a=>a.threads=Array.from({length:9},()=>({...archive().threads[0]})),a=>a.threads[0].messages=Array.from({length:41},()=>({...archive().threads[0].messages[0]}))]){const a=archive();mutate(a);assert.throws(()=>parseHistoryArchive(a));}
 const a={schemaVersion:1,threads:Array.from({length:8},()=>({id:randomUUID(),title:'Αναφορά',messages:Array.from({length:40},(_,i)=>({id:randomUUID(),role:'assistant',content:'Ω'.repeat(2000),createdAt:'2026-10-19T00:00:00Z',requiredCapabilities:[]}))}))};
 assert.ok(Buffer.byteLength(JSON.stringify(a))>HISTORY_MAX_BYTES);assert.throws(()=>parseHistoryArchive(a),e=>e.status===413);
});
test('durable scope is independent of login but actor, mode, company, store and lifecycle remain exact',()=>{
 const a=access();assert.equal(historyScopeKey(a),historyScopeKey({...a,sessionId:'new',sessionVersion:4}));assert.notEqual(historyAccessKey(a),historyAccessKey({...a,sessionId:'new'}));
 for(const delta of [{userId:'other'},{mode:'platform'},{companyId:'other'},{storeId:'other'},{generation:'3'}])assert.notEqual(historyScopeKey(a),historyScopeKey({...a,...delta}));
 for(const delta of [{storeId:''},{generation:-1},{generation:0.5},{generation:Number.MAX_SAFE_INTEGER},{mode:'all_stores'},{sessionId:''},{supportPreview:true}])assert.throws(()=>historyAccessSchema.parse({...a,...delta}));
 assert.equal(historyAccessKey(a),historyAccessKey({...a,capabilities:['business_records:PAYMENTS','cash_details','cash_details']}));
});
test('history consumes the actual exact lifecycle int64 protocol without numeric coercion or adjacent epoch collisions',async()=>{
 const {normalizeLifecycleGeneration}=await import('../src/services/store-lifecycle-generation.js');
 for(const generation of ['0','1','2','9007199254740991','9007199254740992','9007199254740993','9223372036854775807']){
  const a={...access(),generation};assert.equal(historyAccessSchema.parse(a).generation,normalizeLifecycleGeneration(generation));assert.equal(JSON.parse(historyScopeKey(a)).at(-1),generation);
 }
 const lower={...access(),generation:'9007199254740992'},upper={...access(),generation:'9007199254740993'};
 assert.notEqual(historyScopeKey(lower),historyScopeKey(upper));assert.notEqual(historyAccessKey(lower),historyAccessKey(upper));
 for(const generation of [undefined,null,0,2,9007199254740992,2n,'','00','02',' 2','2 ','+2','-1','1.0','1e2','9223372036854775808','99999999999999999999'])assert.throws(()=>historyAccessSchema.parse({...access(),generation}),String(generation));
});
