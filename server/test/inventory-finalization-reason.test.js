import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';
import {z} from 'zod';
import {finalizeInventoryStocktake} from '../src/lib/inventory-stocktake-finalize.js';
import {lockDraftInventoryStocktake} from '../src/lib/inventory-stocktake-draft.js';

test('actual finalization rejects missing/blank/oversize cause without starting a transaction',async()=>{
  let transactions=0,passedReason;
  const handlers=new Map(),Router=()=>Object.fromEntries(['get','post','delete'].map(m=>[m,(p,...hs)=>handlers.set(m+p,hs)]));
  const prisma={$queryRaw:async()=>[{id:'take',companyId:'company',storeId:'store',status:'DRAFT'}],$transaction:async fn=>{transactions++;await fn({})}};
  const source=fs.readFileSync(new URL('../src/routes/inventory-v2.js',import.meta.url),'utf8').replace(/^import .*;\n/gm,'').replace(/^export .*;\n/gm,'');
  new Function('Router','z','crypto','prisma','jwt','assertCustomerDemoRuntimeClosed','finalizeInventoryStocktake','lockDraftInventoryStocktake',source)(Router,z,crypto,prisma,{},()=>{},async(_tx,_st,_actor,reason)=>{passedReason=reason},lockDraftInventoryStocktake);
  const invoke=async reason=>{let error,result;await handlers.get('post/stocktakes/:stocktakeId/finalize').at(-1)({user:{id:'owner',role:'OWNER',companyId:'company'},params:{stocktakeId:'take'},body:{reason}},{json:x=>{result=x},status(){return this}},e=>{error=e});return {error,result}};
  for(const reason of [undefined,null,'','  ','ab','x'.repeat(301)])assert.equal((await invoke(reason)).error?.name,'ZodError');
  assert.equal(transactions,0);
  assert.equal((await invoke('  Count verified against source ledger  ')).result.ok,true);assert.equal(transactions,1);assert.equal(passedReason,'Count verified against source ledger');
});
test('helper persists the exact trimmed cause in snapshot and adjustment note; invalid input has no queries/writes',async()=>{
  let queries=0,writes=[];
  const tx={$queryRaw:async strings=>{queries++;const sql=strings.join('?');return sql.includes('FROM "Stocktake"')?[{status:'DRAFT'}]:sql.includes('FROM "StoreProduct"')?[{productId:'product',currentStock:5}]:[{productId:'product',expectedQuantity:5,countedQuantity:4,unitCost:1,recountRequired:false}]},$executeRaw:async(strings,...values)=>{writes.push({sql:strings.join('?'),values});return 1}};
  const st={id:'take',companyId:'company',storeId:'store',scopeType:'PARTIAL_PRODUCTS',scopeJson:{productIds:['product']}};
  for(const reason of [undefined,null,'','  ','ab','x'.repeat(301)])await assert.rejects(finalizeInventoryStocktake(tx,st,'owner',reason),{status:400});
  assert.equal(queries,0);assert.deepEqual(writes,[]);
  await finalizeInventoryStocktake(tx,st,'owner','  Επαναμέτρηση N39 · μετρήθηκαν 4  ');
  const snapshot=JSON.parse(writes[0].values[1]);assert.equal(snapshot.reason,'Επαναμέτρηση N39 · μετρήθηκαν 4');assert.equal(snapshot.totalDifference,-1);
  assert.equal(writes.length,3);assert.equal(writes[1].values[0],-1);assert.equal(writes[2].values[6],'Οριστικοποίηση μερικής Inventory 2.0 · Επαναμέτρηση N39 · μετρήθηκαν 4');assert.equal(writes[2].values[7],'owner');
});
