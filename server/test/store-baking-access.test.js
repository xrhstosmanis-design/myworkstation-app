import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
test('real baking route rejects foreign stores and unauthorized roles before posting stock',async()=>{
 const handlers=new Map(),Router=()=>({use(){},get(path,fn){handlers.set(`GET ${path}`,fn)},post(path,fn){handlers.set(`POST ${path}`,fn)}});
 let postings=0;
 const prisma={store:{async findFirst({where}){return where.companyId==='company'&&where.id==='selected'?{id:'selected'}:null}},async $transaction(fn){return fn({})}};
 const source=fs.readFileSync(new URL('../src/routes/store-baking.js',import.meta.url),'utf8').replace(/^import .*;\n/gm,'').replace(/^export default router;\n?/gm,'');
 new Function('Router','prisma','auth','ensureStoreBakingSchema','recordBaking',source)(Router,prisma,()=>{},async()=>{},async()=>{postings++;return {id:'batch',duplicate:false}});
 const run=(user,storeId='selected')=>new Promise(resolve=>{
 let status=200;const res={status(code){status=code;return this},json(body){resolve({status,body})}};
 handlers.get('POST /stores/:storeId/baking')({user,params:{storeId},body:{}},res,error=>resolve({status:error.status,error:error.message}));
 });
 assert.equal((await run({companyId:'company',id:'staff',tokenType:'STORE_OPERATOR',storeId:'selected'},'foreign')).status,403);
 assert.equal((await run({companyId:'company',id:'viewer',role:'EMPLOYEE'})).status,403);
 assert.equal((await run({companyId:'other',id:'owner',role:'OWNER'})).status,404);
 assert.equal(postings,0);
 assert.equal((await run({companyId:'company',id:'staff',fullName:'Staff',tokenType:'STORE_OPERATOR',storeId:'selected'})).status,201);
 assert.equal(postings,1);
});
