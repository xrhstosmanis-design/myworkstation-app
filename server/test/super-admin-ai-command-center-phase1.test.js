import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";

const app=await readFile(new URL("../../client/src/components/platform/PlatformAdminApp.jsx",import.meta.url),"utf8");
const center=await readFile(new URL("../../client/src/components/platform/AiCommandCenter.jsx",import.meta.url),"utf8");
const platformRoutes=await readFile(new URL("../src/routes/platform-admin.js",import.meta.url),"utf8");

test("AI Command Center is an additive Super Admin screen",()=>{
  assert.match(app,/AI Command Center/);
  assert.match(app,/showAiCommandCenter/);
  assert.match(center,/data-ai-command-center="phase-3"/);
});

test("phase 2 reuses existing read-only checks and existing centers",()=>{
  assert.match(center,/Μία πηγή δεδομένων/);
  assert.match(center,/cash-control\/daily/);
  assert.match(center,/supplier-settlements\/review/);
  assert.match(center,/bank-ledger\/review/);
  for(const callback of ["onOpenChecks","onOpenCash","onOpenPayments","onOpenBank","onOpenEvents"]){
    assert.match(center,new RegExp(callback));
  }
});

test("future AI modules are labelled as later phases instead of simulated results",()=>{
  assert.match(center,/Ρώτα το MyWorkStation/);
  assert.match(center,/Φάση 3 · ενεργό/);
  assert.match(center,/Digital Twin/);
  assert.doesNotMatch(center,/setInterval|WebSocket|EventSource/);
});

test("phase 3 asks through the guarded read-only Platform endpoint",()=>{
  assert.match(center,/\/api\/platform\/ai-command-center\/ask/);
  assert.match(platformRoutes,/router\.post\("\/ai-command-center\/ask"/);
  assert.match(platformRoutes,/Δεν μπορείς να αλλάξεις δεδομένα ή να εκτελέσεις ενέργειες/);
  assert.match(platformRoutes,/aiCommandQuestionSchema\.parse/);
  assert.match(center,/question\.trim\(\)\|\|\"Ποια σημεία χρειάζονται έλεγχο σήμερα;/);
  assert.doesNotMatch(center,/disabled=\{askState\.loading\|\|question\.trim\(\)\.length/);
});
