import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import {staffCompanyCapabilities,validStaffCompanyCapabilities,staffCompanyRequestCapability,changeStaffCompanyCapability} from '../../shared/backoffice-staff-company.mjs';
import {staffProfiles,validStaffCapabilities} from '../../shared/backoffice-staff.mjs';
import {backofficeCompanyProfile,isBackofficeCompanyInstalled} from '../src/services/backoffice-company-profile.js';
import {enforceStaffCompanyRequest,requireStaffCompanyGrant,readStaffCompanyDirectory} from '../src/services/backoffice-staff-company.js';
import {createStaffInput,updateStaffInput,updateStaffAccount} from '../src/services/backoffice-staff-accounts.js';
import {createBackofficeStaffRouter} from '../src/routes/backoffice-staff.js';
const originalProfile=process.env.MWS_STORE_LIFECYCLE_PROFILE;
test.before(()=>{delete process.env.MWS_STORE_LIFECYCLE_PROFILE});
test.after(()=>{if(originalProfile===undefined)delete process.env.MWS_STORE_LIFECYCLE_PROFILE;else process.env.MWS_STORE_LIFECYCLE_PROFILE=originalProfile});
const employee={id:'staff',companyId:'company',role:'EMPLOYEE',tokenType:'BACKOFFICE_USER',staffAccess:true,sessionId:'session',sessionVersion:1};
const owner={id:'owner',companyId:'company',role:'OWNER',tokenType:'BACKOFFICE_USER',sessionId:'session',sessionVersion:1};
function recordingDb(role='OWNER'){
 const queries=[],writes=[];const db={queries,writes,company:{findFirst:async()=>({id:'company'})},store:{findMany:async()=>[]},user:{update:async()=>({id:'staff'})},userSession:{updateMany:async()=>({count:1})}};
 db.$queryRaw=async(strings,...args)=>{const sql=strings.join('?');queries.push({sql,args});assert.ok(!sql.includes('"companyCapabilities"'),'uninstalled runtime must never access new column');if(sql.includes('FROM "User" u JOIN "UserSession"'))return[{id:role==='OWNER'?'owner':'sa',companyId:'company',role}];if(sql.includes('JOIN "User" u')&&sql.includes('LIMIT 1 FOR SHARE'))return[{userId:'staff',companyId:'company',username:'staff',active:true,revision:1,fullName:'Staff',mustChangePassword:false}];if(sql.includes('FROM "BackofficeStaffAccount"')&&sql.includes('FOR UPDATE'))return[{userId:'staff',active:true,revision:1}];return[]};
 db.$executeRaw=async(strings,...args)=>{const sql=strings.join('?');assert.ok(!sql.includes('"companyCapabilities"'),'omitted policy must never write new column');writes.push({sql,args});return 1};db.$transaction=async fn=>fn(db);return db;
}
function request(extra={}){const headers={'x-backoffice-company-id':'company',...extra.headers};return{method:'GET',originalUrl:'/api/owner-products/stores',user:employee,query:{},body:undefined,...extra,headers,get:key=>headers[key.toLowerCase()]}}

