import test from 'node:test';
import assert from 'node:assert/strict';
import {createOwnerAssistantHandlers} from '../src/services/owner-assistant-handlers.js';
import {authorizeOwnerAssistant} from '../src/services/owner-assistant-access.js';
import {authorizePlatformAssistant,createPlatformAssistantSession} from '../src/services/platform-assistant-products.js';
import {runOwnerAssistant} from '../src/services/owner-sales-tools.js';
import {cashTool} from '../src/services/assistant-cash-tools.js';
import {readAssistantReviewedCash,reviewedCashTool} from '../src/services/assistant-reviewed-cash.js';
import {createAssistantHistoryAccess} from '../src/services/assistant-history-access.js';
import {historyRequirementsFromReads} from '../src/services/assistant-history-turns.js';
import {issueAssistantExportTicket,readAssistantExportTicket} from '../src/services/assistant-export-ticket.js';
import {reconciliationText} from '../src/services/cash-reconciliation-report.js';
const period={from:'2026-10-21',to:'2026-10-21'},question='Έλεγχος ταμείων με επανυπολογισμούς από 21/10/2026 έως 21/10/2026';
function report(generation='0'){const r={storeId:'store',storeName:'Δοκιμή',generation,period,head:'b'.repeat(64),reportHash:'a'.repeat(64),coverage:'BOUNDED_CLOSED_SHIFTS',financialFinality:'REVIEWED_CASH_ROWS_ONLY',originalFinancialLedgerChanged:false,rows:[{sessionId:'a',day:period.from,shiftLabel:'Πρωινή',operatorName:'Χρυσάνθη',initialCents:-8700,remainingCents:-700,offsetCents:8000,cardCents:20000,reviewed:true,reviewedBy:'Χρήστος Μάνης',status:'REVIEWED'}],totals:{shortageCents:700,surplusCents:0,pending:0},employees:[],checkpoint:null};r.text=reconciliationText(r);return r;}
const invoke=async(fn,request)=>{let out,error,status=200;await fn(request,{status:n=>{status=n;return {json:v=>out=v}},json:v=>out=v},e=>error=e);return {out,error,status}};
function ownerFixture(){
 const f={modules:new Set(['AI_OWNER_ASSISTANT','CASH_CONTROL','STORE_CHAT','AI_READER']),overrides:{},providers:0,reads:0,onSource:null,generation:'0'};
 f.actor={id:'owner',role:'OWNER',companyId:'co',sessionVersion:1,mustChangePassword:false};
 f.req={user:{id:'owner',role:'OWNER',companyId:'co',tokenType:'BACKOFFICE_USER',sessionId:'session',sessionVersion:1},params:{storeId:'store'},headers:{authorization:'Bearer synthetic'},body:{question}};
 f.db={userSession:{findUnique:async()=>({userId:'owner',expiresAt:new Date('2030-01-01'),revokedAt:null,user:f.actor})},store:{findFirst:async({where})=>where.id==='store'&&where.companyId==='co'?{id:'store',companyId:'co',name:'Δοκιμή'}:null},$queryRaw:async(_strings,...args)=>f.overrides[args.at(-1)]?[f.overrides[args.at(-1)]]:[],$queryRawUnsafe:async sql=>sql.includes('current_schema')?[{schema:'synthetic',fence:'present'}]:[{companyId:'co',generation:f.generation,maintenance:false,retired:false}],$executeRaw:()=>assert.fail('No writer permitted')};
 f.authorize=(req,options)=>authorizeOwnerAssistant(req,{db:f.db,getState:async()=>({name:'Company',licenseAllowed:true,activeModules:[...f.modules]}),...options});
 f.read=async(req,args,scope,{signal}={})=>{f.reads++;const e=await readAssistantReviewedCash(req,args,scope,{signal,fetchImpl:async()=>({ok:true,json:async()=>report(f.generation)})});f.onSource?.();return e};
 f.handlers=createOwnerAssistantHandlers({authorize:f.authorize,requestProvider:async()=>{f.providers++;assert.fail('Reviewed cash must not ask the model to rewrite the result')},readReviewedCash:f.read,providerConfigured:()=>true});return f;
}
test('actual Owner admission and handler require all three current evidence modules; exact source is read once without any model request',async()=>{
 const f=ownerFixture(),status=await invoke(f.handlers.status,{...f.req,query:{}});assert(status.out.supported.includes('cash_review'));assert(status.out.supported.includes('cash_details'));
 const result=await invoke(f.handlers.ask,f.req);assert.equal(result.error,undefined);assert.equal(result.out.answer,report().text);assert.equal(result.out.evidence[0].scope,'OWNER_SELECTED_STORE');assert.equal(result.out.evidence[0].storeId,'store');assert.equal(f.reads,1);assert.equal(f.providers,0);
 for(const module of ['STORE_CHAT','AI_READER']){const g=ownerFixture();g.overrides[module]={active:false,startsAt:null,endsAt:null};const s=await invoke(g.handlers.status,{...g.req,query:{}});assert(!s.out.supported.includes('cash_review'));assert(s.out.supported.includes('cash_details'));const denied=await invoke(g.handlers.ask,g.req);assert.equal(denied.error.status,403);assert.equal(g.reads,0);assert.equal(g.providers,0);}
 const missing=ownerFixture();missing.req.body.question='Έλεγχος ταμείων με επανυπολογισμούς';const clarify=await invoke(missing.handlers.ask,missing.req);assert.match(clarify.out.answer,/σαφή περίοδο/);assert.equal(missing.reads,0);assert.equal(missing.providers,0);
});
test('module, role and session changes during source work withhold the answer; own-stores and support-preview never gain the new capability',async()=>{
 for(const mutate of [f=>f.modules.delete('STORE_CHAT'),f=>f.actor.role='EMPLOYEE',f=>f.actor.sessionVersion++]){const f=ownerFixture();f.onSource=()=>mutate(f);const r=await invoke(f.handlers.ask,f.req);assert.equal(r.out,undefined);assert([401,403].includes(r.error.status));assert.equal(f.reads,1);assert.equal(f.providers,0);}
 const all=ownerFixture();all.req.body.readScope='own_stores';const a=await invoke(all.handlers.ask,all.req);assert.equal(a.error.status,403);assert.equal(all.reads,0);
 const support=ownerFixture();support.actor.role='SUPER_ADMIN';Object.assign(support.req.user,{isSuperAdmin:true,platformRole:'SUPER_ADMIN',supportContext:{companyId:'co',storeId:'store'}});const s=await invoke(support.handlers.status,{...support.req,query:{}});assert(!s.out.supported.includes('cash_review'));const denied=await invoke(support.handlers.ask,support.req);assert.equal(denied.error.status,403);assert.equal(support.reads,0);
});
test('native personal history derives new capability from actual source log and immediately removes it when chat/AI entitlement is revoked',async()=>{
 const f=ownerFixture(),access=createAssistantHistoryAccess({db:f.db,mode:'owner',owner:f.authorize});const read=await access(f.req);assert(read.capabilities.includes('cash_review'));assert(read.capabilities.includes('cash_details'));f.modules.delete('AI_READER');const reduced=await access(f.req);assert(!reduced.capabilities.includes('cash_review'));assert(reduced.capabilities.includes('cash_details'));
 f.modules.add('AI_READER');const run=await runOwnerAssistant({question,tools:[reviewedCashTool],cashTool,readReviewedCash:args=>f.read(f.req,args,{companyId:'co',storeId:'store'}),requestProvider:()=>assert.fail('No provider')});assert.deepEqual(historyRequirementsFromReads(run.reads),['cash_review']);
 const signed=issueAssistantExportTicket(f.req,run.reads,run.evidence,{selection:{companyId:'co',storeId:'store'},secret:'synthetic-test-secret'});const ticket=readAssistantExportTicket(f.req,signed,{secret:'synthetic-test-secret'});assert.equal(ticket.reads[0].args.generation,'0');assert.equal(ticket.reads[0].args.head,report().head);assert.equal(ticket.reads[0].args.reportHash,report().reportHash);
});
test('actual Platform selected-store reader and signed replay use the common source; changed generation/source or lost root role refuses and all-store scope has no reviewed tool',async()=>{
 let generation='0',reads=0;const actor={id:'admin',role:'SUPER_ADMIN',sessionVersion:1,mustChangePassword:false},request={user:{id:'admin',role:'SUPER_ADMIN',isSuperAdmin:true,platformRole:'SUPER_ADMIN',sessionId:'root-session',sessionVersion:1},headers:{authorization:'Bearer synthetic'}},selection={companyId:'co',storeId:'store'};
 const db={userSession:{findUnique:async()=>({userId:'admin',expiresAt:new Date('2030-01-01'),revokedAt:null,user:actor})},store:{findFirst:async()=>({id:'store',companyId:'co',name:'Δοκιμή',company:{name:'Company'}})}};
 const options={authorize:(req,pair)=>authorizePlatformAssistant(req,pair,{db}),readReviewedCash:async(req,args,scope,opts)=>{reads++;return readAssistantReviewedCash(req,args,scope,{...opts,fetchImpl:async()=>({ok:true,json:async()=>report(generation)})})}};
 const session=await createPlatformAssistantSession(request,selection,options);assert(session.tools.some(t=>t.name==='cash_review'));const out=await session.run({question,prompt:'Synthetic',requestProvider:()=>assert.fail('No provider')});assert.equal(out.evidence[0].text,report().text);assert.equal(out.evidence[0].scope,'PLATFORM_SELECTED_STORE');assert.equal(reads,1);assert.equal((await session.replay(out.reads))[0].text,report().text);generation='1';await assert.rejects(session.replay(out.reads),e=>e.status===409);generation='0';
 const all=await createPlatformAssistantSession(request,null,{...options,allStores:true});assert(!all.tools.some(t=>t.name==='cash_review'));const before=reads;await assert.rejects(all.replay(out.reads),e=>e.status===403);assert.equal(reads,before);
 actor.role='OWNER';await assert.rejects(session.replay(out.reads),e=>e.status===401);assert.equal(reads,before);
});
test('legacy cash-only dispatch keeps its provider/read path independently of the new reviewed capability',async()=>{
 let providers=0,reads=0;const result=await runOwnerAssistant({question:'Ποια διαφορά είχε το ταμείο;',prompt:'Synthetic',cashTool,tools:[cashTool],requestProvider:async()=>++providers===1?{response:{ok:true},raw:{output:[{type:'function_call',name:'cash_details',call_id:'read',arguments:'{"date":"2026-10-21"}'}]}}:{response:{ok:true},raw:{status:'completed',output_text:'{"answer":"Legacy source","highlights":[],"limitations":""}'}},readCash:async()=>{reads++;return {rows:[]}}});assert.equal(providers,2);assert.equal(reads,1);assert.deepEqual(result.reads,[{name:'cash_details',args:{date:'2026-10-21'}}]);
});
