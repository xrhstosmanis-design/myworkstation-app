from pathlib import Path
import subprocess

expected={"client/src/components/platform/PlatformAdminApp.jsx":"f1540a642ada6e160d7810dc31feab9b1a74b4c1","server/test/ai-command-twin-navigation-ui.test.js":"eafc1b0c113f6f6329e15e0a58541e3a3966bc40"}
for path,sha in expected.items():
    actual=subprocess.check_output(['git','hash-object',path],text=True).strip()
    if actual!=sha:raise RuntimeError(f'{path}: source changed; stop for review')

def replace_once(path,old,new):
    p=Path(path);s=p.read_text()
    if s.count(old)!=1:raise RuntimeError(f'{path}: expected exactly one source anchor, found {s.count(old)}')
    p.write_text(s.replace(old,new))

replace_once('client/src/components/platform/PlatformAdminApp.jsx',
'''<label>Κατάστημα<select value={scopeFor("cash")?.storeId||cashStoreId} disabled={Boolean(scopeFor("cash"))} onChange={event=>{cashLoadSequence.current++;setCashStoreId(event.target.value)}}>{!scopeFor("cash")&&<option value="">Όλα τα καταστήματα</option>}{(data?.companies||[]).flatMap(company=>company.stores.map(store=><option key={store.id} value={store.id}>{store.name}</option>))}</select></label>''',
'''{scopeFor("cash")?<label>Κατάστημα<select value={scopeFor("cash").storeId} disabled><option value={scopeFor("cash").storeId}>{twinContext?.store.name||"Μη διαθέσιμο κατάστημα"}</option></select></label>:<label>Κατάστημα<select value={cashStoreId} onChange={event=>{cashLoadSequence.current++;setCashStoreId(event.target.value)}}><option value="">Όλα τα καταστήματα</option>{(data?.companies||[]).flatMap(company=>company.stores.map(store=><option key={store.id} value={store.id}>{store.name}</option>))}</select></label>}''')
replace_once('client/src/components/platform/PlatformAdminApp.jsx',
'''{analyticsResult?.page&&<SuperAdminChecksAnalytics key={scopeFor("checks")?twinScopeKey(aiTwinOrigin):"central"} entryScope={scopeFor("checks")} embedded companies={scopeFor("checks")?twinCompanies:data?.companies||[]} request={requestFor("checks")} onClose={()=>{setAnalyticsResult(null);returnFromTwin("checks")}} setMessage={setMessage}/>}''',
'''{scopeFor("checks")?analyticsResult?.page&&<SuperAdminChecksAnalytics key={twinScopeKey(aiTwinOrigin)} entryScope={scopeFor("checks")} embedded companies={twinCompanies} request={requestFor("checks")} onClose={()=>{setAnalyticsResult(null);returnFromTwin("checks")}} setMessage={setMessage}/>:analyticsResult?.page&&<SuperAdminChecksAnalytics embedded companies={data?.companies||[]} request={request} onClose={()=>setAnalyticsResult(null)} setMessage={setMessage}/>}''')
replace_once('server/test/ai-command-twin-navigation-ui.test.js',
'''const s=document.querySelector(".cash-report-filters select");assert.equal(s.value,"store-b");assert.ok(s.disabled);''',
'''const s=document.querySelector(".cash-report-filters select");assert.equal(s.value,"store-b");assert.ok(s.disabled);assert.deepEqual([...s.options].map(o=>o.value),["store-b"]);''')
replace_once('server/test/ai-command-twin-navigation-ui.test.js',
'''   await press(document.querySelector(".cash-report-dialog .modal-close"));assert.equal(document.querySelector(".ai-command-page"),null);await open();returned();''',
'''   const s=document.querySelector(".cash-report-filters select");assert.deepEqual([...s.options].map(o=>o.value),["","store-a","store-b"]);
   await act(async()=>{s.value="store-a";s.dispatchEvent(new window.Event("change",{bubbles:true}))});await press(button(".cash-report-filters button","Εμφάνιση"));
   assert.equal(calls.findLast(c=>c.p==="/api/platform/cash-control/daily").query.get("storeId"),"store-a");
   await act(async()=>{s.value="";s.dispatchEvent(new window.Event("change",{bubbles:true}))});await press(button(".cash-report-filters button","Εμφάνιση"));
   assert.equal(calls.findLast(c=>c.p==="/api/platform/cash-control/daily").query.has("storeId"),false);
   await press(document.querySelector(".cash-report-dialog .modal-close"));assert.equal(document.querySelector(".ai-command-page"),null);await open();returned();''')
replace_once('server/test/ai-command-twin-navigation-ui.test.js',
'''  await t.test("Central Workforce retains all stores, switches scoped data and closes normally",async()=>{''',
'''  await t.test("Central Checks retains selectable scope, explicit all-store execution and ordinary close",async()=>{
   await close();await press(button(".platform-action-group button","Κέντρο Ελέγχων"));
   const selects=[...document.querySelectorAll(".sa-checks-filters select")];assert.deepEqual(selects.map(s=>s.value),["",""]);assert.ok(selects.every(s=>!s.disabled));
   assert.deepEqual([...selects[0].options].map(o=>o.value),["","company-a","company-b"]);
   assert.deepEqual([...selects[1].options].map(o=>o.value),["","store-a","store-b"]);
   await act(async()=>{selects[0].value="company-b";selects[0].dispatchEvent(new window.Event("change",{bubbles:true}))});
   await act(async()=>{selects[1].value="store-b";selects[1].dispatchEvent(new window.Event("change",{bubbles:true}))});
   const since=calls.length;await press(button(".sa-filter-actions button","Εκτέλεση ελέγχου"));
   scoped(since,["/api/platform/super-admin-analytics/execute","/api/transactions/bank-ledger/summary","/api/transactions/bank-ledger/review","/api/transactions/supplier-settlements/review","/api/transactions/other-expenses/review"]);
   await press(button(".sa-filter-actions button","Καθαρισμός"));assert.deepEqual(selects.map(s=>s.value),["",""]);
   const allSince=calls.length;await press(button(".sa-filter-actions button","Εκτέλεση ελέγχου"));
   assert.deepEqual(calls.findLast(c=>c.p==="/api/platform/super-admin-analytics/execute").body,{});
   for(const c of calls.slice(allSince).filter(c=>c.method==="GET"&&c.p.startsWith("/api/transactions/"))){assert.equal(c.query.has("storeId"),false);assert.equal(c.query.has("companyId"),false)}
   await press(document.querySelector('[aria-label="Κλείσιμο ελέγχων και αναλύσεων"]'));assert.equal(document.querySelector(".ai-command-page"),null);await open();returned();
  });
  await t.test("Central Workforce retains all stores, switches scoped data and closes normally",async()=>{''')
print('N40 bounded central/scoped entry replacements applied; no existing assertion removed.')
