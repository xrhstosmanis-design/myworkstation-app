import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';
import {z} from 'zod';
import {inventoryStocktakeScopeAllowed,inventoryStoreScopeAllowed} from '../src/lib/inventory-stocktake-scope.js';
import {finalizeInventoryStocktake} from '../src/lib/inventory-stocktake-finalize.js';
import {lockDraftInventoryStocktake} from '../src/lib/inventory-stocktake-draft.js';

test('stocktake authorization retains central company scope and strict existing store/counter bindings',()=>{
  const st={id:'take',companyId:'company',storeId:'store'};
  assert.equal(inventoryStocktakeScopeAllowed({companyId:'company',role:'OWNER'},st),true);
  assert.equal(inventoryStocktakeScopeAllowed({companyId:'foreign'},st),false);
  assert.equal(inventoryStocktakeScopeAllowed({companyId:'company',storeId:'store'},st),true);
  assert.equal(inventoryStocktakeScopeAllowed({companyId:'company',storeId:'control'},st),false);
  for(const user of [{tokenType:'INVENTORY_COUNTER'},{tokenType:'INVENTORY_COUNTER',stocktakeId:'take'},{tokenType:'INVENTORY_COUNTER',stocktakeId:'other',storeId:'store'}])assert.equal(inventoryStocktakeScopeAllowed({companyId:'company',...user},st),false);
  assert.equal(inventoryStocktakeScopeAllowed({companyId:'company',tokenType:'INVENTORY_COUNTER',stocktakeId:'take',storeId:'store'},st),true);
  assert.equal(inventoryStoreScopeAllowed({storeId:'store'},'control'),false);assert.equal(inventoryStoreScopeAllowed({},'store'),true);assert.equal(inventoryStoreScopeAllowed({},''),false);
});
test('actual store-bound Inventory2.0 handlers reject foreign store before reads/writes beyond access lookup',async()=>{
  const handlers=new Map(),Router=()=>Object.fromEntries(['get','post','delete'].map(method=>[method,(path,...hs)=>handlers.set(method+path,hs)]));
  let queries=0,writes=0,transactions=0;
  const prisma={$queryRaw:async()=>{queries++;return [{id:'take',companyId:'company',storeId:'store',status:'DRAFT'}]},$executeRaw:async()=>{writes++;return 1},$transaction:async()=>{transactions++;throw Error('foreign transaction must not start')},store:{findFirst:async()=>{throw Error('foreign store lookup must not run')}}};
  for(const file of ['inventory-v2.js','inventory-v2-import.js','inventory-v2-audit.js']){
    const source=fs.readFileSync(new URL('../src/routes/'+file,import.meta.url),'utf8').replace(/^import[\s\S]*?;\n/gm,'').replace(/^export .*;\n/gm,'');
    new Function('Router','z','crypto','prisma','jwt','assertCustomerDemoRuntimeClosed','finalizeInventoryStocktake','lockDraftInventoryStocktake','inventoryStocktakeScopeAllowed','inventoryStoreScopeAllowed',source)(Router,z,crypto,prisma,{},()=>{},finalizeInventoryStocktake,lockDraftInventoryStocktake,inventoryStocktakeScopeAllowed,inventoryStoreScopeAllowed);
  }
  const paths=['get/stocktakes/:stocktakeId','get/stocktakes/:stocktakeId/product-search','delete/stocktakes/:stocktakeId','post/stocktakes/:stocktakeId/count','post/stocktakes/:stocktakeId/count/bulk-zero','delete/stocktakes/:stocktakeId/count/:lineId','post/stocktakes/:stocktakeId/lines','post/stocktakes/:stocktakeId/attach-barcode','post/stocktakes/:stocktakeId/finalize','post/stocktakes/:stocktakeId/import-counts','get/stocktakes/:stocktakeId/audit','get/stocktakes/:stocktakeId/audit.csv','get/stocktakes/:stocktakeId/investigation'];
  for(const path of paths){let status=200,error;const before=queries;const req={user:{companyId:'company',storeId:'control',role:'OWNER'},params:{stocktakeId:'take',lineId:'line'},query:{},body:{}};const res={status(value){status=value;return this},json(){return this}};for(const fn of handlers.get(path)){let proceed=false;await fn(req,res,e=>{if(e)error=e;else proceed=true});if(error||!proceed)break}assert.equal(error,undefined,path);assert.equal(status,404,path);assert.equal(queries-before,1,path)}
  for(const [path,body] of [['post/zones',{storeId:'store',code:'TEST',name:'Virtual'}],['post/stocktakes',{storeId:'store',name:'Virtual'}]]){let status,error;const req={user:{companyId:'company',storeId:'control',role:'OWNER'},body};const res={status(value){status=value;return this},json(){return this}};for(const fn of handlers.get(path)){let proceed=false;await fn(req,res,e=>{if(e)error=e;else proceed=true});if(error||!proceed)break}assert.equal(error,undefined);assert.equal(status,404)}
  assert.equal(writes,0);assert.equal(transactions,0);
});