test('company enum and exact classifier never derive authority from stores, presets or wildcard names',()=>{
 assert.deepEqual(staffCompanyCapabilities,['stores.read','suppliers.read','customers.read','expense-categories.read','customer-categories.read','professions.read','shipping-methods.read','categories.read','vat-departments.read','product-companies.read','banks.read','company-products.read','purchases.read','recipes.read','supplier-details.read','workforce-role-registry.read']);
 for(const value of [undefined,null,'*',['*'],['company.*'],['suppliers.read','suppliers.read'],['inventory.read'],['customers.write']])assert.equal(validStaffCompanyCapabilities(value),false);
 assert.equal(validStaffCompanyCapabilities([]),true);assert.equal(validStaffCompanyCapabilities([...staffCompanyCapabilities]),true);
 for(const profile of Object.values(staffProfiles))assert.ok(!profile.capabilities.some(key=>staffCompanyCapabilities.includes(key)));
 assert.equal(validStaffCapabilities(['customers.read']),false);
 for(const [path,key]of [['/api/owner-products/stores','stores.read'],['/api/commerce/suppliers','suppliers.read'],['/api/commerce/customers','customers.read'],['/api/management/expense-categories','expense-categories.read'],['/api/management/customer-categories','customer-categories.read'],['/api/management/professions','professions.read'],['/api/management/business-units/shipping-methods','shipping-methods.read'],['/api/management/categories','categories.read'],['/api/management/vat-departments','vat-departments.read'],['/api/management/product-companies','product-companies.read'],['/api/management/business-units/banks','banks.read'],['/api/commerce/products','company-products.read'],['/api/commerce/purchases','purchases.read'],['/api/commerce/recipes','recipes.read'],['/api/commerce/suppliers/supplier/detail','supplier-details.read'],['/api/backoffice-staff/company/workforce-roles','workforce-role-registry.read']]){assert.equal(staffCompanyRequestCapability('GET',path),key);for(const method of ['POST','PUT','PATCH','DELETE','HEAD'])assert.equal(staffCompanyRequestCapability(method,path),null);for(const suffix of ['/','/detail','?storeId=foreign'])assert.equal(staffCompanyRequestCapability('GET',path+suffix),null)}
});

test('default profile is unavailable without catalogue SQL and explicit company grant reads fail before new column access',async()=>{
 let queries=0;assert.equal(backofficeCompanyProfile({}),null);assert.equal(backofficeCompanyProfile({MWS_STORE_LIFECYCLE_PROFILE:'BASE'}),null);assert.equal(await isBackofficeCompanyInstalled({$queryRaw(){queries++;throw Error('should not query')}},{env:{}}),false);assert.equal(queries,0);
 const db=recordingDb();await assert.rejects(requireStaffCompanyGrant(db,employee,'stores.read'),e=>e.code==='STAFF_COMPANY_UNAVAILABLE'&&e.status===503);assert.equal(db.writes.length,0);assert.equal(db.queries.length,1);
});

test('mixed headers, selectors, bodies, alternate paths and store-bound identities are rejected before any data SQL',async()=>{
 const cases=[{headers:{'x-backoffice-store-id':''}},{headers:{'x-backoffice-store-id':'store'}},{headers:{'x-backoffice-company-id':'other'}},{headers:{'x-backoffice-company-id':''}},{query:{storeId:'store'}},{query:{companyId:['company','other']}},{query:{page:'1'}},{body:{companyId:'company'}},{body:{capabilities:['stores.read']}},{headers:{'content-length':'2'}},{headers:{'transfer-encoding':'chunked'}},{method:'POST'},{originalUrl:'/api/commerce/suppliers/id/detail/private'},{user:{...employee,storeId:'store'}}];
 for(const value of cases){const db=recordingDb();await assert.rejects(enforceStaffCompanyRequest(db,request(value)),e=>e.code==='STAFF_ACCESS_DENIED');assert.equal(db.queries.length,0,JSON.stringify(value));assert.equal(db.writes.length,0)}
 const db=recordingDb();await assert.rejects(readStaffCompanyDirectory(db,request()),e=>e.code==='STAFF_ACCESS_DENIED');assert.equal(db.queries.length,0);
});

test('company-only schemas accept zero store grants and refuse invalid/wildcard company policy',()=>{
 const create={username:'reader',fullName:'Company Reader',pin:'123456',grants:[],companyCapabilities:['suppliers.read']};const update={expectedRevision:1,active:true,grants:[],companyCapabilities:[]};assert.equal(createStaffInput.safeParse(create).success,true);assert.equal(updateStaffInput.safeParse(update).success,true);
 for(const value of [['*'],['suppliers.read','suppliers.read'],['products.read'],null]){assert.equal(createStaffInput.safeParse({...create,companyCapabilities:value}).success,false);assert.equal(updateStaffInput.safeParse({...update,companyCapabilities:value}).success,false)}
 assert.equal(Object.hasOwn(updateStaffInput.parse({expectedRevision:1,active:true,grants:[]}),'companyCapabilities'),false);
});

