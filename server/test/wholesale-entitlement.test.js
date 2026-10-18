import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import {moduleCatalog,planDefaults} from '../src/services/module-catalog.js';
import {WHOLESALE_MODULE,wholesaleEntitlementSql,getWholesaleEntitlement,assertWholesaleEntitlement,createWholesaleEntitlementGuard} from '../src/lib/wholesale-entitlement.js';
import {createWholesaleCapabilitiesRouter} from '../src/routes/wholesale-capabilities.js';

function fixture(){
  const state={eligible:true,row:{companyId:'company-a',subscriptionStartsAt:null,subscriptionEndsAt:null,moduleStartsAt:null,moduleEndsAt:null},now:new Date('2026-10-18T12:00:00Z'),calls:[]};
  const db={$queryRaw:async(first,...rest)=>{
    const sql=Array.isArray(first)?first.join('?'):first.sql,values=Array.isArray(first)?rest:first.values;state.calls.push({sql,values});
    if(sql.includes('FROM "Company"'))return state.eligible?[{...state.row}]:[];
    if(sql.includes('clock_timestamp() AS "now"'))return [{now:state.now}];
    throw Error('Unexpected read');
  },$executeRaw:()=>{throw Error('Capabilities must not mutate')},$executeRawUnsafe:()=>{throw Error('Capabilities must not bootstrap schema')}};return {db,state};
}

test('single separately activated wholesale catalog entry is absent from every default plan',()=>{
  assert.equal(WHOLESALE_MODULE,'WHOLESALE_B2B');const entries=moduleCatalog.filter(module=>module.key===WHOLESALE_MODULE);assert.equal(entries.length,1);assert.equal(entries[0].name,'Χονδρική B2B');assert.equal(entries[0].commercialReady,true);assert.equal(entries[0].monthlyPriceEur,undefined,'no unapproved commercial price is invented');
  for(const modules of Object.values(planDefaults))assert.equal(modules.includes(WHOLESALE_MODULE),false);
});

test('SQL requires explicit paid activation, ACTIVE company license and all four current date bounds',()=>{
  const sql=wholesaleEntitlementSql.sql;
  for(const predicate of ['co."active"=true',"co.\"licenseStatus\"='ACTIVE'",'co."subscriptionStartsAt"<=clock_timestamp()','co."subscriptionEndsAt">=clock_timestamp()',"cm.\"moduleKey\"='WHOLESALE_B2B'",'cm."active"=true','cm."startsAt"<=clock_timestamp()','cm."endsAt">=clock_timestamp()'])assert.ok(sql.includes(predicate),predicate);
  assert.equal(sql.includes('monthlyPrice'),false,'a price is not a payment-receipt assertion');assert.equal(sql.includes('TRIAL'),false);assert.equal(sql.includes('PILOT'),false);assert.equal(sql.includes('SUPER_ADMIN'),false);
});

test('read-only entitlement returns earliest expiry and binds company IDs without interpolation',async()=>{
  const {db,state}=fixture();state.row.subscriptionEndsAt=new Date('2026-11-18T12:00:00Z');state.row.moduleEndsAt=new Date('2026-10-19T12:00:00Z');
  assert.deepEqual(await getWholesaleEntitlement(db,'company-a',{lock:true}),{companyId:'company-a',moduleKey:WHOLESALE_MODULE,enabled:true,expiresAt:'2026-10-19T12:00:00.000Z'});
  assert.deepEqual(state.calls[0].values,['company-a']);assert.ok(state.calls[0].sql.includes('FOR SHARE'));assert.equal(state.calls.length,2);
  const hostile="company-a' OR true --";await getWholesaleEntitlement(db,hostile);const query=state.calls.at(-2);assert.deepEqual(query.values,[hostile]);assert.equal(query.sql.includes(hostile),false);
});

