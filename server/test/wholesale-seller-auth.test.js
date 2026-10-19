import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import {authenticateWholesaleSeller,authenticateWholesaleSellerManager} from '../src/lib/wholesale-seller-auth.js';
import {authorizeWholesalePrincipal,assertWholesalePrincipal} from '../src/lib/wholesale-principal.js';
import {createWholesaleSellerAdminRouter} from '../src/routes/wholesale-seller-admin.js';
const actor={id:'seller-a',companyId:'company-a',sessionId:'session-a',sessionVersion:1,role:'EMPLOYEE',tokenType:'BACKOFFICE_USER'};
const scope={customerId:'customer-a',storeId:'store-a',items:[{productId:'product-a',quantity:'1.0000'}]};
function fixture(){
  const state={role:'EMPLOYEE',userCompanyId:'company-a',live:true,enabled:true,assigned:true,now:new Date('2026-10-18T12:00:00Z'),expiresAt:new Date('2026-10-18T20:00:00Z'),member:null,assignment:null,audits:[],calls:[],failAudit:false};
  const db={async $queryRaw(first,...rest){
    const sql=Array.isArray(first)?first.join('?'):first.sql,values=Array.isArray(first)?rest:first.values;state.calls.push({sql,values});
    if(sql.includes('clock_timestamp() AS "now"'))return [{now:state.now}];
    if(sql.includes('FROM "UserSession"')){
      if(!state.live||(sql.includes('JOIN "WholesaleSellerMembership"')&&!state.enabled))return [];
      return [{id:'seller-a',userCompanyId:state.userCompanyId,role:state.role,fullName:'Current user',sessionVersion:1,sessionId:'session-a',expiresAt:state.expiresAt,subscriptionStartsAt:state.subscriptionStartsAt,subscriptionEndsAt:state.subscriptionEndsAt,moduleStartsAt:state.moduleStartsAt,moduleEndsAt:state.moduleEndsAt}];
    }
    if(sql.includes('pg_advisory_xact_lock'))return [{locked:''}];
    if(sql.includes('FROM "User" WHERE'))return values[0]==='seller-a'&&values[1]==='company-a'?[{id:'seller-a'}]:[];
    if(sql.includes('FROM "Store" WHERE'))return values[0]==='store-a'?[{id:'store-a'}]:[];
    if(sql.includes('FROM "WholesaleCustomer" WHERE'))return values[0]==='customer-a'?[{id:'customer-a',active:true}]:[];
    if(sql.includes('FROM "WholesaleSellerAssignment" a JOIN'))return state.assigned?[{id:'assignment-a'}]:[];
    if(sql.startsWith('SELECT * FROM "WholesaleSellerMembership"'))return state.member?[{...state.member}]:[];
    if(sql.startsWith('SELECT "id","active" FROM "WholesaleSellerMembership"'))return state.member?[{...state.member}]:[];
    if(sql.startsWith('INSERT INTO "WholesaleSellerMembership"')){state.member={id:values[0],companyId:values[1],userId:values[2],active:values[3],revision:1};return [{...state.member}]}
    if(sql.startsWith('UPDATE "WholesaleSellerMembership"')){state.member={...state.member,active:values[0],revision:state.member.revision+1};return [{...state.member}]}
    if(sql.startsWith('SELECT * FROM "WholesaleSellerAssignment"'))return state.assignment?[{...state.assignment}]:[];
    if(sql.startsWith('INSERT INTO "WholesaleSellerAssignment"')){state.assignment={id:values[0],companyId:values[1],userId:values[2],customerId:values[3],storeId:values[4],active:values[5],revision:1};return [{...state.assignment}]}
    if(sql.startsWith('UPDATE "WholesaleSellerAssignment"')){state.assignment={...state.assignment,active:values[0],revision:state.assignment.revision+1};return [{...state.assignment}]}
    throw Error('Unexpected SQL '+sql);
  },async $executeRaw(first,...values){const sql=first.join('?');state.calls.push({sql,values});if(!sql.includes('INSERT INTO "WholesaleSellerAudit"'))throw Error('Unexpected mutation');if(state.failAudit)throw Error('Injected audit failure');state.audits.push({kind:values[4],before:values[5],after:values[6]});return 1},
    async $transaction(fn){const before={member:structuredClone(state.member),assignment:structuredClone(state.assignment),audits:structuredClone(state.audits)};try{return await fn(db)}catch(error){Object.assign(state,before);throw error}}
  };return {db,state};
}

