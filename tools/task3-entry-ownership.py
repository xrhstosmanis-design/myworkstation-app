from pathlib import Path
import hashlib,json,re,shutil,subprocess,sys
SOURCE='b465ac68436e43bc6d6ecff7703165481052d29d'
OUT=Path('/tmp/task3-entry-ownership');OUT.mkdir(exist_ok=True)
PAGE='client/src/components/cloud/StoreCloudPage.jsx'
LAUNCH='client/src/components/commerce/CommerceLauncher.jsx'
TEST='server/test/store-invoice-entry-mounted.test.mjs'
REG=['CHECKPOINTS/KAT_ACTIVE_LIST_2026-09-05.md','docs/roadmap/OPEN_WORK_TRACKER.md','docs/roadmap/PENDING_WORK.md','CHECKPOINTS/CHANGES/2026-11-05-task3-hosted-preparation-design.md']
PDF='output/pdf/MyWorkStation_Open_Work_2026-10-07.pdf';COPY='docs/roadmap/MyWorkStation_Open_Work_2026-10-07.pdf'
EVIDENCE='CHECKPOINTS/EVIDENCE/task3-hosted-preparation-20261105/store-entry-ownership.json'
def git(*args):return subprocess.check_output(['git',*args])
def original(p):return git('show',SOURCE+':'+p)
def replace(s,a,b):
 assert s.count(a)==1,repr(a)
 return s.replace(a,b,1)
