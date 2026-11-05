from pathlib import Path
import base64,hashlib,json,re,shutil,subprocess,sys
SOURCE='4ba3a9868670e0958aa533bdb116d3f9b67ee54f'
BASE='f1830f3470c05741d920891159362b8f01a6a938'
MAIN='fcbf02372d57dc22f006f1fa8906b52717374380'
OUT=Path('/tmp/task3-ci-compatibility');OUT.mkdir(exist_ok=True)
PAGE='client/src/components/cloud/StoreCloudPage.jsx'
LAUNCH='client/src/components/commerce/CommerceLauncher.jsx'
REG=['CHECKPOINTS/KAT_ACTIVE_LIST_2026-09-05.md','docs/roadmap/OPEN_WORK_TRACKER.md','docs/roadmap/PENDING_WORK.md']
CHECK='CHECKPOINTS/CHANGES/2026-11-05-task3-hosted-preparation-design.md'
PDF='output/pdf/MyWorkStation_Open_Work_2026-10-07.pdf'
COPY='docs/roadmap/MyWorkStation_Open_Work_2026-10-07.pdf'
E='CHECKPOINTS/EVIDENCE/task3-hosted-preparation-20261105/store-entry-ci-compatibility.json'
TESTS=['server/test/kat-shift-reconciliation-v1.test.js','server/test/wholesale-launcher-lock.test.js','server/test/wholesale-seller-launcher.test.js','server/test/wholesale-suite-access-ui.test.js']
def git(*args):return subprocess.check_output(['git',*args])
def data(ref,p):return git('show',ref+':'+p)
def blob(b):return hashlib.sha1(b'blob '+str(len(b)).encode()+b'\0'+b).hexdigest()
def sha(b):return hashlib.sha256(b).hexdigest()
def replace(s,a,b):
 assert s.count(a)==1,repr(a)
 return s.replace(a,b,1)
def metrics(path):
 text=path.read_text();out={}
 for k in ['tests','pass','fail','cancelled','skipped']:
  m=re.search(r'^# '+k+r' (\d+)$',text,re.M);assert m,k;out[k]=int(m.group(1))
 return out
step=sys.argv[1]
if step=='verify-red':
 text=(OUT/'red.tap').read_text();m=metrics(OUT/'red.tap')
 assert m=={'tests':11,'pass':2,'fail':9,'cancelled':0,'skipped':0},m
 assert "parameter 1 is not of type 'Event'" in text and 'BackOffice exposes printable reconciliation totals and explicit alerts' in text
 for p in [PAGE,LAUNCH,*TESTS]:assert Path(p).read_bytes()==data(SOURCE,p),p
 (OUT/'red-receipt.json').write_text(json.dumps({'source':SOURCE,'metrics':m,'unchangedTests':TESTS},indent=2))
elif step=='apply':
 for p in [PAGE,LAUNCH]:assert Path(p).read_bytes()==data(SOURCE,p),p
 s=Path(PAGE).read_text()
 s=replace(s,'new CustomEvent("mws:store-invoice-entry-request"','new window.CustomEvent("mws:store-invoice-entry-request"')
 old='onClick={()=>{if(refuseCompetingCommerce())return;onOpenCommerce?onOpenCommerce():window.dispatchEvent(new CustomEvent("mws:commerce-open",{detail:{view:"products",storeId:store.id}}))}}'
 s=replace(s,old,'onClick={openCommerce}')
 marker='  const closeInvoices=()=>'
 handler='  const openCommerce=()=>{if(refuseCompetingCommerce())return;onOpenCommerce?onOpenCommerce():window.dispatchEvent(new window.CustomEvent("mws:commerce-open",{detail:{view:"products",storeId:store.id}}))};\n'
 s=replace(s,marker,handler+marker);Path(PAGE).write_text(s)
 s=Path(LAUNCH).read_text();s=replace(s,'new CustomEvent("mws:commerce-entry-request"','new window.CustomEvent("mws:commerce-entry-request"');Path(LAUNCH).write_text(s)
 subprocess.run(['git','fetch','origin',MAIN],check=True)
 own=set(git('diff','--name-only',BASE,SOURCE).decode().splitlines())
 peers=git('diff','--name-only',BASE,MAIN).decode().splitlines()
 overlap=set(peers)&own;assert overlap==set([*REG,PDF,COPY]),overlap
 for p in ['package.json','package-lock.json','server/package.json','client/package.json']:
  assert data(SOURCE,p)==data(MAIN,p),p
 for p in peers:
  if p not in overlap:
   dest=Path(p);dest.parent.mkdir(parents=True,exist_ok=True);dest.write_bytes(data(MAIN,p))
 (OUT/'peer-files.json').write_text(json.dumps(peers,indent=2))
 (OUT/'main-tree.txt').write_bytes(git('rev-parse',MAIN+'^{tree}'))
