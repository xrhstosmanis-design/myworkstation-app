import test from 'node:test';
import assert from 'node:assert/strict';
import {inventoryReadVisibility,personalInventoryLine} from '../src/services/backoffice-staff-inventory-read.js';
import {staffProfiles,validStaffCapabilities,changeStaffCapability,staffRequestCapability} from '../../shared/backoffice-staff.mjs';

test('history and theory are independent read rights; old finalizer compatibility and profiles are unchanged',()=>{
  for(const key of ['inventory.history.read','inventory.expected.read']){
    assert.equal(validStaffCapabilities([key]),false);
    assert.equal(validStaffCapabilities(['inventory.read',key]),true);
    assert.deepEqual(new Set(changeStaffCapability([],key,true)),new Set([key,'inventory.read']));
    for(const profile of Object.values(staffProfiles))assert.equal(profile.capabilities.includes(key),false);
  }
  const view=capabilities=>inventoryReadVisibility({capabilities});
  assert.deepEqual(view(['inventory.read']),{history:false,expected:false,finalizer:false});
  assert.deepEqual(view(['inventory.read','inventory.history.read']),{history:true,expected:false,finalizer:false});
  assert.deepEqual(view(['inventory.read','inventory.expected.read']),{history:false,expected:true,finalizer:false});
  assert.deepEqual(view(['inventory.read','inventory.finalize']),{history:false,expected:true,finalizer:true});
  for(const suffix of ['audit','audit.csv','investigation','reconciliation'])assert.equal(staffRequestCapability('GET','/api/inventory-v2/stocktakes/st/'+suffix),null);
});

test('the personal line projection omits unknown financial, actor, event and nested snapshot fields',()=>{
  const raw={id:'line',productId:'product',name:'Item',sku:'SKU',countedQuantity:'4.0001',expectedQuantity:'-2.5000',countVersion:3,recountRequired:false,barcodes:['123'],unitCost:999,salePrice:888,actorName:'private',snapshot:{expected:777},events:[{expectedQuantity:777}]};
  const blind=personalInventoryLine(raw,false),theory=personalInventoryLine(raw,true);
  assert.equal(blind.countedQuantity,'4.0001');assert.equal(Object.hasOwn(blind,'expectedQuantity'),false);
  assert.equal(theory.expectedQuantity,'-2.5000');
  assert.deepEqual(Object.keys(theory).sort(),['id','productId','name','sku','countedQuantity','countVersion','recountRequired','barcodes','expectedQuantity'].sort());
  for(const value of [null,undefined,NaN,Infinity,'not-a-quantity'])assert.throws(()=>personalInventoryLine({...raw,expectedQuantity:value},true),{code:'STAFF_INVENTORY_UNAVAILABLE'});
  assert.throws(()=>personalInventoryLine({...raw,barcodes:[{unitCost:999}]},true),{code:'STAFF_INVENTORY_UNAVAILABLE'});
  assert.equal(personalInventoryLine({...raw,countedQuantity:null},false).countedQuantity,null);
});
