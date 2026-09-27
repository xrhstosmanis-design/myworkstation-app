import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";

const app=await readFile(new URL("../../client/src/components/platform/PlatformAdminApp.jsx",import.meta.url),"utf8");
const center=await readFile(new URL("../../client/src/components/platform/AiCommandCenter.jsx",import.meta.url),"utf8");

test("AI Command Center is an additive Super Admin screen",()=>{
  assert.match(app,/AI Command Center/);
  assert.match(app,/showAiCommandCenter/);
  assert.match(center,/data-ai-command-center="phase-1"/);
});

test("phase 1 reuses existing read-only overview and existing centers",()=>{
  assert.doesNotMatch(center,/fetch\(|request\(|method="POST"|method:"POST"/);
  assert.match(center,/Μία πηγή δεδομένων/);
  for(const callback of ["onOpenChecks","onOpenCash","onOpenPayments","onOpenBank","onOpenEvents"]){
    assert.match(center,new RegExp(callback));
  }
});

test("future AI modules are labelled as later phases instead of simulated results",()=>{
  assert.match(center,/Ρώτα το MyWorkStation/);
  assert.match(center,/Επόμενη φάση/);
  assert.match(center,/Digital Twin/);
  assert.doesNotMatch(center,/setInterval|WebSocket|EventSource/);
});
