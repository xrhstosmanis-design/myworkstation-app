import test from "node:test";
import assert from "node:assert/strict";
import {createRequire} from "node:module";
import {fileURLToPath} from "node:url";
import {readFile} from "node:fs/promises";
import {build} from "esbuild";
import {JSDOM} from "jsdom";

test("mounted report dialog saves explicit store slots, previews saved versions and discards late results after store switch",async()=>{
 const dom=new JSDOM('<div id="root"></div>',{url:"https://isolated.invalid/"}),keys=["window","document","navigator","HTMLElement","Node","Event","IS_REACT_ACT_ENVIRONMENT"],previous=new Map(keys.map(key=>[key,Object.getOwnPropertyDescriptor(globalThis,key)]));
 for(const key of keys)Object.defineProperty(globalThis,key,{configurable:true,writable:true,value:key==="IS_REACT_ACT_ENVIRONMENT"?true:dom.window[key]});
 const React=await import("react"),{createRoot}=await import("react-dom/client"),{act}=React;
 const compiled=await build({entryPoints:[fileURLToPath(new URL("../../client/src/components/platform/AutomaticReportSettingsManager.jsx",import.meta.url))],bundle:true,write:false,format:"cjs",platform:"node",loader:{".css":"empty"},external:["react","react-dom","react-dom/client","react/jsx-runtime"]});
 const module={exports:{}};new Function("require","module","exports",compiled.outputFiles[0].text)(createRequire(import.meta.url),module,module.exports);
 const root=createRoot(document.getElementById("root")),calls=[],cashRule={mode:"FULL",deliveryTerminalPattern:"DELIVERY",carryOverEnabled:true,posEftposEnabled:true};
 let saved=null,failSave=false,latePreview=null,holdPreview=false,lateLoad=null,holdLoad=false,previewMetadata={},sourceReady=true;
 const request=async(path,options={})=>{
  calls.push({path,...options});
  if(options.method==="PUT"){
   if(failSave)throw Error("Οι ρυθμίσεις άλλαξαν σε άλλο παράθυρο.");
   const body=JSON.parse(options.body);saved={version:1,configuration:body.configuration};return {settings:saved,dispatchEnabled:false};
  }
  if(options.method==="POST"){
   const result={...previewMetadata,ready:sourceReady,sourceCount:3,settingsVersion:1,holds:sourceReady?[]:[{code:"THIRD_SHIFT_OPEN",day:"2020-01-19"}],groups:[{terminalPos:"MAIN",cashChain:"STORE",day:"2020-01-15",originalShortage:10,originalSurplus:8,offset:8,netVariance:-2,rows:[{sessionId:"session",employeeName:"EMPLOYEE FROM A",variance:-10}]}]};
   if(holdPreview)return new Promise(resolve=>{latePreview=()=>resolve(result)});return result;
  }
  const result={store:{id:path.includes("/stores/B/")?"B":"A"},settings:path.includes("/stores/B/")?null:saved,cashRule,observedTerminals:["MAIN","DELIVERY"],suggestedDay:"2020-01-15",dispatchEnabled:false};
  if(holdLoad&&path.includes("/stores/A/"))return new Promise(resolve=>{lateLoad=()=>resolve(result)});return result;
 };
 const render=store=>act(async()=>root.render(React.createElement(module.exports.default,{key:store,company:{id:"c",name:"COMPANY"},store:{id:store,name:store},request,onClose:()=>{}})));
 const button=text=>[...document.querySelectorAll("button")].find(b=>b.textContent===text);
 const change=async(selector,value)=>act(async()=>{const input=document.querySelector(selector);Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype,"value").set.call(input,value);input.dispatchEvent(new dom.window.Event("input",{bubbles:true}))});
 try{
  await render("A");assert.match(document.body.textContent,/Η αυτόματη αποστολή δεν έχει ενεργοποιηθεί/);assert.equal(button("Προεπισκόπηση αναφοράς").disabled,true);
  await act(async()=>button("+ Προσθήκη ταμείου").click());await change('[aria-label="Κωδικός ταμείου 1"]',"MAIN");
  await act(async()=>button("+ Προσθήκη ταμείου").click());await change('[aria-label="Κωδικός ταμείου 2"]',"DELIVERY");
  const deliverySlots=document.querySelectorAll('[aria-label="Βάρδιες ταμείου 2"] input');
  await act(async()=>{deliverySlots[1].click();deliverySlots[2].click()});
  await act(async()=>document.querySelector(".report-settings-confirm input").click());
  assert.equal(document.querySelector("form").checkValidity(),true);
  await act(async()=>document.querySelector("form").dispatchEvent(new dom.window.Event("submit",{bubbles:true,cancelable:true})));
  const write=calls.find(c=>c.method==="PUT"),body=JSON.parse(write.body);assert.equal(write.path,"/api/platform/companies/c/stores/A/report-settings");assert.equal(body.expectedVersion,0);assert.deepEqual(body.configuration.terminals,[{terminalPos:"MAIN",requiredSlots:[1,2,3]},{terminalPos:"DELIVERY",requiredSlots:[1]}]);assert.deepEqual(body.configuration.cashRule,cashRule);
  assert.match(document.body.textContent,/Δεν στάλθηκε email/);assert.equal(button("Προεπισκόπηση αναφοράς").disabled,false);
  await act(async()=>button("Προεπισκόπηση αναφοράς").click());assert.match(document.body.textContent,/EMPLOYEE FROM A/);assert.match(document.body.textContent,/Προσωρινή αναφορά ταμείων/);assert.match(document.body.textContent,/Η προεπισκόπηση δεν πιστοποιεί ολοκληρωμένη οικονομική συμφωνία/);assert.match(document.body.textContent,/συμφωνία παραστατικών με πληρωμές/);assert.match(document.body.textContent,/οι εξηγήσεις ελεγκτή/);assert.match(document.body.textContent,/τα φυσικά μετρητά με τα υπόλοιπα ελέγχου/);assert.deepEqual(JSON.parse(calls.find(c=>c.method==="POST").body),{day:"2020-01-15",expectedVersion:1});
  await act(async()=>{const select=document.querySelector('[aria-label="Περίοδος αναφοράς"]');select.value="WEEKLY";select.dispatchEvent(new dom.window.Event("change",{bubbles:true}))});
  assert.doesNotMatch(document.body.textContent,/EMPLOYEE FROM A/);assert.match(document.body.textContent,/και οι επτά ημέρες/);
  await act(async()=>button("Προεπισκόπηση αναφοράς").click());assert.deepEqual(JSON.parse(calls.filter(c=>c.method==="POST").at(-1).body),{day:"2020-01-15",expectedVersion:1,frequency:"WEEKLY"});
  // Explicit READY metadata, missing legacy metadata and untrusted finality
  // claims must never hide the independently required financial caveat.
  for(const metadata of [{sourceReadiness:"READY",financialFinality:"PROVISIONAL",financialReconciliationComplete:false,financialLimitations:["DOCUMENT_PAYMENT_RECONCILIATION_NOT_VERIFIED","CASH_REVIEW_EXPLANATIONS_NOT_VERIFIED","PHYSICAL_CASH_AND_CONTROL_BALANCES_NOT_VERIFIED"]}, {financialFinality:"FINAL",financialReconciliationComplete:true,financialLimitations:[]}]){
   previewMetadata=metadata;await act(async()=>button("Προεπισκόπηση αναφοράς").click());
   assert.match(document.body.textContent,/Προσωρινή αναφορά ταμείων/);assert.match(document.body.textContent,/Η προεπισκόπηση δεν πιστοποιεί ολοκληρωμένη οικονομική συμφωνία/);assert.match(document.body.textContent,/Ολοκληρωμένα δεδομένα βαρδιών/);
  }
  sourceReady=false;previewMetadata={sourceReadiness:"HOLD"};await act(async()=>button("Προεπισκόπηση αναφοράς").click());
  assert.match(document.body.textContent,/Προσωρινή αναφορά ταμείων/);assert.match(document.body.textContent,/Αναμονή ολοκλήρωσης \/ ελέγχου/);assert.match(document.body.textContent,/Η τρίτη βάρδια παραμένει ανοιχτή/);assert.match(document.body.textContent,/ημέρα 2020-01-19/);assert.match(document.body.textContent,/Η προεπισκόπηση δεν πιστοποιεί ολοκληρωμένη οικονομική συμφωνία/);
  sourceReady=true;previewMetadata={};
  await change('[aria-label="Έναρξη 2ης βάρδιας"]',"16");assert.equal(button("Προεπισκόπηση αναφοράς").disabled,true);assert.doesNotMatch(document.body.textContent,/EMPLOYEE FROM A/);
  await act(async()=>button("Ανανέωση ρυθμίσεων").click());assert.equal(document.querySelector('[aria-label="Έναρξη 2ης βάρδιας"]').value,"15");
  failSave=true;await act(async()=>document.querySelector(".report-settings-confirm input").click());await act(async()=>document.querySelector("form").dispatchEvent(new dom.window.Event("submit",{bubbles:true,cancelable:true})));assert.match(document.querySelector('[role="alert"]').textContent,/άλλο παράθυρο/);failSave=false;
  holdPreview=true;await act(async()=>button("Προεπισκόπηση αναφοράς").click());assert.equal(typeof latePreview,"function");
  await render("B");await act(async()=>latePreview());assert.doesNotMatch(document.body.textContent,/EMPLOYEE FROM A/);assert.equal(document.querySelectorAll('[aria-label^="Κωδικός ταμείου"]').length,0);assert.equal(button("Προεπισκόπηση αναφοράς").disabled,true);
  holdLoad=true;await render("A");assert.equal(typeof lateLoad,"function");await render("B");await act(async()=>lateLoad());assert.equal(document.querySelectorAll('[aria-label^="Κωδικός ταμείου"]').length,0);
  assert.equal(dom.window.localStorage.length,0);assert.equal(calls.filter(c=>c.path.includes("send-email")||c.path.includes("send-preview")).length,0);
 }finally{await act(async()=>root.unmount());dom.window.close();for(const [key,descriptor] of previous){if(descriptor)Object.defineProperty(globalThis,key,descriptor);else delete globalThis[key]}}
});

test("platform mounts keyed per-store report settings without changing recipient saving or manual-send guards",async()=>{
 const ui=await readFile(new URL("../../client/src/components/platform/PlatformAdminApp.jsx",import.meta.url),"utf8"),platform=await readFile(new URL("../src/routes/platform-admin.js",import.meta.url),"utf8");
 assert.match(ui,/AutomaticReportSettingsManager key=\{`\$\{reportSettingsStore.company.id\}:\$\{reportSettingsStore.store.id\}`\}/);assert.match(ui,/onClick=\{\(\)=>setReportSettingsStore\(\{company:storeCompany,store\}\)\}/);
 assert.match(platform,/router.use\("\/companies\/:companyId\/stores\/:storeId\/report-settings",createAutomaticReportSettingsRouter\(prisma\)\)/);assert.match(platform,/CASH_CONTROL_RECHECK_REQUIRED/);assert.match(ui,/responsibleEmail:form.get\("responsibleEmail"\)/);
});
