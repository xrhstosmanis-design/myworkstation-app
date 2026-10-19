import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {createAssistantHistoryTurns,historyRequirementsFromReads} from '../src/services/assistant-history-turns.js';
import {emptyHistoryArchive} from '../src/services/assistant-history-contract.js';
const metadata=()=>({generation:'9007199254740993',threadId:randomUUID(),requestId:randomUUID(),expectedRevision:0});
const read={name:'business_records',args:{domain:'PAYMENTS',from:'2026-10-01',to:'2026-10-02',query:null,status:null}};
function fixture(){
 let current={userId:'actor',mode:'owner',companyId:'company',storeId:'store',generation:'9007199254740993',sessionId:'s',sessionVersion:1,capabilities:['business_records:PAYMENTS']},snapshot={revision:0,archive:emptyHistoryArchive(),expired:false},fail=null;const saves=[];
 const service=createAssistantHistoryTurns({db:{},authorize:async()=>structuredClone(current),now:()=>new Date('2026-10-19T12:00:00Z'),repository:({authorize})=>({read:async req=>{await authorize(req);return structuredClone(snapshot)},save:async(req,input)=>{await authorize(req);if(fail)throw fail;saves.push(input);return {revision:1,expiresAt:'2026-11-18T12:00:00.000Z'}},reset:async(req,input)=>{await authorize(req);saves.push(input);return {revision:2,archive:input.archive}}})});
 return {service,saves,principal:v=>current={...current,...v},snapshot:v=>snapshot=v,fail:e=>fail=e};
}
test('turn capture derives stored question, checked server prose and granular requirements from actual validated reads',async()=>{
 const f=fixture(),m=metadata(),turn=await f.service.begin({},m,'Πληρωμές χθες');assert.deepEqual(turn.history,[]);
 const result=await turn.finish({answer:'Ελεγμένη απάντηση',highlights:['Ένδειξη'],limitations:'Όριο',exportTicket:'NEVER STORE',evidence:[{secret:'NEVER STORE'}]},[read]);assert.equal(result.saved,true);
 const payload=f.saves[0].archive.threads[0];assert.equal(payload.id,m.threadId);assert.equal(payload.messages[0].content,'Πληρωμές χθες');assert.equal(payload.messages[1].content,'Ελεγμένη απάντηση\nΈνδειξη\nΌριο');assert.deepEqual(payload.messages[1].requiredCapabilities,['business_records:PAYMENTS']);assert.ok(!JSON.stringify(payload).includes('NEVER STORE'));await assert.rejects(turn.finish({answer:'Again'},[]));
});
test('client assistant text/authority is not accepted and stale revisions stop before a report can start',async()=>{
 const f=fixture();await assert.rejects(f.service.begin({},{...metadata(),answer:'FORGED'},'Πληρωμές'));const m=metadata();f.snapshot({revision:1,archive:emptyHistoryArchive(),expired:false});await assert.rejects(f.service.begin({},m,'Πληρωμές'),e=>e.code==='ASSISTANT_HISTORY_CONFLICT');assert.equal(f.saves.length,0);
});
test('fresh server archive supplies dialogue context; old client context is never an archive source',async()=>{
 const f=fixture(),m=metadata();f.snapshot({revision:0,expired:false,archive:{schemaVersion:1,threads:[{id:m.threadId,title:'Earlier',messages:[{id:randomUUID(),role:'user',content:'Πληρωμές 1/10/2026',createdAt:'2026-10-19T12:00:00.000Z',requiredCapabilities:[]}]}]}});assert.deepEqual((await f.service.begin({},m,'Και χθες;')).history,[{role:'user',content:'Πληρωμές 1/10/2026'}]);
 const older=fixture();older.snapshot({revision:0,expired:false,archive:{schemaVersion:1,threads:[{id:m.threadId,title:'Earlier',messages:[{id:randomUUID(),role:'user',content:'Πληρωμές χθες',createdAt:'2026-10-18T12:00:00.000Z',requiredCapabilities:[]}]}]}});assert.deepEqual((await older.service.begin({},m,'Βγάλτο σε CSV')).history,[],'A previous Athens day cannot silently rebase a relative period');
});
test('generation/session/capability change during report work withholds capture; conflicts never repeat report work',async()=>{
 for(const change of [{generation:'9007199254740992'},{sessionId:'other'},{capabilities:[]}]){const f=fixture(),turn=await f.service.begin({},metadata(),'Πληρωμές');f.principal(change);await assert.rejects(turn.finish({answer:'Private'},[read]),e=>e.code==='ASSISTANT_HISTORY_CONTEXT_CHANGED');assert.equal(f.saves.length,0)}
 const f=fixture(),turn=await f.service.begin({},metadata(),'Πληρωμές');f.fail(Object.assign(new Error('conflict'),{code:'ASSISTANT_HISTORY_CONFLICT'}));assert.deepEqual(await turn.finish({answer:'Private'},[read]),{saved:false,reason:'CONFLICT'});
});
test('oversized prose is explicitly not saved, expired archive denied and reset accepts only empty server payload',async()=>{
 const f=fixture(),turn=await f.service.begin({},metadata(),'Πληρωμές');assert.deepEqual(await turn.finish({answer:'a'.repeat(2001)},[read]),{saved:false,reason:'TEXT_LIMIT'});assert.equal(f.saves.length,0);
 f.snapshot({revision:1,archive:emptyHistoryArchive(),expired:true});await assert.rejects(f.service.begin({},metadata(),'Πληρωμές'),e=>e.status===410);
 const m=metadata();await f.service.reset({},{generation:m.generation,requestId:m.requestId,expectedRevision:1});assert.deepEqual(f.saves[0].archive,emptyHistoryArchive());await assert.rejects(f.service.reset({},{generation:m.generation,requestId:m.requestId,expectedRevision:1,archive:{forged:true}}));
});
test('actual read log rejects unknown tools, malformed arguments and non-array authority',()=>{
 assert.throws(()=>historyRequirementsFromReads({name:'cash_details'}));assert.throws(()=>historyRequirementsFromReads([{name:'run_sql',args:{query:'SELECT'}}]));assert.throws(()=>historyRequirementsFromReads([{name:'business_records',args:{domain:'UNKNOWN'}}]));assert.deepEqual(historyRequirementsFromReads([read,read]),['business_records:PAYMENTS']);
});