test('seller identity uses live personal session and immutable branded channel, not manager-shaped JWT claims',async()=>{
  const {db,state}=fixture(),ctx=await authenticateWholesaleSeller(db,actor);
  assert.equal(ctx.actorId,'seller:seller-a');assert.equal(ctx.channel,'FIELD_SALES');assert.equal(ctx.tokenType,'WHOLESALE_SELLER');assert.throws(()=>assertWholesalePrincipal({...ctx}),error=>error.status===403);
  await authorizeWholesalePrincipal(db,ctx,scope,{lock:true});
  const auth=state.calls.find(call=>call.sql.includes('FROM "UserSession"'));
  for(const predicate of ['u."id"=s."userId"','s."revokedAt" IS NULL','u."mustChangePassword"=false','u."sessionVersion"=',"cm.\"moduleKey\"='WHOLESALE_B2B'"] )assert.ok(auth.sql.includes(predicate),predicate);assert.ok(auth.sql.includes("co.\"licenseStatus\"='ACTIVE'"));assert.ok(auth.sql.includes('co.\"subscriptionStartsAt\"'));
  assert.equal(auth.sql.includes('s."sessionVersion"'),false,'only User holds a session version');
  assert.equal(auth.sql.includes('u."active"'),false,'User has no active column');
  assert.ok(state.calls.some(call=>call.sql.includes('FROM "WholesaleSellerAssignment"')&&call.sql.includes('FOR SHARE')));
  state.enabled=false;await assert.rejects(()=>authorizeWholesalePrincipal(db,ctx,scope,{lock:true}),error=>error.status===403&&error.code==='SELLER_MEMBERSHIP_REQUIRED');
});

test('a valid nonmember is forbidden without invalidating personal authentication; invalid sessions still require authentication',async()=>{
  for(const role of ['EMPLOYEE','OWNER']){
    const {db,state}=fixture();state.role=role;state.enabled=false;
    await assert.rejects(()=>authenticateWholesaleSeller(db,{...actor,role}),error=>error.status===403&&error.code==='SELLER_MEMBERSHIP_REQUIRED');
    assert.equal(state.calls.some(call=>!call.sql.includes('JOIN "WholesaleSellerMembership"')&&call.sql.includes('FROM "UserSession"')),true,'denial classification must independently validate the live personal identity and paid entitlement');
    for(const invalid of [{live:false},{userCompanyId:'foreign'},{role:'ADMIN'},{expiresAt:new Date('2026-10-18T11:59:59Z')},{moduleEndsAt:new Date('2026-10-18T11:59:59Z')}]){
      const bad=fixture();Object.assign(bad.state,{role,enabled:false},invalid);
      await assert.rejects(()=>authenticateWholesaleSeller(bad.db,{...actor,role}),error=>error.status===401&&error.code==='SELLER_AUTH_REQUIRED');
    }
  }
});

test('missing session, wrong token, current role mismatch, support scope and foreign user company fail closed',async()=>{
  for(const patch of [{sessionId:''},{sessionVersion:undefined},{tokenType:'STORE_OPERATOR'},{tokenType:'B2B_CUSTOMER'},{role:'OWNER'},{supportContext:true}])await assert.rejects(()=>authenticateWholesaleSeller(fixture().db,{...actor,...patch}),error=>error.status===401);
  const foreign=fixture();foreign.state.userCompanyId='company-b';await assert.rejects(()=>authenticateWholesaleSeller(foreign.db,actor),error=>error.status===401);
  const revoked=fixture();revoked.state.live=false;await assert.rejects(()=>authenticateWholesaleSeller(revoked.db,actor),error=>error.status===401);
});

test('store-only and full assignment checks are bound and rechecked after lock wait',async()=>{
  const {db,state}=fixture(),ctx=await authenticateWholesaleSeller(db,actor);
  await authorizeWholesalePrincipal(db,ctx,{}, {lock:true});await authorizeWholesalePrincipal(db,ctx,{storeId:'store-a'},{lock:true});
  await assert.rejects(()=>authorizeWholesalePrincipal(db,ctx,{customerId:'customer-a'}),error=>error.status===403);
  await authorizeWholesalePrincipal(db,ctx,scope,{lock:true});const assignment=state.calls.find(call=>call.sql.includes('a."customerId"=?'));
  assert.deepEqual(assignment.values,['company-a','seller-a','store-a','customer-a']);
  state.assigned=false;await assert.rejects(()=>authorizeWholesalePrincipal(db,ctx,scope),error=>error.status===404);
});

test('session and license expiry after row locks deny before an operation proceeds',async()=>{
  for(const date of ['expiresAt','subscriptionEndsAt','moduleEndsAt']){
    const {db,state}=fixture(),ctx=await authenticateWholesaleSeller(db,actor);state[date]=new Date('2026-10-18T11:59:59Z');
    await assert.rejects(()=>authorizeWholesalePrincipal(db,ctx,scope,{lock:true}),error=>error.status===401);
  }
});