def blob(b):return hashlib.sha1(b'blob '+str(len(b)).encode()+b'\0'+b).hexdigest()
NEW_TESTS=r'''    const launcherOpen=()=>emit("mws:commerce-open",{view:"operations",storeId:"B"});
    const allButtons=host=>{assert.ok(host,"active hub");for(const selector of ["[data-purchase-orders-launch]","[data-supplier-control-launch]","[data-customer-control-launch]","[data-price-catalog-launch]"])assert.ok(host.querySelector(selector),selector)};
    const closeLauncher=()=>act(async()=>{const b=document.querySelector('.commerce-overlay button[title="Κλείσιμο"]');assert.ok(b);assert.equal(b.disabled,false);b.click()});
    await t.test("embedded inbox refuses a second launcher hub and explicit close restores native installers",async()=>{
      await reset();await render();await click("Πληρωμές Ιδιοκτήτη / Διαχειριστή");const payment=document.querySelector('[data-fixture="OwnerPaymentQuickActions.jsx"]');payment.value="untouched payment draft";
      await open();await settle();const first=inbox();allButtons(document.querySelector(".commerce-hub"));await launcherOpen();await settle();
      assert.equal(document.querySelectorAll(".commerce-hub").length,1,"must not mount two native commerce hubs");assert.equal(document.querySelector(".commerce-overlay"),null,"existing inbox must refuse competing launcher");assert.equal(inbox(),first);assert.match(document.querySelector('[role="alert"]').textContent,/Κλείσε πρώτα/);
      await close();await launcherOpen();await settle();assert.equal(inbox(),null);assert.equal(document.querySelectorAll(".commerce-hub").length,1);allButtons(document.querySelector(".commerce-overlay .commerce-hub"));
      assert.equal(document.querySelector('[data-fixture="OwnerPaymentQuickActions.jsx"]'),payment);assert.equal(payment.value,"untouched payment draft");
    });
    await t.test("existing launcher refuses embedded entry without discarding its mounted state",async()=>{
      await reset();await render();await launcherOpen();await settle();const first=document.querySelector(".commerce-overlay .commerce-hub");allButtons(first);await open();await settle();
      assert.equal(document.querySelector('[aria-label="Θυρίδα επιλεγμένου καταστήματος"]'),null,"existing launcher owns the workspace");assert.equal(document.querySelectorAll(".commerce-hub").length,1);assert.equal(document.querySelector(".commerce-overlay .commerce-hub"),first);assert.match(document.querySelector('[role="alert"]').textContent,/Κλείσε πρώτα/);
      await closeLauncher();await open();await settle();assert.ok(inbox());allButtons(document.querySelector(".commerce-hub"));assert.equal(document.querySelectorAll(".commerce-hub").length,1);
    });
    await t.test("minimized launcher still owns its workspace until explicit close",async()=>{
      await reset();await render();await launcherOpen();await settle();await act(async()=>document.querySelector('.commerce-overlay button[title="Ελαχιστοποίηση"]').click());
      assert.ok(document.querySelector(".commerce-overlay.window-minimized"));await open();await settle();assert.equal(inbox(),null);assert.equal(document.querySelector('[aria-label="Θυρίδα επιλεγμένου καταστήματος"]'),null);
      await closeLauncher();await open();await settle();assert.ok(inbox());
    });
    await t.test("pending launcher preflight reserves ownership before a hub exists",async()=>{
      await reset();await render();let release;responses=[new Promise(r=>{release=r})];await launcherOpen();const count=calls.filter(c=>c.url==="/api/stores").length;await open();
      assert.equal(document.querySelector('[aria-label="Θυρίδα επιλεγμένου καταστήματος"]'),null);assert.equal(calls.filter(c=>c.url==="/api/stores").length,count,"refused entry must not start another preflight");
      await act(async()=>release(stores));await settle();assert.equal(document.querySelectorAll(".commerce-hub").length,1);allButtons(document.querySelector(".commerce-overlay .commerce-hub"));
    });
    await t.test("pending embedded preflight reserves ownership and closed late results cannot remount",async()=>{
      await reset();await render();let release;responses=[new Promise(r=>{release=r})];await open();const count=calls.filter(c=>c.url==="/api/stores").length;await launcherOpen();
      assert.equal(document.querySelector(".commerce-overlay"),null);assert.equal(calls.filter(c=>c.url==="/api/stores").length,count);await close();await launcherOpen();await settle();
      await act(async()=>release(stores));await settle();assert.equal(inbox(),null);assert.equal(document.querySelectorAll(".commerce-hub").length,1);allButtons(document.querySelector(".commerce-overlay .commerce-hub"));
    });
    await t.test("same-turn opposite opening requests cannot claim two workspaces",async()=>{
      for(const invoiceFirst of [true,false]){await reset();await render();await act(async()=>{const generic=()=>window.dispatchEvent(new CustomEvent("mws:commerce-open",{detail:{view:"operations",storeId:"B"}}));if(invoiceFirst){button("Θυρίδα τιμολογίων καταστήματος").click();generic()}else{generic();button("Θυρίδα τιμολογίων καταστήματος").click()}});await settle();
        assert.equal(document.querySelectorAll(".commerce-hub").length,1,"first accepted request reserves the only native hub");assert.equal(Boolean(inbox()),invoiceFirst);assert.equal(Boolean(document.querySelector(".commerce-overlay")),!invoiceFirst);
      }
    });
    await t.test("native commerce callback and navigation lock preserve the current embedded inbox",async()=>{
      await reset();let nativeCalls=0;await render("B",{onOpenCommerce:()=>nativeCalls++});await open();await settle();const first=inbox();await click("Εμπορική λειτουργία");assert.equal(nativeCalls,0);assert.equal(inbox(),first);
      await render("B",{navigationLocked:true,onOpenCommerce:()=>nativeCalls++});await launcherOpen();assert.equal(document.querySelector(".commerce-overlay"),null);assert.equal(inbox(),first);
      await render("B",{onOpenCommerce:()=>nativeCalls++});await close();await click("Εμπορική λειτουργία");assert.equal(nativeCalls,1);
    });
    await t.test("locked wholesale fixture is never replaced by embedded invoice entry",async()=>{
      await reset();await render();await emit("mws:commerce-open",{view:"products",storeId:"B"});await settle();await click("Χονδρική B2B");await click("Lock isolated wholesale fixture");
      const draft=document.querySelector('[data-fixture="WholesaleSuiteWorkspace.jsx"]');draft.value="pending wholesale fixture";await open();await settle();assert.equal(inbox(),null);assert.equal(document.querySelector('[aria-label="Θυρίδα επιλεγμένου καταστήματος"]'),null);
      assert.equal(document.querySelector('[data-fixture="WholesaleSuiteWorkspace.jsx"]'),draft);assert.equal(draft.value,"pending wholesale fixture");assert.equal(document.querySelector('.commerce-overlay button[title="Κλείσιμο"]').disabled,true);
    });
'''
step=sys.argv[1]
if step=='tests':
 for p in [PAGE,LAUNCH,TEST,*REG]:assert Path(p).read_bytes()==original(p),p
 s=Path(TEST).read_text()
 s=replace(s,'import path from "node:path";','import path from "node:path";\nimport {readFileSync} from "node:fs";')
 s=replace(s,'"CommerceHub.jsx","InvoiceInboxPanel.jsx"','"CommerceHub.jsx","InvoiceInboxPanel.jsx","CommerceLauncher.jsx"')
 start='  const result=await build({entryPoints:[fileURLToPath(new URL("../../client/src/components/cloud/StoreCloudPage.jsx",import.meta.url))],bundle:true'
 generated=r'''  // Execute the unmodified production installer functions and their exact
  // four document-wide guards from entry.jsx. Unrelated bootstrap is omitted.
  const bootstrap=readFileSync(new URL("../../client/src/entry.jsx",import.meta.url),"utf8");
  const guards=["installPurchaseOrdersSafely","installSupplierControlSafely","installCustomerControlSafely","installPriceCatalogSafely"].map(name=>{const line=bootstrap.split("\n").find(line=>line.startsWith(`const ${name}=`));assert.ok(line,name);return line}).join("\n");
  const suites=["installPurchaseOrdersSuite","installSupplierControlSuite","installCustomerControlSuiteV2","installPriceCatalogSuite"];
  const fixtureEntry=`export {default} from "./components/cloud/StoreCloudPage.jsx";\nexport {default as Launcher} from "./components/commerce/CommerceLauncher.jsx";\n${suites.map(name=>`import {${name}} from "./components/commerce/${name}.js";`).join("\n")}\nexport function installNativeIntegrations(){${guards}\nconst install=()=>{installPurchaseOrdersSafely();installSupplierControlSafely();installCustomerControlSafely();installPriceCatalogSafely()};install();const observer=new MutationObserver(install);observer.observe(document.documentElement,{childList:true,subtree:true});return()=>observer.disconnect()}`;
  const result=await build({stdin:{contents:fixtureEntry,resolveDir:fileURLToPath(new URL("../../client/src",import.meta.url)),sourcefile:"isolated-native-entry.js",loader:"js"},bundle:true'''
 s=replace(s,start,generated)
 old='    const name=path.basename(args.path);if(keep.has(name))return;'
 new='''    const name=path.basename(args.path);if(keep.has(name))return;
    if(name==="WholesaleSuiteWorkspace.jsx")return {contents:'import React from "react";export const readWholesaleIdentity=()=>({userId:"owner",companyId:"company",role:"OWNER"});export const wholesaleIdentityKey=()=>"isolated-owner";export const wholesaleAccessEnabled=access=>access?.enabled===true;export default function Panel({onSubmissionLockChange}){return <><input data-fixture="WholesaleSuiteWorkspace.jsx"/><button onClick={()=>onSubmissionLockChange(true)}>Lock isolated wholesale fixture</button></>}',loader:"jsx"};'''
 s=replace(s,old,new)
 eval_line='  const mod={exports:{}};new Function("require","module","exports",result.outputFiles[0].text)(createRequire(import.meta.url),mod,mod.exports);\n'
 s=replace(s,eval_line,'')
 s=replace(s,"'<div id=\"root\"></div>'","'<div id=\"root\"></div><div id=\"commerce-root\"></div>'")
 s=replace(s,'"IS_REACT_ACT_ENVIRONMENT","setInterval","clearInterval"','"IS_REACT_ACT_ENVIRONMENT","setInterval","clearInterval","fetch"')
 marker='  const React=await import("react"),{act}=React,{createRoot}=await import("react-dom/client"),root=createRoot(document.getElementById("root"));'
 replacement='''  const observers=new Set(),OriginalObserver=dom.window.MutationObserver;
  dom.window.MutationObserver=class extends OriginalObserver{constructor(callback){super(callback);observers.add(this)}};
  Object.defineProperty(globalThis,"MutationObserver",{configurable:true,get:()=>dom.window.MutationObserver,set:value=>{dom.window.MutationObserver=value}});
'''+eval_line+'''  const React=await import("react"),{act}=React,{createRoot}=await import("react-dom/client"),root=createRoot(document.getElementById("root")),launcherRoot=createRoot(document.getElementById("commerce-root"));'''
 s=replace(s,marker,replacement)
 s=replace(s,'    if(url==="/api/license/current")','    if(url==="/api/wholesale/capabilities")return {enabled:true};\n    if(url==="/api/license/current")')
 s=replace(s,'  const render=async(storeId="B",extra={})','  globalThis.fetch=async(url,options={})=>{const data=await raw(url,options);return {ok:true,status:200,json:async()=>data,text:async()=>JSON.stringify(data)}};\n  const stopNative=mod.exports.installNativeIntegrations();\n  const render=async(storeId="B",extra={})')
 s=replace(s,'stopWatch();await act(async()=>root.render(null));','stopWatch();await act(async()=>{root.render(null);launcherRoot.render(null)});')
 s=replace(s,'boundary=next;stopWatch=watchBackofficeContext(boundary,window,document);','boundary=next;stopWatch=watchBackofficeContext(boundary,window,document);\n    await act(async()=>launcherRoot.render(React.createElement(mod.exports.Launcher)));')
 marker='    await t.test("all observed setup, navigation and LAB status polling stay read-only",async()=>{'
 s=replace(s,marker,NEW_TESTS+marker)
 s=replace(s,'}finally{stopWatch();await act(async()=>root.unmount());dom.window.close();','}finally{stopNative();stopWatch();await act(async()=>{root.unmount();launcherRoot.unmount()});for(const observer of observers)observer.disconnect();dom.window.close();')
 s=s.replace('// Actual selected-store page, entry, CommerceHub and InvoiceInboxPanel. Only\n// unrelated child features are replaced; transport is isolated, never hosted.','// Actual selected-store page, entry, both React roots, CommerceHub, InvoiceInboxPanel,\n// four native installer modules and exact entry.jsx guards. Unrelated child features\n// and the wholesale in-flight signal are fixtures; transport is isolated, never hosted.')
 Path(TEST).write_text(s)
