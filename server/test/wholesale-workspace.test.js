import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import {request as httpRequest} from 'node:http';
import {createWholesaleWorkspaceRouter} from '../src/routes/wholesale-workspace.js';

const user={id:'owner-a',companyId:'company-a',role:'OWNER',sessionId:'session-a',sessionVersion:1,tokenType:'BACKOFFICE_USER'};
function fixture(){
  const state={calls:[],role:'OWNER',userCompanyId:'company-a',live:true,paid:true,now:new Date('2026-10-19T12:00:00Z'),expiresAt:new Date('2026-10-19T20:00:00Z'),afterStore:null};
  const db={async $transaction(fn){state.calls.push({sql:'TRANSACTION'});return fn(db)},async $queryRaw(first,...rest){
    const sql=Array.isArray(first)?first.join('?'):first.sql,values=Array.isArray(first)?rest:first.values;state.calls.push({sql,values});
    if(sql.includes('FROM "UserSession"'))return state.live&&state.paid?[{id:'owner-a',fullName:'Current owner',role:state.role,userCompanyId:state.userCompanyId,expiresAt:state.expiresAt}]:[];
    if(sql.includes('clock_timestamp() AS "now"'))return [{now:state.now}];
    if(sql.includes('FROM "User" u JOIN "Company"'))return [{id:'owner-a',fullName:'Current owner',companyId:'company-a',companyName:'Wholesale only'}];
    if(sql.includes('FROM "Store"')){
      const rows=values.length===1?[{id:'store-a',name:'A'},{id:'store-a2',name:'A2'}]:values[1]==='store-a'?[{id:'store-a',name:'A'}]:[];
      state.afterStore?.();return rows;
    }
    if(sql.includes('FROM "Company" co JOIN "CompanyModule"'))return state.paid?[{companyId:'company-a'}]:[];
    throw Error('Unexpected workspace dependency '+sql);
  },$executeRaw(){throw Error('Workspace must not mutate')},$executeRawUnsafe(){throw Error('Workspace must not provision schema')}};
  return {db,state};
}
async function http(db,identity=user){
  const app=express();app.use(express.json());app.use((req,res,next)=>{req.user=identity;next()});app.use('/workspace',createWholesaleWorkspaceRouter({db}));app.use((error,req,res,next)=>res.status(500).json({error:'Unavailable'}));
  const server=await new Promise(resolve=>{const listener=app.listen(0,'127.0.0.1',()=>resolve(listener))});
  return {async get(query){const response=await fetch(`http://127.0.0.1:${server.address().port}/workspace`+query);return {status:response.status,body:await response.json(),headers:response.headers}},getBody(body){return new Promise((resolve,reject)=>{
    const payload=JSON.stringify(body),request=httpRequest({hostname:'127.0.0.1',port:server.address().port,path:'/workspace?scope=company',method:'GET',headers:{'content-type':'application/json','content-length':Buffer.byteLength(payload)}},response=>{let raw='';response.on('data',chunk=>{raw+=chunk});response.on('end',()=>resolve({status:response.statusCode,body:JSON.parse(raw)}))});request.on('error',reject);request.end(payload);
  })},close:()=>new Promise(resolve=>{server.close(resolve);server.closeIdleConnections()})};
}

test('registered workspace returns only exact safe metadata for explicit chooser or selected store',async()=>{
  const {db,state}=fixture(),api=await http(db);
  try{
    const chooser=await api.get('?scope=company');assert.equal(chooser.status,200);assert.equal(chooser.headers.get('cache-control'),'no-store');
    assert.deepEqual(chooser.body,{user:{id:'owner-a',fullName:'Current owner',role:'OWNER'},company:{id:'company-a',name:'Wholesale only'},access:{moduleKey:'WHOLESALE_B2B',companyId:'company-a',enabled:true,expiresAt:null},stores:[{id:'store-a',name:'A'},{id:'store-a2',name:'A2'}],storeId:''});
    const selected=await api.get('?storeId=%20store-a%20');assert.equal(selected.status,200);assert.equal(selected.body.storeId,'store-a');assert.deepEqual(selected.body.stores,[{id:'store-a',name:'A'}]);
    assert.ok(state.calls.filter(call=>call.sql.includes('FROM "Store"')).every(call=>call.sql.includes('"companyId"=')&&call.sql.includes('"active"=true')&&call.sql.includes('FOR SHARE')));
    assert.ok(state.calls.filter(call=>call.sql.includes('FROM "UserSession"')).every(call=>call.sql.includes('FOR SHARE')&&call.sql.includes("'WHOLESALE_B2B'")));
    assert.doesNotMatch(state.calls.map(call=>call.sql).join('\n'),/WholesaleSellerMembership|\bCORE\b|Shift|CREATE|INSERT|UPDATE|DELETE/);
  }finally{await api.close()}
});

