import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';

test('actual import/read and owner-product mounts admit only delegated exact actions before legacy bootstraps',async()=>{
  let revoked=false,revokeOnVat=false,capability='products.read',principal={id:'staff',companyId:'a',storeId:'a1',role:'EMPLOYEE',tokenType:'BACKOFFICE_USER',staffAccess:true,sessionId:'session',sessionVersion:0};
  const calls=[],old=globalThis.prisma;
  const db={company:{findUnique:async()=>({id:'a',active:true,licenseStatus:'ACTIVE',modules:[{moduleKey:'INVENTORY',active:true}]})},store:{findFirst:async({where})=>where.id==='a1'?{id:'a1',name:'A1'}:null},$queryRaw:async(strings,...values)=>{
    const sql=strings.join('?');calls.push({sql,values});
    if(sql.includes('FROM "BackofficeStaffAccount" a'))return revoked?[]:[{userId:'staff',companyId:'a',mustChangePassword:false}];
    if(sql.includes('FROM "BackofficeStaffGrant" g'))return [{profile:'AUDITOR',capabilities:['products.read','products.create']}];
    if(sql.includes('FROM "ManagementVatDepartment"')&&revokeOnVat)revoked=true;
    return [];
  },$queryRawUnsafe:async sql=>{assert.match(sql,/SELECT current_schema/);return [{schema:'isolated',fence:null}]},$executeRaw:()=>assert.fail('delegated read ran a business writer'),$executeRawUnsafe:()=>assert.fail('delegated route entered a legacy schema bootstrap')};
  globalThis.prisma=db;let server;
  try{
    const {default:imports}=await import('../src/routes/inventory-archive-import.js'),{default:archive}=await import('../src/routes/inventory-archive.js'),{requireOwnerProductAccess}=await import('../src/middleware/owner-product-access.js');
    const app=express();app.use(express.json());app.use((req,_res,next)=>{req.user=principal;req.staffGrant={capability};next()});
    app.use('/api/inventory-archive',imports);app.use('/api/inventory-archive',archive);
    app.use('/api/owner-products',requireOwnerProductAccess,()=>assert.fail('delegated request reached an owner-only router/bootstrap'));
    app.use((error,_req,res,_next)=>res.status(error.status||500).json({error:error.message}));
    server=await new Promise(resolve=>{const s=app.listen(0,'127.0.0.1',()=>resolve(s))});
    const request=async(path,method='GET')=>{const r=await fetch('http://127.0.0.1:'+server.address().port+path,{method});return {status:r.status,body:await r.json()}};
    const read=await request('/api/inventory-archive?storeId=a1');assert.equal(read.status,200,JSON.stringify(read.body));assert.equal(read.body.store.id,'a1');assert.deepEqual(read.body.items,[]);
    assert.ok(calls.some(c=>c.sql.includes('FROM "StoreProduct"')&&c.values.includes('a1')));
    const before=calls.length;assert.equal((await request('/api/inventory-archive/import','POST')).status,403);assert.equal(calls.length,before);
    capability='inventory.read';assert.equal((await request('/api/inventory-archive?storeId=a1')).status,403);
    capability='products.create';const options=await request('/api/owner-products/new-card/options?storeId=a1');assert.equal(options.status,200,JSON.stringify(options.body));
    for(const path of ['/api/owner-products/catalog','/api/owner-products/new-card/options?storeId=a2'])assert.equal((await request(path)).status,403);
    capability='products.read';assert.equal((await request('/api/owner-products/new-card/options?storeId=a1')).status,403);
    capability='products.create';principal={...principal,staffAccess:false};assert.equal((await request('/api/owner-products/new-card/options?storeId=a1')).status,403);
    let ownerNext=false;requireOwnerProductAccess({user:{role:'OWNER'},method:'GET',path:'/catalog'},{},()=>{ownerNext=true});assert.equal(ownerNext,true);
    principal={...principal,staffAccess:true};capability='products.read';revokeOnVat=true;
    const late=await request('/api/inventory-archive?storeId=a1');assert.equal(late.status,401);assert.equal(Object.hasOwn(late.body,'items'),false);
  }finally{
    if(server)await new Promise(resolve=>{server.close(resolve);server.closeAllConnections()});
    if(old===undefined)delete globalThis.prisma;else globalThis.prisma=old;
  }
});