elif step=='verify-red':
 text=(OUT/'red.tap').read_text()
 names=['embedded inbox refuses a second launcher hub and explicit close restores native installers','existing launcher refuses embedded entry without discarding its mounted state']
 for name in names:assert re.search(r'not ok \d+ - '+re.escape(name),text),name
 assert 'ERR_ASSERTION' in text and 'must not mount two native commerce hubs' in text
 (OUT/'red-confirmed.json').write_text(json.dumps({'source':SOURCE,'requiredAssertionFailures':names,'infrastructureFailureAccepted':False},indent=2))
elif step=='fix':
 for p in [PAGE,LAUNCH]:assert Path(p).read_bytes()==original(p),p
 s=Path(PAGE).read_text()
 s=replace(s,'  const [invoiceOpen,setInvoiceOpen]=useState(false);','''  const [invoiceOpen,setInvoiceOpen]=useState(false);
  const [invoiceEntryMessage,setInvoiceEntryMessage]=useState("");
  const invoiceOpenRef=useRef(false),invoiceRegionRef=useRef(null);
  // Native document-wide installers support one commerce workspace. Refuse a
  // competing entry rather than discarding the user's current working state.
  const refuseCompetingCommerce=()=>{
    if(!invoiceOpenRef.current&&!invoiceRegionRef.current)return false;
    setInvoiceEntryMessage("Κλείσε πρώτα τη θυρίδα τιμολογίων για να ανοίξεις την Εμπορική λειτουργία.");return true;
  };
  useEffect(()=>{
    const reserve=event=>{if(refuseCompetingCommerce())event.preventDefault()};
    window.addEventListener("mws:commerce-entry-request",reserve);
    return()=>window.removeEventListener("mws:commerce-entry-request",reserve);
  },[]);
  const openInvoices=()=>{
    if(navigationLocked||invoiceOpenRef.current)return;
    if(!window.dispatchEvent(new CustomEvent("mws:store-invoice-entry-request",{cancelable:true}))){setInvoiceEntryMessage("Κλείσε πρώτα την ανοικτή Εμπορική λειτουργία για να ανοίξεις τη θυρίδα τιμολογίων.");return}
    invoiceOpenRef.current=true;setInvoiceEntryMessage("");setInvoiceOpen(true);
  };
  const closeInvoices=()=>{if(navigationLocked)return;invoiceOpenRef.current=false;setInvoiceEntryMessage("");setInvoiceOpen(false)};''')
 s=replace(s,'onClick={()=>onOpenCommerce?onOpenCommerce():window.dispatchEvent(new CustomEvent("mws:commerce-open",{detail:{view:"products",storeId:store.id}}))}','onClick={()=>{if(refuseCompetingCommerce())return;onOpenCommerce?onOpenCommerce():window.dispatchEvent(new CustomEvent("mws:commerce-open",{detail:{view:"products",storeId:store.id}}))}}')
 s=replace(s,'onClick={()=>{if(!navigationLocked)setInvoiceOpen(true)}}','onClick={openInvoices}')
 s=replace(s,'    {!delegated&&invoiceOpen&&<section aria-label="Θυρίδα επιλεγμένου καταστήματος">','    {!delegated&&invoiceEntryMessage&&<p role="alert">{invoiceEntryMessage}</p>}\n    {!delegated&&invoiceOpen&&<section ref={invoiceRegionRef} aria-label="Θυρίδα επιλεγμένου καταστήματος">')
 s=replace(s,'onClick={()=>{if(!navigationLocked)setInvoiceOpen(false)}}','onClick={closeInvoices}')
 Path(PAGE).write_text(s)
 s=Path(LAUNCH).read_text()
 s=replace(s,'  const visibleRef=useRef(false);','  const visibleRef=useRef(false),workspaceElementRef=useRef(null);')
 s=replace(s,'    visibleRef.current=true;refreshWholesaleAccess();','    if(!window.dispatchEvent(new CustomEvent("mws:commerce-entry-request",{cancelable:true})))return;\n    visibleRef.current=true;refreshWholesaleAccess();')
 s=replace(s,'    window.addEventListener("mws:commerce-open",handleOpen);\n    return()=>window.removeEventListener("mws:commerce-open",handleOpen);','''    const reserveWorkspace=event=>{if(visibleRef.current||workspaceElementRef.current)event.preventDefault()};
    window.addEventListener("mws:commerce-open",handleOpen);
    window.addEventListener("mws:store-invoice-entry-request",reserveWorkspace);
    return()=>{window.removeEventListener("mws:commerce-open",handleOpen);window.removeEventListener("mws:store-invoice-entry-request",reserveWorkspace)};''')
 s=replace(s,'{visible&&<div className={`commerce-overlay','{visible&&<div ref={workspaceElementRef} className={`commerce-overlay')
 Path(LAUNCH).write_text(s)
