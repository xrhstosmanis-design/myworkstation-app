import test from "node:test";
import assert from "node:assert/strict";
import {resolveTwinSelection,twinSelectionFor} from "../../client/src/components/platform/ai-command-twin-selection.js";

const a={companyId:"company-a",id:"store-a",name:"A"};
const b={companyId:"company-b",id:"store-b",name:"B"};
test("N40: only the initial null selection chooses the first available store",()=>{
  assert.equal(resolveTwinSelection([a,b],null),a);
  assert.equal(resolveTwinSelection([],null),null);
  assert.equal(resolveTwinSelection(undefined,null),null);
});
test("N40: remembered company/store survives reordering and refreshed objects",()=>{
  const refreshed={...b,name:"B refreshed"};
  assert.equal(resolveTwinSelection([refreshed,a],twinSelectionFor(b)),refreshed);
  assert.equal(resolveTwinSelection([a,refreshed],twinSelectionFor(b)),refreshed);
});
test("N40: disappearing remembered store never falls back to the first store",()=>{
  assert.equal(resolveTwinSelection([a],twinSelectionFor(b)),null);
  assert.equal(resolveTwinSelection([],twinSelectionFor(b)),null);
  assert.equal(resolveTwinSelection([b],twinSelectionFor(a)),null);
});
test("N40: both company and store must match, even with a reused store identifier",()=>{
  assert.equal(resolveTwinSelection([{...b,companyId:"other"}],twinSelectionFor(b)),null);
  assert.equal(resolveTwinSelection([a,b],{companyId:a.companyId,storeId:b.id}),null);
});
test("N40: malformed selections remain invalid rather than initial selections",()=>{
  for(const value of [undefined,false,0,"",{},[],{companyId:"company-a"},{storeId:"store-a"},{companyId:" ",storeId:a.id},{companyId:a.companyId,storeId:1}]){
    assert.equal(resolveTwinSelection([a,b],value),null,JSON.stringify(value));
  }
});
test("N40: bootstrap ignores malformed rows without normalizing existing identities",()=>{
  assert.equal(resolveTwinSelection([null,{}, {id:"",companyId:"x"},a],null),a);
  assert.equal(resolveTwinSelection([a],{companyId:"company-a ",storeId:a.id}),null);
  assert.equal(resolveTwinSelection([a],{companyId:a.companyId,storeId:" store-a"}),null);
});
test("N40: taking a selection copies only identifiers and never mutates rows",()=>{
  const row=Object.freeze({...a,token:"fixture-not-copied"});
  assert.deepEqual(twinSelectionFor(row),{companyId:a.companyId,storeId:a.id});
  const selection=twinSelectionFor(row);selection.storeId="changed";
  assert.equal(row.id,a.id);
});
test("N40: explicit reselection recovers after invalidation",()=>{
  assert.equal(resolveTwinSelection([b],twinSelectionFor(a)),null);
  assert.equal(resolveTwinSelection([b],twinSelectionFor(b)),b);
});
