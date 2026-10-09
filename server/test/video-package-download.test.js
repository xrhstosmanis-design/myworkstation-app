import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {sendHikvisionPrecheck,hikvisionPrecheckPackage as manifest} from '../src/services/video-installation-package.js';
const response=()=>({statusCode:200,headers:{},status(v){this.statusCode=v;return this},json(v){this.body=v;return this},send(v){this.body=v;return this},setHeader(k,v){this.headers[k]=v}});
test('package response returns exact verified common ZIP with private attachment headers',async()=>{
 const res=response();await sendHikvisionPrecheck(res);
 assert.equal(res.statusCode,200);assert.equal(res.body.length,manifest.size);assert.equal(createHash('sha256').update(res.body).digest('hex'),manifest.sha256);
 assert.equal(res.headers['Content-Type'],'application/zip');assert.equal(res.headers['Content-Disposition'],`attachment; filename="${manifest.filename}"`);assert.equal(res.headers['Cache-Control'],'private, no-store');assert.equal(res.headers['X-Content-Type-Options'],'nosniff');
});
test('missing or altered package fails closed without ZIP headers or filesystem details',async()=>{
 for(const read of [async()=>{throw Error('/secret/path')},async()=>Buffer.alloc(manifest.size),async()=>Buffer.from('bad')]){const res=response();await sendHikvisionPrecheck(res,{read});assert.equal(res.statusCode,503);assert.equal(res.headers['Content-Type'],undefined);assert.doesNotMatch(JSON.stringify(res.body),/secret|path/)}
});
test('actual registered Backoffice package route requires owner/admin, license, module and same-company active store',async()=>{
 const routes=new Map(),middlewares=[];let state={licenseAllowed:true,activeModules:['VIDEO_EVENTS']},served=0;
 const router={use:(...a)=>{if(a[0]==='/stores/:storeId')middlewares.push(a[1])},get:(p,h)=>routes.set(p,h),post(){},put(){}};
 const source=(await readFile(new URL('../src/routes/backoffice-video-admin.js',import.meta.url),'utf8')).replace(/^import .*;$/gm,'').replace('export default router;','return router;');
 const db={store:{findFirst:async({where})=>where.id==='store'&&where.companyId==='company'&&where.active?{id:'store'}:null}};
 new Function('Router','prisma','companyModuleState','ensureVideoEventsSchema','sendHikvisionPrecheck',source)(()=>router,db,async()=>state,async()=>{},async res=>{served++;res.send('zip')});
 const request=async(user,storeId='store')=>{const req={user,params:{storeId}},res=response();let passed=false;await middlewares[0](req,res,()=>{passed=true});if(passed)await routes.get('/stores/:storeId/packages/hikvision-precheck')(req,res,e=>{throw e});return res};
 for(const role of ['OWNER','ADMIN'])assert.equal((await request({role,companyId:'company'})).body,'zip');
 const before=served;assert.equal((await request({role:'CASHIER',companyId:'company'})).statusCode,403);assert.equal((await request({role:'OWNER',companyId:'foreign'})).statusCode,404);assert.equal((await request({role:'OWNER',companyId:'company'},'unknown')).statusCode,404);
 for(const value of [{licenseAllowed:false,activeModules:['VIDEO_EVENTS']},{licenseAllowed:true,activeModules:[]}]){state=value;assert.equal((await request({role:'OWNER',companyId:'company'})).statusCode,403)}assert.equal(served,before);
});
test('Platform package handler preserves global superadmin and exact company/store/module context',async()=>{
 const source=await readFile(new URL('../src/routes/platform-admin.js',import.meta.url),'utf8');
 const guard=source.match(/router.use\(\(req,res,next\)=>\{[\s\S]*?\n\}\);/)[0];let gate;
 new Function('router',guard)({use:h=>gate=h});
 for(const user of [{role:'OWNER'},{role:'ADMIN'},{}]){let passed=false;const res=response();gate({user},res,()=>passed=true);assert.equal(res.statusCode,403);assert.equal(passed,false)}
 let served=0,active=true;
 const context=source.slice(source.indexOf('async function installationStore('),source.indexOf('async function onlineStoreContext('))+source.slice(source.indexOf('async function videoStoreContext('),source.indexOf('async function tableServiceContext('));
 const route=source.match(/router.get\("\/companies\/:companyId\/stores\/:storeId\/video-connection\/packages\/hikvision-precheck",[\s\S]*?\n\}\);/)[0];let handler;
 new Function('router','prisma','sendHikvisionPrecheck',context+route)({get:(p,h)=>handler=h},{store:{findFirst:async({where})=>where.id==='store'&&where.companyId==='company'?{id:'store'}:null},companyModule:{findFirst:async()=>active?{}:null}},async res=>{served++;res.send('zip')});
 const request=async(companyId,storeId)=>{const res=response();let error;await handler({params:{companyId,storeId}},res,e=>error=e);return {res,error}};
 assert.equal((await request('company','store')).res.body,'zip');assert.equal((await request('foreign','store')).error.status,404);assert.equal((await request('company','unknown')).error.status,404);active=false;assert.equal((await request('company','store')).error.status,409);assert.equal(served,1);
});