test('subscription or module future start after lock acquisition denies access',async()=>{
  for(const date of ['subscriptionStartsAt','moduleStartsAt']){
    const {db,state}=fixture(),ctx=await authenticateWholesaleSeller(db,actor);state[date]=new Date('2026-10-18T12:00:01Z');
    await assert.rejects(()=>authorizeWholesalePrincipal(db,ctx,scope,{lock:true}),error=>error.status===401);
  }
});

test('verified Super Admin identity cannot bypass missing live paid wholesale entitlement',async()=>{
  const {db,state}=fixture();state.role='SUPER_ADMIN';state.live=false;
  await assert.rejects(()=>authenticateWholesaleSellerManager(db,{...actor,role:'OWNER',platformRole:'SUPER_ADMIN',isSuperAdmin:true}),error=>error.status===401);
  const sql=state.calls.find(call=>call.sql.includes('FROM "UserSession"')).sql;
  assert.ok(sql.includes("cm.\"moduleKey\"='WHOLESALE_B2B'"));assert.ok(sql.includes("co.\"licenseStatus\"='ACTIVE'"));
});

test('manager access needs actual current manager role, own company or verified real Super Admin',async()=>{
  await assert.rejects(()=>authenticateWholesaleSellerManager(fixture().db,{...actor,role:'OWNER'}),error=>error.status===401);
  await assert.rejects(()=>authenticateWholesaleSellerManager(fixture().db,actor),error=>error.status===403);
  const manager=fixture();manager.state.role='OWNER';await authenticateWholesaleSellerManager(manager.db,{...actor,role:'OWNER'});
  manager.state.userCompanyId='other-company';await assert.rejects(()=>authenticateWholesaleSellerManager(manager.db,{...actor,role:'OWNER'}),error=>error.status===401);
  manager.state.role='SUPER_ADMIN';await authenticateWholesaleSellerManager(manager.db,{...actor,role:'OWNER',platformRole:'SUPER_ADMIN',isSuperAdmin:true});
  await assert.rejects(()=>authenticateWholesaleSellerManager(manager.db,{...actor,role:'OWNER',isSuperAdmin:true}),error=>error.status===401);
});

async function http(db,user){
  const app=express();app.use(express.json());app.use((req,res,next)=>{req.user=user;next()});app.use('/api/wholesale/seller-admin',createWholesaleSellerAdminRouter({db,ensureSchema:async()=>{}}));
  const server=await new Promise(resolve=>{const s=app.listen(0,'127.0.0.1',()=>resolve(s))}),base=`http://127.0.0.1:${server.address().port}/api/wholesale/seller-admin`;
  return {async request(path,method='GET',body){const response=await fetch(base+path,{method,headers:{'Content-Type':'application/json'},...(body===undefined?{}:{body:JSON.stringify(body)})});return {status:response.status,body:await response.json()}},close:()=>new Promise(resolve=>{server.close(resolve);server.closeIdleConnections()})};
}

test('registered admin router rejects stale revisions/foreign targets, forbids binding overrides and atomically audits membership',async()=>{
  const {db,state}=fixture();state.role='OWNER';const api=await http(db,{...actor,role:'OWNER'});
  try{
    assert.equal((await api.request('/users/seller-a/membership','PUT',{active:true,expectedRevision:0})).status,200);assert.equal(state.member.revision,1);assert.equal(state.audits.length,1);
    assert.equal((await api.request('/users/seller-a/membership','PUT',{active:false,expectedRevision:0})).status,409);assert.equal(state.member.active,true);assert.equal(state.audits.length,1);
    assert.equal((await api.request('/users/foreign/membership','PUT',{active:true,expectedRevision:0})).status,404);assert.equal(state.audits.length,1);
    assert.equal((await api.request('/users/seller-a/membership','PUT',{active:true,expectedRevision:1,companyId:'foreign'})).status,400);
    assert.equal((await api.request('/users/seller-a/assignments')).status,400);
    const assigned=await api.request('/users/seller-a/assignments','PUT',{customerId:'customer-a',storeId:'store-a',active:true,expectedRevision:0});assert.equal(assigned.status,200);assert.equal(assigned.body.assignment.revision,1);assert.equal(state.audits.length,2);
    assert.equal((await api.request('/users/seller-a/assignments','PUT',{customerId:'customer-a',storeId:'store-a',active:false,expectedRevision:0})).status,409);assert.equal(state.assignment.active,true);assert.equal(state.audits.length,2);
    state.failAudit=true;const failed=await api.request('/users/seller-a/membership','PUT',{active:false,expectedRevision:1});assert.equal(failed.status,500);assert.equal(failed.body.code,'SELLER_UNAVAILABLE');assert.equal(state.member.active,true);assert.equal(state.member.revision,1);assert.equal(state.audits.length,2);
  }finally{await api.close()}
});