test('blank, mixed, repeated and unknown scope inputs never query workspace data',async()=>{
  const {db,state}=fixture(),api=await http(db);
  try{for(const query of ['', '?storeId=', '?storeId=%20', '?scope=all','?scope=company&storeId=store-a','?storeId=store-a&storeId=store-a2','?scope=company&extra=1','?storeId='+('a'.repeat(201))])assert.equal((await api.get(query)).status,400,query);assert.equal(state.calls.length,0)}finally{await api.close()}
});

test('explicit missing, inactive or foreign store cannot fall back to company stores',async()=>{
  const {db}=fixture(),api=await http(db);
  try{for(const id of ['missing','inactive','foreign']){const denied=await api.get('?storeId='+id);assert.equal(denied.status,404);assert.equal(denied.body.code,'WHOLESALE_WORKSPACE_STORE_NOT_FOUND');assert.doesNotMatch(JSON.stringify(denied.body),/Current owner|Wholesale only|store-a/)}}finally{await api.close()}
});

test('real Express GET parsing permits an empty body and rejects body identity or scope overrides',async()=>{
  const {db,state}=fixture(),api=await http(db);
  try{
    for(const body of [{companyId:'foreign'},{storeId:'foreign'},{userId:'foreign'},[]]){const before=state.calls.length;assert.equal((await api.getBody(body)).status,400);assert.equal(state.calls.length,before)}
    assert.equal((await api.getBody({})).status,200);
  }finally{await api.close()}
});

test('live personal manager role and paid access are mandatory; support contexts are rejected',async()=>{
  const cases=[
    [{supportContext:true},()=>{},403],
    [{tokenType:'STORE_OPERATOR'},()=>{},401],
    [{sessionId:''},()=>{},401],
    [{},state=>{state.live=false},401],
    [{},state=>{state.paid=false},401],
    [{role:'MANAGER'},()=>{},401],
    [{role:'EMPLOYEE'},state=>{state.role='EMPLOYEE'},403],
    [{},state=>{state.userCompanyId='foreign'},401]
  ];
  for(const [patch,prepare,status] of cases){const {db,state}=fixture();prepare(state);const api=await http(db,{...user,...patch});try{const denied=await api.get('?scope=company');assert.equal(denied.status,status);assert.doesNotMatch(JSON.stringify(denied.body),/Current owner|Wholesale only/);if(patch.supportContext)assert.equal(state.calls.length,0)}finally{await api.close()}}
});

test('session revocation and real-clock expiry after store read deny before metadata leaves transaction',async()=>{
  for(const change of [state=>{state.live=false},state=>{state.expiresAt=new Date('2026-10-19T11:59:59Z')},state=>{state.paid=false}]){
    const {db,state}=fixture();state.afterStore=()=>change(state);const api=await http(db);
    try{const denied=await api.get('?storeId=store-a');assert.ok([401,403].includes(denied.status));assert.doesNotMatch(JSON.stringify(denied.body),/Current owner|Wholesale only|store-a/)}finally{await api.close()}
  }
});

test('verified actual Super Admin preserves its validated canonical personal role without a paid bypass',async()=>{
  const {db,state}=fixture();state.role='SUPER_ADMIN';state.userCompanyId='platform-company';const api=await http(db,{...user,platformRole:'SUPER_ADMIN',isSuperAdmin:true});
  try{const response=await api.get('?scope=company');assert.equal(response.status,200);assert.equal(response.body.user.role,'OWNER');state.paid=false;assert.equal((await api.get('?scope=company')).status,401)}finally{await api.close()}
});