elif step=='records':
 green=metrics(OUT/'green.tap');assert green=={'tests':51,'pass':51,'fail':0,'cancelled':0,'skipped':0},green
 for p in TESTS:assert Path(p).read_bytes()==data(SOURCE,p),p
 prefix='''## 05/11/2026 - INVOICE-CREDIT-HOSTED-PREP-01 / FULL-CI COMPATIBILITY CORRECTION / AWAITING EXACT CI AND LAB

Retained task3 owner /root, existing PR3672 and source branch. Raw log bytes for failed exact CI42016014254/job127206724281 show5810 tests:5801 pass,9 fail,0cancel/skip. Artifact13412322712 SHA25605679319efa9ce66871852b17a435d4ff230e17e429e66496277f11a1e4984e9; raw log SHA2567f8eb7671e1f344324e87aab8cc0f651dca21fef8a7c1b7d13ba175731058592. An earlier connector excerpt naming mobile-chat-layout-browser.test.js/document-is-not-defined was contradicted by these bytes and the source inventory; it is NOT accepted evidence. Do not blame a peer mobile task or retry the full CI blindly.

Two bounded corrections to this page's own entry changes: construct each new cancellable navigation event with window.CustomEvent, matching the dispatch target's DOM realm; extract the existing guarded commerce-click body into openCommerce, preserving the adjacent refresh/commerce controls and unchanged guard semantics. No removal/relaxation of the legacy shift/wholesale tests, no timeout change, no event-conflict bypass, no scope/permission or financial-writer changes. The verified-module and single-workspace safeguards remain.

On unchanged4ba3a98 the four existing affected test files reproduce11 tests/2pass/9fail, including the source proximity assertion and cross-realm dispatch failures. With the correction plus the current mainfcbf023 peer state, all51 tests across ten focused files pass with0fail/cancel/skip. Original40 entry/session/module/credit regressions remain. These are isolated tests, not hosted acceptance. All test files are unchanged. Exact replacement full native PR/main CI and independent review remain required.

Latest peer Azure T01 evidence, code, manuals and numbered results are retained byte-for-byte; consumed identifiers remain protected. Shared current-main registry histories and previous task3 prefixes are preserved. No production deployment, settings change or hosted business action occurred. Actual browser navigation this continuation reached an expired Backoffice session and a separate platform-owner login screen with the previously saved Default profile; no credential inspection/guessing or auth bypass. Hosted Task3 readiness/fixture creation/consolidation remains NOT TESTED and OPEN. Single next: publish only verified scoped outputs, run exact native CI/re-review, then ordinary release and measured LAB acceptance after authenticated access is restored.

'''.encode()
 records=[]
 for p in REG:
  old=data(BASE,p);candidate=data(SOURCE,p);current=data(MAIN,p)
  assert candidate.endswith(old) and current.endswith(old),p
  own=candidate[:-len(old)];new=prefix+own+current;Path(p).write_bytes(new)
  records.append({'path':p,'mainBlob':blob(current),'outputBlob':blob(new),'preservedMainSuffix':new.endswith(current),'preservedTask3Prefix':new[len(prefix):].startswith(own)})
 assert data(MAIN,CHECK)==data(BASE,CHECK)
 Path(CHECK).write_bytes(prefix+data(SOURCE,CHECK))
 subprocess.run([sys.executable,'docs/roadmap/generate-open-work-tracker.py'],check=True);shutil.copyfile(PDF,COPY)
 import fitz
 with fitz.open(PDF) as doc:
  text=' '.join(' '.join(doc[i].get_text() for i in range(min(6,len(doc)))).split());assert 'FULL-CI COMPATIBILITY CORRECTION' in text
  for i in sorted({0,1,2,len(doc)-1}):doc[i].get_pixmap(matrix=fitz.Matrix(1.15,1.15)).save(OUT/('page-%04d.png'%(i+1)))
  pages=len(doc)
 peers=json.loads((OUT/'peer-files.json').read_text())
 protected=[]
 for p in peers:
  if p not in [*REG,PDF,COPY]:
   assert Path(p).read_bytes()==data(MAIN,p),p
   protected.append({'path':p,'blob':blob(Path(p).read_bytes())})
 proof={'source':SOURCE,'reconciledMain':MAIN,'rawLogEvidenceArtifact':13412322712,'rawLogSha256':'7f8eb7671e1f344324e87aab8cc0f651dca21fef8a7c1b7d13ba175731058592','red':json.loads((OUT/'red-receipt.json').read_text()),'green':green,'runtimeChanges':[{'path':p,'before':blob(data(SOURCE,p)),'after':blob(Path(p).read_bytes())} for p in [PAGE,LAUNCH]],'testFilesUnchanged':TESTS,'registryHistory':records,'protectedPeerFiles':protected,'pdf':{'pages':pages,'sha256':sha(Path(PDF).read_bytes()),'copiesEqual':Path(PDF).read_bytes()==Path(COPY).read_bytes(),'sampledVisualReview':'PENDING'},'fullReplacementCI':'PENDING','independentReplacementReview':'PENDING','hostedAcceptance':'NOT EXECUTED','productionMutation':False}
 assert not Path(E).exists();Path(E).write_text(json.dumps(proof,indent=2)+'\n')
 allowed=git('diff','--name-only',BASE,SOURCE).decode().splitlines()+[E]
 assert len(allowed)==15 and not any(p.startswith(('.github/','tools/')) for p in allowed)
 rows=[]
 for p in allowed:
  b=Path(p).read_bytes();dest=OUT/p;dest.parent.mkdir(parents=True,exist_ok=True);dest.write_bytes(b)
  payload=OUT/'blob-payload.json';payload.write_text(json.dumps({'content':base64.b64encode(b).decode(),'encoding':'base64'}))
  result=json.loads(subprocess.check_output(['gh','api','repos/xrhstosmanis-design/myworkstation-app/git/blobs','--method','POST','--input',str(payload)]))
  assert result['sha']==blob(b),p
  rows.append({'path':p,'mode':'100644','type':'blob','sha':result['sha']})
 payload.unlink()
 (OUT/'output-tree.json').write_text(json.dumps(rows,indent=2)+'\n')
 (OUT/'proof.json').write_text(json.dumps(proof,indent=2)+'\n')
else:raise ValueError(step)
