import test from 'node:test';
import assert from 'node:assert/strict';
import express,{Router} from 'express';
import {inventoryAction,inventoryCapabilities,assertInventoryPayload,inventoryObjectIds,assertInventoryStockUnchanged,authorizePosInventory} from '../src/services/pos-inventory-access.js';
import {inventoryTransactionDb,invokeInventoryRouter,createPosOperatorInventoryRouter} from '../src/routes/pos-operator-inventory.js';
import {createPosInventoryClient} from '../../client/src/components/store/pos-inventory-client.js';
const rights={inventoryPos:true,editDescription:true,changeRetail:true,addBarcode:true,newProduct:true,onlineBarcode:true};
const scope={companyId:'C',storeId:'S',capabilities:inventoryCapabilities(rights)};
const user={id:'O',operatorId:'O',operatorSessionId:'session',employeeId:'E',companyId:'C',storeId:'S',role:'EMPLOYEE',tokenType:'STORE_OPERATOR'};
test('inventory is default off, strict boolean, never a stock grant',()=>{
 assert.equal(inventoryCapabilities().read,false);assert.equal(inventoryCapabilities({inventoryPos:'true'}).read,false);assert.equal(scope.capabilities.stock,false);
});
test('exact action admission rejects every stock and unknown route regardless of method',()=>{
 for(const path of ['/products/P/stock-adjustment','/products/P/destruction','/products/P/supplier-return','/products/merge/preview','/products/merge/confirm','/archive/stock-transfer','/products/stocktakes/S/finalize','/products/smart-entry','/products/activate','/products/P/card/extra','/products/P%2fQ/details'])for(const method of ['GET','POST','PATCH','DELETE'])assert.throws(()=>inventoryAction(method,path),undefined,path);
 for(const [method,path] of [['GET','/archive'],['GET','/products/P/details'],['PATCH','/products/P/card'],['POST','/products/new-card'],['DELETE','/products/P/set-items/link']])assert.ok(inventoryAction(method,path));
});
test('own store, related objects and no-stock payload are checked independently of UI',()=>{
 for(const payload of [{storeId:'OTHER'},{stores:[{storeId:'OTHER'}]},{storeIds:['S','OTHER']},{companyId:'OTHER'},{destinationStoreId:'S'},{openingStock:1},{applyStock:true},{nested:{currentStock:0}},{currentStock:9}])assert.throws(()=>assertInventoryPayload(scope,{kind:'card'},{},payload));
 assertInventoryPayload(scope,{kind:'create'},{storeId:'S'},{storeId:'S',openingStock:0});
 assert.deepEqual(inventoryObjectIds({productId:'P'},{sourceProductId:'Q',setItem:{relatedProductId:'R'},productIds:['P','T']}),['P','Q','R','T']);
 for(const kind of ['prices','create','lookup','barcode-transfer','import'])assert.throws(()=>assertInventoryPayload({...scope,capabilities:inventoryCapabilities({inventoryPos:true})},{kind},{},{}));
});
test('stock invariant detects changed/deleted rows and movement writes; accepts only zero new links',()=>{
 const before={rows:[{productId:'P',qty:'3.000'}],movements:'7'};
 assertInventoryStockUnchanged(before,{rows:[...before.rows,{productId:'N',qty:'0.000'}],movements:'7'});
 for(const after of [{rows:[],movements:'7'},{rows:[{productId:'P',qty:'4'}],movements:'7'},{rows:before.rows,movements:'8'},{rows:[...before.rows,{productId:'N',qty:'1'}],movements:'7'}])assert.throws(()=>assertInventoryStockUnchanged(before,after));
});
test('real session/profile authorization parameterizes identity and locks current grant',async()=>{
 let captured;const db={$queryRawUnsafe:async(...args)=>{captured=args;return[{id:'O',employeeId:'E',permissions:rights}]}};
 const result=await authorizePosInventory(db,user,'S');assert.equal(result.actorId,'O');assert.match(captured[0],/FOR SHARE OF c,p,os,e,s,co/);assert.deepEqual(captured.slice(1),['O','C','S','E','session','EMPLOYEE']);
 for(const actor of [{...user,tokenType:'USER'},{...user,operatorSessionId:null},{...user,storeId:'OTHER'}])await assert.rejects(()=>authorizePosInventory(db,actor,'S'));
 await assert.rejects(()=>authorizePosInventory({$queryRawUnsafe:async()=>[]},user,'S'));
 await assert.rejects(()=>authorizePosInventory({$queryRawUnsafe:async()=>[{permissions:{inventoryPos:false}}]},user,'S'));
});
test('canonical nested writes use exactly one transaction and HTTP failures reject',async()=>{
 const tx={value:3,method(){return this.value}};const db=inventoryTransactionDb(tx);assert.equal(await db.$transaction(async nested=>nested.method()),3);
 const router=Router();router.get('/ok',(_req,res)=>res.status(201).json({ok:true}));router.get('/fail',(_req,res)=>res.status(409).json({error:'conflict'}));
 assert.equal((await invokeInventoryRouter(router,{method:'GET',url:'/ok',headers:{}})).status,201);
 await assert.rejects(()=>invokeInventoryRouter(router,{method:'GET',url:'/fail',headers:{}}),error=>error.status===409);
});
test('client pins session, actor/store and lifecycle, never falls back to general API',async()=>{
 let token='session-token',calls=[],lost=0;const api=async(path,options)=>{calls.push({path,options});return{scope:{storeId:'S',actorId:'O'},capabilities:{read:true},lifecycle:{generation:'5'},data:{ok:true}}};
 const client=createPosInventoryClient({api,storeId:'S',actorId:'O',sessionToken:token,currentToken:()=>token,onAccessLost:()=>lost++});
 await assert.rejects(()=>client.api('/api/owner-products/P/card',{method:'PATCH'}));assert.equal(calls.length,0);
 await client.request('/access');await client.api('/api/owner-products/P/card',{method:'PATCH'});assert.equal(calls[1].options.headers['X-Inventory-Generation'],'5');assert.match(calls[1].path,/^\/api\/store-pos\/stores\/S\/inventory\/products\/P\/card$/);
 await assert.rejects(()=>client.api('/api/financial/writer'));assert.equal(calls.length,2);
 token='another-session';await assert.rejects(()=>client.api('/api/inventory-archive?storeId=S'));assert.equal(calls.length,2);client.dispose();assert.equal(lost,0);
});
test('closed client rejects late read results and cross-store envelopes',async()=>{
 let finish;const client=createPosInventoryClient({api:()=>new Promise(resolve=>finish=resolve),storeId:'S',actorId:'O',sessionToken:'t',currentToken:()=> 't'});
 const pending=client.request('/access');client.dispose();finish({scope:{storeId:'S',actorId:'O'},capabilities:{read:true},lifecycle:{generation:'0'}});await assert.rejects(()=>pending);
 const bad=createPosInventoryClient({api:async()=>({scope:{storeId:'OTHER',actorId:'O'},capabilities:{read:true},lifecycle:{generation:'0'}}),storeId:'S',actorId:'O',sessionToken:'t',currentToken:()=> 't'});await assert.rejects(()=>bad.request('/access'));
});
