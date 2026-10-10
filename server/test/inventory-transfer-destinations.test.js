import test from "node:test";
import assert from "node:assert/strict";
import {loadInventoryTransferDestinations} from "../../client/src/components/commerce/inventory-transfer-destinations.js";

test("fixed source scope can transfer to another authorized active store",async()=>{
  const scopedSource=[{id:"source",name:"Source"}];
  const companyStores=[...scopedSource,{id:"destination",active:true},{id:"inactive",active:false}];
  const destinations=await loadInventoryTransferDestinations(async path=>{
    assert.equal(path,"/api/stores");return companyStores;
  },"source");
  assert.deepEqual(destinations,[{id:"destination",active:true}]);
  assert.deepEqual(scopedSource,[{id:"source",name:"Source"}]);
  assert.equal(companyStores.length,3);
});

test("missing or inactive source fails without choosing a different source",async()=>{
  for(const stores of [[{id:"other",active:true}],[{id:"source",active:false},{id:"other",active:true}],null]){
    await assert.rejects(loadInventoryTransferDestinations(async()=>stores,"source"),/προέλευσης/);
  }
});

test("failed authorized-list request is propagated without cached destinations",async()=>{
  await assert.rejects(loadInventoryTransferDestinations(async()=>{throw new Error("No access")},"source"),/No access/);
  assert.deepEqual(await loadInventoryTransferDestinations(async()=>[{id:"source",active:true}],"source"),[]);
});
