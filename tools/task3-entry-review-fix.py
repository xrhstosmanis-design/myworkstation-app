from pathlib import Path
import hashlib,json,re,shutil,subprocess,sys
SOURCE='7634cf61764d8769c72bbf374b95f5be3037804a'
OUT=Path('/tmp/task3-entry-review-fix');OUT.mkdir(exist_ok=True)
H='client/src/components/commerce/CommerceHub.jsx'
W='client/src/components/cloud/StoreInvoiceEntry.jsx'
T='server/test/store-invoice-entry-mounted.test.mjs'
REG=['CHECKPOINTS/KAT_ACTIVE_LIST_2026-09-05.md','docs/roadmap/OPEN_WORK_TRACKER.md','docs/roadmap/PENDING_WORK.md','CHECKPOINTS/CHANGES/2026-11-05-task3-hosted-preparation-design.md']
PDF='output/pdf/MyWorkStation_Open_Work_2026-10-07.pdf'
COPY='docs/roadmap/MyWorkStation_Open_Work_2026-10-07.pdf'
E='CHECKPOINTS/EVIDENCE/task3-hosted-preparation-20261105/store-entry-review-fix.json'
def git(*args):return subprocess.check_output(['git',*args])
def original(p):return git('show',SOURCE+':'+p)
def replace(s,a,b):
 assert s.count(a)==1,repr(a)
 return s.replace(a,b,1)
def sha(b):return hashlib.sha256(b).hexdigest()
def blob(b):return hashlib.sha1(b'blob '+str(len(b)).encode()+b'\0'+b).hexdigest()
NEW_TESTS='''    await t.test("fresh entry modules ignore stale module events without remounting working state",async()=>{
      await reset();await render();await click("Πληρωμές Ιδιοκτήτη / Διαχειριστή");
      const draft=document.querySelector('[data-fixture="OwnerPaymentQuickActions.jsx"]');draft.value="preserved draft";
      await open();await settle();await click("Παλιά τιμολόγια");const first=inbox();assert.ok(first);
      localStorage.setItem("activeModules","[]");
      for(const detail of [{activeModules:[]},undefined]){
        const before=calls.filter(c=>c.url==="/api/license/current").length;
        await emit("myworkstation:modules-updated",detail);await emit("focus");
        assert.ok(calls.filter(c=>c.url==="/api/license/current").length>=before+2);
        assert.equal(inbox(),first,"fresh server permission must preserve the mounted inbox");
        assert.equal(document.querySelector('[aria-label="Προβολή τιμολογίων"] button[aria-pressed="true"]').textContent,"Παλιά τιμολόγια");
        assert.equal(document.querySelector('[data-fixture="OwnerPaymentQuickActions.jsx"]'),draft);assert.equal(draft.value,"preserved draft");
      }
    });
    await t.test("late catalog response cannot overwrite freshly verified entry modules",async()=>{
      await reset();await render();let release;
      licenseResponses=[{activeModules:["DOCUMENTS"],modules:[]},new Promise(r=>{release=r})];
      await open();await settle();const first=inbox();assert.ok(first);await click("Παλιά τιμολόγια");
      await emit("focus");await act(async()=>release({activeModules:[],modules:[]}));
      assert.equal(inbox(),first,"older catalog data must not overwrite the entry's newer verification");
      assert.equal(document.querySelector('[aria-label="Προβολή τιμολογίων"] button[aria-pressed="true"]').textContent,"Παλιά τιμολόγια");
    });
    await t.test("stale granting events cannot restore a freshly revoked entry",async()=>{
      await reset();await render();await open();await settle();assert.ok(inbox());modules=[];
      await emit("myworkstation:modules-updated",{activeModules:["DOCUMENTS"]});
      assert.equal(inbox(),null);const count=calls.length;
      await emit("myworkstation:modules-updated",{activeModules:["DOCUMENTS"]});await emit("focus");await settle();
      assert.equal(inbox(),null);assert.ok(document.querySelector('[aria-label="Θυρίδα επιλεγμένου καταστήματος"] [role="alert"]'));
      assert.ok(!calls.slice(count).some(c=>c.url.includes("/documents/")));
    });
'''
step=sys.argv[1]
if step=='tests':
 for p in [H,W,T,*REG]:assert Path(p).read_bytes()==original(p),p
 s=Path(T).read_text()
 s=replace(s,'responses=[],denied=null','responses=[],licenseResponses=[],denied=null')
 s=replace(s,'if(url==="/api/license/current")return {activeModules:modules,modules:[]};','if(url==="/api/license/current")return licenseResponses.length?await licenseResponses.shift():{activeModules:modules,modules:[]};')
 s=replace(s,'modules=["DOCUMENTS"];responses=[];denied=null;','modules=["DOCUMENTS"];responses=[];licenseResponses=[];denied=null;')
 s=replace(s,'const emit=event=>act(async()=>window.dispatchEvent(new CustomEvent(event)));','const emit=(event,detail)=>act(async()=>window.dispatchEvent(new CustomEvent(event,{detail})));')
 marker='    await t.test("missing, foreign, inactive and ambiguous stores fail closed without invoice reads",async()=>{'
 s=replace(s,marker,NEW_TESTS+marker);Path(T).write_text(s)
elif step=='verify-red':
 text=(OUT/'red.tap').read_text()
 for name in ['fresh entry modules ignore stale module events without remounting working state','late catalog response cannot overwrite freshly verified entry modules']:
  assert re.search(r'not ok \d+ - '+re.escape(name),text),name
 assert 'ERR_ASSERTION' in text
 (OUT/'red-confirmed.json').write_text(json.dumps({'source':SOURCE,'expectedFailures':2,'infrastructureFailureAccepted':False},indent=2))