test('missing grant is disabled and actual database clock after waiting rechecks both starts and ends',async()=>{
  const missing=fixture();missing.state.eligible=false;assert.deepEqual(await getWholesaleEntitlement(missing.db,'company-a'),{companyId:'company-a',moduleKey:WHOLESALE_MODULE,enabled:false,expiresAt:null});assert.equal(missing.state.calls.length,1);
  await assert.rejects(()=>assertWholesaleEntitlement(missing.db,'company-a'),error=>error.status===403&&error.code==='WHOLESALE_MODULE_DISABLED'&&error.moduleKey===WHOLESALE_MODULE);
  for(const field of ['subscriptionStartsAt','moduleStartsAt']){const {db,state}=fixture();state.row[field]=new Date('2026-10-18T12:00:01Z');assert.equal((await getWholesaleEntitlement(db,'company-a',{lock:true})).enabled,false)}
  for(const field of ['subscriptionEndsAt','moduleEndsAt']){const {db,state}=fixture();state.row[field]=new Date('2026-10-18T11:59:59Z');assert.equal((await getWholesaleEntitlement(db,'company-a',{lock:true})).enabled,false)}
  const malformed=fixture();malformed.state.row.moduleEndsAt='not-a-date';assert.equal((await getWholesaleEntitlement(malformed.db,'company-a')).enabled,false);
});

test('invalid company context cannot query or infer an entitlement',async()=>{
  for(const companyId of [undefined,null,'',' company-a ',{},'x'.repeat(201)]){const {db,state}=fixture();await assert.rejects(()=>getWholesaleEntitlement(db,companyId),error=>error.status===401);assert.equal(state.calls.length,0)}
});

async function http(db,{user={id:'user-a',companyId:'company-a',sessionId:'session-a',tokenType:'BACKOFFICE_USER',role:'OWNER'}}={}){
  const app=express();app.use((req,res,next)=>{req.user=user;next()});app.use('/capabilities',createWholesaleCapabilitiesRouter({db}));app.use('/protected',createWholesaleEntitlementGuard({db}),(req,res)=>res.json({ok:true}));app.use((error,req,res,next)=>res.status(500).json({error:'unavailable'}));
  const server=await new Promise(resolve=>{const s=app.listen(0,'127.0.0.1',()=>resolve(s))}),base=`http://127.0.0.1:${server.address().port}`;
  return {async get(path){const response=await fetch(base+path);return {status:response.status,body:await response.json(),headers:response.headers}},close:()=>new Promise(resolve=>{server.close(resolve);server.closeIdleConnections()})};
}

test('registered capabilities returns disabled200 before grant, enabled200 afterwards, with no-store and no schema access',async()=>{
  const {db,state}=fixture();state.eligible=false;const api=await http(db);
  try{
    const disabled=await api.get('/capabilities');assert.equal(disabled.status,200);assert.equal(disabled.body.enabled,false);assert.equal(disabled.headers.get('cache-control'),'no-store');assert.equal((await api.get('/protected')).status,403);
    state.eligible=true;const enabled=await api.get('/capabilities');assert.equal(enabled.status,200);assert.equal(enabled.body.enabled,true);assert.equal(enabled.body.companyId,'company-a');assert.equal((await api.get('/protected')).status,200);
    assert.equal((await api.get('/capabilities?companyId=foreign')).status,400);
  }finally{await api.close()}
});

test('registered guard never grants Super Admin a missing paid module',async()=>{
  const {db,state}=fixture();state.eligible=false;const api=await http(db,{user:{id:'platform-admin',companyId:'company-a',sessionId:'real-session',tokenType:'BACKOFFICE_USER',role:'SUPER_ADMIN',isSuperAdmin:true}});
  try{assert.equal((await api.get('/capabilities')).body.enabled,false);const denied=await api.get('/protected');assert.equal(denied.status,403);assert.equal(denied.body.moduleKey,WHOLESALE_MODULE)}finally{await api.close()}
});

test('registered capabilities rejects public/operator/sessionless identities before database reads',async()=>{
  for(const patch of [null,{tokenType:'STORE_OPERATOR'},{tokenType:'B2B_CUSTOMER'},{sessionId:undefined},{id:undefined}]){
    const {db,state}=fixture(),user=patch===null?null:{id:'user-a',companyId:'company-a',sessionId:'session-a',tokenType:'BACKOFFICE_USER',...patch},api=await http(db,{user});
    try{assert.equal((await api.get('/capabilities')).status,401);assert.equal(state.calls.length,0)}finally{await api.close()}
  }
});
