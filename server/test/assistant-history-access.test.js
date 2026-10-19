import test from 'node:test';
import assert from 'node:assert/strict';
import {createAssistantHistoryAccess} from '../src/services/assistant-history-access.js';
const req=()=>({user:{id:'actor',role:'OWNER',sessionId:'personal-session',sessionVersion:2,companyId:'company',tokenType:'BACKOFFICE_USER'},params:{storeId:'store'},body:{readScope:'selected_store'}});
function fixture(mode='owner'){
 let modules=new Set(['CASH_CONTROL','INVENTORY']),personnel=[],state={companyId:'company',generation:'9223372036854775807',maintenance:false,retired:false},scope={companyId:'company',storeId:'store'},hook=null;
 const calls=[];const db={$queryRaw:async(strings,...args)=>{calls.push([strings.join('?'),args]);assert.deepEqual(args,['company','store']);if(hook){const h=hook;hook=null;await h()}return personnel},$queryRawUnsafe:async(sql)=>{calls.push([sql,[]]);return sql.includes('current_schema')?[{schema:'isolated',fence:'f'}]:[state]}};
 const native=async(r,o)=>{calls.push(['native',o]);if(!r.user.sessionId)throw Object.assign(new Error('revoked'),{status:401});for(const m of o.requiredModules||[])if(!modules.has(m))throw Object.assign(new Error('disabled'),{code:'MODULE_DISABLED'});return scope};
 const access=createAssistantHistoryAccess({db,mode,selection:()=>({companyId:'company',storeId:'store'}),owner:native,platform:(r,p,o)=>native(r,o)});
 return {access,calls,modules:v=>modules=new Set(v),personnel:v=>personnel=v,state:v=>state={...state,...v},scope:v=>scope=v,hook:h=>hook=h};
}
test('native history access derives personal scope, exact int64 and granular module/package capabilities without DDL',async()=>{
 const f=fixture(),r=req();const a=await f.access(r);assert.equal(a.generation,'9223372036854775807');assert.equal(a.sessionId,r.user.sessionId);assert.ok(a.capabilities.includes('business_records:BANK_MOVEMENTS'));assert.ok(!a.capabilities.includes('business_records:STAFF'));
 f.modules(['INVENTORY']);const b=await f.access(r);assert.ok(b.capabilities.includes('business_records:INVOICES'));assert.ok(!b.capabilities.includes('business_records:PAYMENTS'));assert.ok(!b.capabilities.includes('cash_details'));
 f.personnel([{moduleKey:'PERSONNEL_BASIC',active:true,startsAt:null,endsAt:null}]);assert.ok((await f.access(r)).capabilities.includes('business_records:STAFF'));assert.ok(f.calls.every(([s])=>!/^CREATE|ALTER|INSERT|UPDATE|DELETE/.test(s)));
});
test('all-store/support-preview/nonpersonal Owner history fails closed before access to private records',async()=>{
 for(const delta of [{body:{readScope:'own_stores'}},{query:{readScope:'all_stores'}},{user:{...req().user,isSuperAdmin:true}},{user:{...req().user,supportContext:{storeId:'store'}}}]){const f=fixture();await assert.rejects(f.access({...req(),...delta}),e=>e.code==='ASSISTANT_HISTORY_ACCESS_DENIED');assert.equal(f.calls.length,0)}
 const f=fixture();f.scope({companyId:'company',storeId:'store',supportPreview:true});await assert.rejects(f.access(req()));
});
test('native revocation during a package wait and maintenance/retirement/cross-company fence are denied',async()=>{
 const f=fixture(),r=req();f.hook(()=>{r.user.sessionId=null});await assert.rejects(f.access(r),e=>e.status===401);
 for(const state of [{maintenance:true},{retired:true},{companyId:'foreign'}]){const g=fixture();g.state(state);await assert.rejects(g.access(req()),e=>e.status===409)}
});
test('central Platform uses its native authorizer and explicit pair, independent of Owner paid modules',async()=>{
 const f=fixture('platform'),r=req();r.user={...r.user,role:'SUPER_ADMIN',isSuperAdmin:true};f.modules([]);const a=await f.access(r);assert.equal(a.mode,'platform');assert.ok(a.capabilities.includes('business_records:STAFF'));assert.equal(f.calls.filter(([s])=>s.includes('FROM "StorePaidModule"')).length,0);
 const empty=createAssistantHistoryAccess({db:{},mode:'platform',selection:()=>null,platform:()=>assert.fail('No native call before explicit selection')});await assert.rejects(empty(r));
});
