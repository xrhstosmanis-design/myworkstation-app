import test from 'node:test';
import assert from 'node:assert/strict';
import {inventoryListCursor,personalInventoryListPage} from '../src/services/backoffice-staff-inventory-list.js';

test('inventory list accepts only one bounded opaque cursor and no scope or arbitrary query input',()=>{
  assert.equal(inventoryListCursor({}),null);
  assert.equal(inventoryListCursor({after:'stocktake-123_abc'}),'stocktake-123_abc');
  for(const query of [{after:''},{after:[]},{after:['a','b']},{after:{}},{after:'x'.repeat(121)},{after:"' OR 1=1"},{storeId:'other'},{after:'a',limit:'999999'}])assert.throws(()=>inventoryListCursor(query),{code:'STAFF_INVALID_PAGE',status:400});
});
test('bounded personal page redacts nested/financial fields, uses last returned ID and refuses hidden or deleted anchors',async()=>{
  const rows=Array.from({length:201},(_,i)=>({id:'id-'+i,name:'Name '+i,status:'DRAFT',startedAt:'2026-01-01',unitCost:999,snapshot:{private:888}}));
  let anchor=true;
  const db={$queryRaw:async(strings,...values)=>{
    const sql=strings.join('?');assert.ok(values.includes('company'));assert.ok(values.includes('store'));
    return sql.includes('SELECT s.')?rows:anchor?[{id:'cursor'}]:[];
  }};
  const page=await personalInventoryListPage(db,{companyId:'company'},'store',false,null);
  assert.equal(page.stocktakes.length,200);assert.equal(page.nextCursor,'id-199');
  assert.deepEqual(Object.keys(page.stocktakes[0]),['id','name','status','startedAt']);
  anchor=false;await assert.rejects(personalInventoryListPage(db,{companyId:'company'},'store',false,'cursor'),{code:'STAFF_PAGE_CHANGED',status:409});
  rows.length=1;anchor=true;assert.equal((await personalInventoryListPage(db,{companyId:'company'},'store',true,'cursor')).nextCursor,null);
});