elif step=='fix':
 for p in [H,W]:assert Path(p).read_bytes()==original(p),p
 s=Path(H).read_text()
 s=replace(s,'initialTab="modules",initialActiveModules','initialTab="modules",verifiedActiveModules')
 s=replace(s,'  const [activeModules,setActiveModules]=useState(()=>Array.isArray(initialActiveModules)?initialActiveModules:readActive());','  const [cachedActiveModules,setActiveModules]=useState(readActive);\n  // The selected-store entry owns fresh module checks. Events/catalog reads\n  // must not replace that verified scope or remount an in-progress inbox.\n  const activeModules=Array.isArray(verifiedActiveModules)?verifiedActiveModules:cachedActiveModules;')
 Path(H).write_text(s)
 s=Path(W).read_text();s=replace(s,'initialActiveModules={entry.modules}','verifiedActiveModules={entry.modules}');Path(W).write_text(s)
elif step=='records':
 tap=(OUT/'green.tap').read_text()
 def metric(name):
  match=re.search(r'^# '+name+r' (\d+)$',tap,re.M);assert match,name
  return int(match.group(1))
 results={k:metric(k) for k in ['tests','pass','fail','cancelled','skipped']}
 assert results=={'tests':32,'pass':32,'fail':0,'cancelled':0,'skipped':0},results
 prefix='''## 05/11/2026 - INVOICE-CREDIT-HOSTED-PREP-01 / PR3672 REVIEW FIX / AWAITING NEW FULL CI AND LAB

Retained task3 owner /root and branch fix/task3-lab-preparation-20261105. Independent Codex review5783310600 of7634cf6 found P2 thread4479218877: stale module events permanently hid the newly guarded invoice view despite successful fresh entry checks. Exact original full CI42007773079 completed all five jobs successfully, but did not cover this defect; its green result does not approve this correction.

Bounded correction: StoreInvoiceEntry passes its freshly checked modules as a controlled verifiedActiveModules input. The mounted CommerceHub derives its effective modules from that input instead of stale event/cache or late catalog responses. Generic callers without the input retain their existing local module behavior. No key change/remount workaround; selected-store/session/server authority, fresh actual revocation, previous drafts, invoice reading and financial writers are unchanged.

Isolated Node20 red/green regression: two targeted assertions fail on the reviewed source; the same tests plus six focused suites pass32/32 with zero failures, cancelled or skipped tests after the correction. Coverage includes stale payload and cache events, subsequent focus rechecks, unchanged inbox/payment-form identity and archive selection, a late catalog response, and denied restoration after true fresh revocation. Raw red/green TAP and source hashes are retained by the isolated helper and the accompanying review-fix evidence. These simulated regressions are not hosted acceptance. Exact replacement native PR/main CI and separate Codex re-review remain REQUIRED; the old review thread is not declared resolved by implementation alone.

Preserve all prior registry/checkpoint bytes and peer physical-page/latency claims. No deployment during a peer latency cohort. No synthetic fixture, invoice/payment/credit/stock/fiscal business action, provider request or permission change was performed. Original pair PASS and third-member review FAIL remain protected; task3 is OPEN. Single next: publish this verified bounded candidate to the existing PR3672, then verify its exact full CI and independent re-review before any ordinary release. Checkpoint CHECKPOINTS/CHANGES/2026-11-05-task3-hosted-preparation-design.md.

'''.encode()
 records=[]
 for p in REG:
  old=original(p);assert Path(p).read_bytes()==old,p
  new=prefix+old;Path(p).write_bytes(new)
  records.append({'path':p,'oldBytes':len(old),'beforeBlob':blob(old),'afterBlob':blob(new),'preservedSuffix':new[len(prefix):]==old})
 subprocess.run([sys.executable,'docs/roadmap/generate-open-work-tracker.py'],check=True)
 shutil.copyfile(PDF,COPY)
 import fitz
 with fitz.open(PDF) as doc:
  text=' '.join(' '.join(doc[i].get_text() for i in range(min(4,len(doc)))).split())
  assert 'PR3672 REVIEW FIX' in text
  for i in sorted({0,1,2,len(doc)-1}):doc[i].get_pixmap(matrix=fitz.Matrix(1.2,1.2)).save(OUT/('page-%04d.png'%(i+1)))
  pages=len(doc)
 proof={'source':SOURCE,'independentReview':5783310600,'finding':4479218877,'originalFullCI':42007773079,'tests':results,'red':json.loads((OUT/'red-confirmed.json').read_text()),'sourceFiles':[{'path':p,'beforeBlob':blob(original(p)),'afterBlob':blob(Path(p).read_bytes())} for p in [H,W,T]],'registryHistory':records,'pdf':{'pages':pages,'sha256':sha(Path(PDF).read_bytes()),'copiesIdentical':Path(PDF).read_bytes()==Path(COPY).read_bytes(),'visualReview':'PENDING'},'newFullCI':'PENDING','independentReReview':'PENDING','deployment':'NOT EXECUTED','hostedAcceptance':'NOT TESTED','businessMutations':False}
 assert not Path(E).exists();Path(E).write_text(json.dumps(proof,indent=2)+'\n')
 allowed=[H,W,T,*REG,PDF,COPY,E]
 (OUT/'allowed.json').write_text(json.dumps(allowed,indent=2))
 for p in allowed:
  dest=OUT/p;dest.parent.mkdir(parents=True,exist_ok=True);dest.write_bytes(Path(p).read_bytes())
else:raise ValueError(step)
