import test from 'node:test';
import assert from 'node:assert/strict';
import {createCostRequestRevalidator,createInvoiceCostScope} from '../src/services/ai-customer-cost-runtime.js';
const user={id:'synthetic-actor',companyId:'a',role:'OWNER',tokenType:'BACKOFFICE_USER',sessionId:'synthetic-session',sessionVersion:2};
const session=()=>({userId:user.id,expiresAt:new Date(Date.now()+60000),revokedAt:null,user:{id:user.id,role:'OWNER',sessionVersion:2,mustChangePassword:false}});
test('cost revalidation calls native authentication then fresh stored role/session before module authorizer',async()=>{
 const order=[],req={user:{...user}};
 const verify=createCostRequestRevalidator({authenticate:async(copy,res,next)=>{order.push('native-auth');assert.notEqual(copy,req);copy.user={...user};next();},db:{userSession:{findUnique:async({where})=>{order.push('fresh-session');assert.equal(where.id,user.sessionId);return session();}}}});
 await verify(req,async copy=>{order.push('native-module-scope');assert.deepEqual(copy.user,user);});
 assert.deepEqual(order,['native-auth','fresh-session','native-module-scope']);assert.deepEqual(req.user,user);
});
test('revoked, expired, invalid, wrong principal/role/version and password-change sessions stop before module/provider',async()=>{
 for(const patch of [null,{revokedAt:new Date()},{expiresAt:new Date(0)},{expiresAt:'invalid'},{userId:'other'},{user:{...session().user,id:'other'}},{user:{...session().user,role:'EMPLOYEE'}},{user:{...session().user,sessionVersion:3}},{user:{...session().user,mustChangePassword:true}}]){
  let authorized=0;const verify=createCostRequestRevalidator({authenticate:async(req,res,next)=>next(),db:{userSession:{findUnique:async()=>patch===null?null:{...session(),...patch}}}});
  await assert.rejects(verify({user:{...user}},async()=>{authorized++;}),e=>e.code==='AI_WALLET_SESSION_REQUIRED');assert.equal(authorized,0);
 }
});
test('native authentication denial and changed claim scope never reach a new cost reservation',async()=>{
 for(const mode of ['deny','tenant','role','session','actor']){
  let authorized=0;const verify=createCostRequestRevalidator({authenticate:async(req,res,next)=>{if(mode==='deny')return res.status(403).json({});req.user={...user,...({tenant:{companyId:'b'},role:{role:'ADMIN'},session:{sessionId:'new'},actor:{id:'other'}}[mode])};next();},db:{userSession:{findUnique:async()=>session()}}});
  await assert.rejects(verify({user:{...user}},async()=>{authorized++;}),e=>e.code==='AI_WALLET_SESSION_REQUIRED');assert.equal(authorized,0);
 }
});
test('POS relies on native operator-session authentication and module checks, never a fabricated UserSession',async()=>{
 let modules=0;const verify=createCostRequestRevalidator({authenticate:async(req,res,next)=>next(),db:{userSession:{findUnique:async()=>{throw new Error('POS is not a UserSession');}}}});
 await verify({user:{...user,tokenType:'STORE_OPERATOR',sessionId:undefined,operatorSessionId:'synthetic-pos-session'}},async()=>{modules++;});assert.equal(modules,1);
});

test('invoice cost uses the company-owned persisted order store and never guesses another active store',async()=>{
 const calls=[];const bind=createInvoiceCostScope({db:{$queryRaw:async(strings,...values)=>{assert.deepEqual(values,['order-a','a']);return [{storeId:'actual-invoice-store'}];}},authorizeStore:async(req,storeId)=>{calls.push(storeId);return {companyId:req.user.companyId,storeId};}});
 const scoped=await bind({user:{companyId:'a'}},{orderId:'order-a'});assert.equal(scoped.storeId,'actual-invoice-store');assert.deepEqual(calls,['actual-invoice-store']);
 await assert.rejects(bind({user:{companyId:'a'}},{orderId:'order-a',storeId:'other-active-store'}),e=>e.code==='AI_WALLET_SCOPE_DENIED');assert.equal(calls.length,1);
});
test('foreign/deleted invoices and missing company-level selection stop before provider authorization',async()=>{
 let stores=0;const bind=createInvoiceCostScope({db:{$queryRaw:async()=>[]},authorizeStore:async(req,storeId)=>{stores++;if(!storeId)throw Object.assign(new Error(),{code:'AI_WALLET_SCOPE_DENIED'});return {storeId};}});
 await assert.rejects(bind({user:{companyId:'a'}},{orderId:'foreign-order'}),e=>e.code==='AI_WALLET_SCOPE_DENIED');assert.equal(stores,0);
 await assert.rejects(bind({user:{companyId:'a'}},{}),e=>e.code==='AI_WALLET_SCOPE_DENIED');
 assert.deepEqual(await bind({user:{companyId:'a'}},{storeId:'explicit-company-store'}),{storeId:'explicit-company-store'});
});