test('old exact lifecycle generation is refused before history storage or a report can start',async()=>{const f=fixture();await assert.rejects(f.service.begin({},{...metadata(),generation:'9007199254740992'},'Πληρωμές'),e=>e.code==='STORE_LIFECYCLE_STALE_GENERATION');assert.equal(f.saves.length,0)});

test('history records the canonical product text actually shown by the UI, never unshown model amounts or highlights',async()=>{
 const f=fixture();f.principal({capabilities:['stock_by_product']});const turn=await f.service.begin({},metadata(),'Απόθεμα ΝΕΡΟ');
 await turn.finish({answer:'UNSHOWN MODEL AMOUNT 999',highlights:['UNSHOWN HIGHLIGHT 999'],limitations:'Όριο πηγής',evidence:[{kind:'product_stock',result:'matched',truncated:false,companyId:'company',storeId:'store',companyName:'Company',storeName:'Store',rows:[{productId:'p',name:'ΝΕΡΟ',sku:'2269',currentStock:12.5,unit:'KG'}]}]},[{name:'stock_by_product',args:{product:'ΝΕΡΟ'}}]);
 const message=f.saves[0].archive.threads[0].messages[1];assert.doesNotMatch(message.content,/UNSHOWN|999/);assert.match(message.content,/12,5 κιλά/);assert.match(message.content,/Όριο πηγής/);assert.deepEqual(message.requiredCapabilities,['stock_by_product']);
});

test('a canceled or disconnected turn cannot archive a late checked answer',async()=>{for(const field of ['request','response']){const f=fixture(),req={res:{destroyed:false}},turn=await f.service.begin(req,metadata(),'Πληρωμές');if(field==='request')req.aborted=true;else req.res.destroyed=true;await assert.rejects(turn.finish({answer:'LATE CANCELED ANSWER'},[read]),e=>e.code==='ASSISTANT_HISTORY_CANCELLED');assert.equal(f.saves.length,0)}});