test('legacy omitted company policy updates preserve column and audit shape; explicit empty policy requires Owner plus installed protocol',async()=>{
 for(const role of ['OWNER','SUPER_ADMIN']){const db=recordingDb(role),actor=role==='OWNER'?owner:{...owner,id:'sa',role:'SUPER_ADMIN',isSuperAdmin:true,platformRole:'SUPER_ADMIN'};
 assert.deepEqual(await updateStaffAccount(db,actor,'staff',{expectedRevision:1,active:true,grants:[]}),{id:'staff',revision:2});assert.ok(db.writes.some(row=>row.sql.includes('"revision"="revision"+1')));const audit=db.writes.find(row=>row.sql.includes('INSERT INTO "BackofficeStaffAudit"'));assert.ok(audit);assert.ok(!JSON.stringify(audit.args).includes('companyCapabilities'));
 const explicit=recordingDb(role);await assert.rejects(updateStaffAccount(explicit,actor,'staff',{expectedRevision:1,active:true,grants:[],companyCapabilities:[]}),e=>role==='OWNER'?e.code==='STAFF_COMPANY_UNAVAILABLE':e.code==='STAFF_ACCESS_DENIED');assert.equal(explicit.writes.length,0)}
});

test('actual me/admin routes omit company protocol and new-column reads on legacy installations',async()=>{
 for(const role of ['EMPLOYEE','OWNER','SUPER_ADMIN']){const db=recordingDb(role),actor=role==='EMPLOYEE'?employee:role==='OWNER'?owner:{...owner,id:'sa',role:'SUPER_ADMIN',isSuperAdmin:true,platformRole:'SUPER_ADMIN'};const app=express();app.use(express.json());app.use('/api/backoffice-staff',createBackofficeStaffRouter({db,authenticate:(req,res,next)=>{req.user=actor;next()},issueSession:async()=>{},repository:{}}));const server=app.listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));try{const res=await fetch(`http://127.0.0.1:${server.address().port}/api/backoffice-staff/${role==='EMPLOYEE'?'me':'admin'}`);assert.equal(res.status,200);const body=await res.json();assert.equal(Object.hasOwn(body,'companyAuthority'),false);assert.equal(Object.hasOwn(body,'companyCapabilities'),false);assert.ok((body.accounts||[]).every(a=>!Object.hasOwn(a,'companyCapabilities')));assert.equal(db.writes.length,0)}finally{await new Promise(resolve=>server.close(resolve))}}
});

test('supplier detail dependency is explicit in helper and actual create/update schemas, preserving older directory-only policies',()=>{
 const enabled=changeStaffCompanyCapability([],'supplier-details.read',true);assert.deepEqual(new Set(enabled),new Set(['suppliers.read','supplier-details.read']));assert.equal(validStaffCompanyCapabilities(enabled),true);assert.equal(validStaffCompanyCapabilities(['supplier-details.read']),false);assert.deepEqual(changeStaffCompanyCapability(enabled,'suppliers.read',false),[]);assert.deepEqual(changeStaffCompanyCapability(enabled,'supplier-details.read',false),['suppliers.read']);
 const create={username:'reader',fullName:'Company Reader',pin:'123456',grants:[]};const update={expectedRevision:1,active:true,grants:[]};for(const schema of [createStaffInput,updateStaffInput]){const base=schema===createStaffInput?create:update;assert.equal(schema.safeParse({...base,companyCapabilities:['supplier-details.read']}).success,false);assert.equal(schema.safeParse({...base,companyCapabilities:enabled}).success,true);assert.equal(schema.safeParse({...base,companyCapabilities:['suppliers.read']}).success,true)}
});