elif step=='records':
 tap=(OUT/'green.tap').read_text();results={}
 for key in ['tests','pass','fail','cancelled','skipped']:
  match=re.search(r'^# '+key+r' (\d+)$',tap,re.M);assert match,key;results[key]=int(match.group(1))
 assert results['pass']==results['tests'] and results['pass']>=40 and all(results[k]==0 for k in ['fail','cancelled','skipped']),results
 prefix=('''## 05/11/2026 - INVOICE-CREDIT-HOSTED-PREP-01 / SECOND P2 OWNERSHIP CORRECTION / AWAITING NEW CI AND REVIEW

Retained task3 owner /root and existing PR3672. Full native CI42011116582 passed all five jobs for b465ac6, and independent receipt6655731621 reported no major issues on that exact head. However a complete review-thread inventory revealed second original P2 thread4479218886, previously missed in the truncated discussion: embedded and legacy CommerceHub roots could coexist while the native installers/event routing assume one document-wide hub. This concrete unaddressed finding overrides an inference of clean acceptance from that generic review receipt. PR remains DRAFT; no merge or release was performed.

Bounded correction uses cancellable navigation-intent handshakes between the existing store entry and original CommerceLauncher. The first accepted open reserves its workspace synchronously, including during preflight. A second entry is refused with a visible instruction to close the current workspace first; it does not forcibly close or remount working invoice/payment/wholesale state. Minimized or closing launcher DOM remains reserved until it is actually gone. Store-native callback cannot bypass the entry guard. Existing role/session/fresh module/store checks and wholesale submission locks remain authoritative. No bootstrap installer, business writer, provider or permission change.

Isolated Node20 red/green: the same strengthened mounted test first reproduces the original simultaneous-hub and reverse-entry assertion failures on unchanged b465ac6. After the bounded correction, PASS_COUNT focused tests pass with zero fail/cancel/skip. The test now mounts both actual React entry roots, actual CommerceHub/InvoiceInboxPanel and four real installer modules with their exact unmodified entry.jsx guards. It covers both entry orders, explicit-close recovery with native buttons, minimized and pending entries, same-turn requests, late closed results, native callback/navigation locks and a simulated unrelated wholesale in-flight lock. Transport and unrelated child panels remain isolated fixtures; this is not hosted or financial acceptance.

The old module-state correction and its red-green regressions remain intact. All previous registry/checkpoint bytes are preserved exactly, including peer R01-R05 measurements and physical-page ownership. No consumed sample is replayed. No fixture preparation, invoice submission, consolidation, payment/credit/stock/fiscal mutation, provider call or deployment. Original pair PASS and third-member review FAIL remain protected; task3 stays OPEN. Single next: independently inspect raw results/output blobs, publish only bounded candidate outputs to existing PR3672, then require new exact full CI and separate review of BOTH original P2 findings before ordinary integration/release. Checkpoint CHECKPOINTS/CHANGES/2026-11-05-task3-hosted-preparation-design.md.

'''.replace('PASS_COUNT',str(results['pass']))).encode()
 history=[]
 for p in REG:
  old=original(p);assert Path(p).read_bytes()==old,p;new=prefix+old;Path(p).write_bytes(new);history.append({'path':p,'beforeBlob':blob(old),'afterBlob':blob(new),'preservedSuffix':new[len(prefix):]==old,'priorBytes':len(old)})
 subprocess.run([sys.executable,'docs/roadmap/generate-open-work-tracker.py'],check=True);shutil.copyfile(PDF,COPY)
 import fitz
 with fitz.open(PDF) as doc:
  text=' '.join(' '.join(doc[i].get_text() for i in range(min(4,len(doc)))).split());assert 'SECOND P2 OWNERSHIP CORRECTION' in text
  for i in sorted({0,1,2,len(doc)-1}):doc[i].get_pixmap(matrix=fitz.Matrix(1.2,1.2)).save(OUT/('page-%04d.png'%(i+1)))
  pages=len(doc)
 proof={'source':SOURCE,'finding':4479218886,'previousExactFullCI':42011116582,'previousIndependentReceipt':6655731621,'red':json.loads((OUT/'red-confirmed.json').read_text()),'tests':results,'sourceFiles':[{'path':p,'beforeBlob':blob(original(p)),'afterBlob':blob(Path(p).read_bytes())} for p in [PAGE,LAUNCH,TEST]],'registryHistory':history,'pdf':{'pages':pages,'sha256':hashlib.sha256(Path(PDF).read_bytes()).hexdigest(),'copiesIdentical':Path(PDF).read_bytes()==Path(COPY).read_bytes(),'visualReview':'PENDING'},'replacementFullCI':'PENDING','independentReview':'PENDING','deployment':'NOT EXECUTED','hostedAcceptance':'NOT TESTED','businessMutations':False}
 assert not Path(EVIDENCE).exists();Path(EVIDENCE).write_text(json.dumps(proof,indent=2)+'\n')
 allowed=[PAGE,LAUNCH,TEST,*REG,PDF,COPY,EVIDENCE];(OUT/'allowed.json').write_text(json.dumps(allowed,indent=2))
 for p in allowed:
  dest=OUT/p;dest.parent.mkdir(parents=True,exist_ok=True);dest.write_bytes(Path(p).read_bytes())
else:raise ValueError(step)
