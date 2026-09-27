import test from "node:test";
import assert from "node:assert/strict";
import {reconcileAssistantIdentities} from "../src/lib/invoice-assistant-identities.js";

test("matching independent code and name preserve a confident printed row",()=>{
  const lines=[{supplierCode:"368",description:"ΟΛ ΓΑΛΑΖΗ 3,7% 500ML",confidence:"certain",matchingLineId:"line-1"}];
  assert.deepEqual(reconcileAssistantIdentities(lines,{rows:[{supplierCode:"368",description:"ΟΛ ΓΑΛΑΖΗ 3,7% 500ML",confidence:"certain"}]}),lines);
});

test("a conflicting product identity is visible and cannot authorize a draft correction",()=>{
  const [line]=reconcileAssistantIdentities([{supplierCode:"1",description:"ΡΟΔ ΡΥΖΟΓΑΛΟ",confidence:"certain",matchingLineId:"line-5"}],{rows:[{supplierCode:"500",description:"ΡΟΔ ΡΥΖΟΓΑΛΟ 160G",confidence:"certain"}]});
  assert.equal(line.supplierCode,"500");assert.equal(line.confidence,"uncertain");assert.equal(line.matchingLineId,"");assert.match(line.reviewReason,/Επιβεβαίωσε/);
});

test("a missing or reordered independent table blocks all line identities",()=>{
  const result=reconcileAssistantIdentities([{supplierCode:"1",matchingLineId:"a"},{supplierCode:"2",matchingLineId:"b"}],{rows:[{supplierCode:"1"}]});
  assert.deepEqual(result.map(row=>row.matchingLineId),["",""]);
  assert.ok(result.every(row=>row.confidence==="uncertain"));
});
