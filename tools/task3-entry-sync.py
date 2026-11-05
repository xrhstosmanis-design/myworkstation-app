from pathlib import Path
import hashlib,json,subprocess,sys,shutil
SOURCE='401f6a1f5dad3a8c5f38b65ab5d7c9115b6cee6f'
OLD='2618f358a9d6613d6d6044cc9d9253c0c345792e'
CANDIDATE='05bbde0ea7f6d0b423418523136de826a8ebe0b3'
OUT=Path('/tmp/task3-entry-candidate');OUT.mkdir(exist_ok=True)
CODE=['client/src/components/cloud/StoreCloudPage.jsx','client/src/components/commerce/CommerceHub.jsx','client/src/components/cloud/StoreInvoiceEntry.jsx','server/test/store-invoice-entry-mounted.test.mjs']
REG=['CHECKPOINTS/KAT_ACTIVE_LIST_2026-09-05.md','docs/roadmap/OPEN_WORK_TRACKER.md','docs/roadmap/PENDING_WORK.md','CHECKPOINTS/CHANGES/2026-11-05-task3-hosted-preparation-design.md']
PDF='output/pdf/MyWorkStation_Open_Work_2026-10-07.pdf'
COPY='docs/roadmap/MyWorkStation_Open_Work_2026-10-07.pdf'
EVIDENCE='CHECKPOINTS/EVIDENCE/task3-hosted-preparation-20261105/store-entry-source.json'
def git(*args):return subprocess.check_output(['git',*args])
def data(ref,p):return git('show',ref+':'+p)
def sha(b):return hashlib.sha256(b).hexdigest()
def blob(b):return hashlib.sha1(b'blob '+str(len(b)).encode()+b'\0'+b).hexdigest()
changed=git('diff','--name-only',OLD,SOURCE).decode().splitlines()
assert all(p.startswith(('docs/','CHECKPOINTS/','output/')) for p in changed),changed
for p in CODE:assert Path(p).read_bytes()==data(CANDIDATE,p),p
prefix=None;originals={}
for p in REG:
 old=data(OLD,p);candidate=data(CANDIDATE,p)
 assert candidate.endswith(old),p
 current_prefix=candidate[:-len(old)]
 if prefix is None:prefix=current_prefix
 assert prefix==current_prefix,p
 originals[p]=data(SOURCE,p)
 assert Path(p).read_bytes()==originals[p],p
before=b'Focused actual-component Node20 regression suites are scheduled by an isolated helper; exact results are retained in its downloadable TAP artifact and must be independently verified. This source entry itself does not claim test success.'
after=b'Focused actual-component tests on Node20.20.2: 29 PASS, zero FAIL/SKIP in isolated run42005553465; downloaded artifact13404727960 SHA256 5a89756d97ef859b1330589e215399db39027dc830fb48046dd0898f867e4e1a independently verified. Four source/test output blobs are unchanged during reconciliation onto documentation-only main401f6a1 (peer I result preserved). These are simulated component regressions, not hosted acceptance. Exact final native source PR/main CI and independent review remain required.'
assert prefix.count(before)==1
prefix=prefix.replace(before,after)
records=[]
for p,old in originals.items():
 new=prefix+old;Path(p).write_bytes(new);assert new[len(prefix):]==old
 records.append({'path':p,'beforeBlob':blob(old),'afterBlob':blob(new),'oldBytes':len(old),'preservedSuffix':True})
subprocess.run([sys.executable,'docs/roadmap/generate-open-work-tracker.py'],check=True)
shutil.copyfile(PDF,COPY)
import fitz
with fitz.open(PDF) as doc:
 first=' '.join(' '.join(doc[i].get_text() for i in range(min(4,len(doc)))).split())
 assert 'INVOICE-CREDIT-HOSTED-PREP-01 / DIRECT STORE ENTRY CANDIDATE' in first
 assert 'I MEASURED' in first
 for i in sorted({0,1,2,len(doc)-1}):doc[i].get_pixmap(matrix=fitz.Matrix(1.2,1.2)).save(OUT/('page-%04d.png'%(i+1)))
 pages=len(doc)
proof={'schemaVersion':1,'baseCommit':SOURCE,'previousCandidateCommit':CANDIDATE,'sourceFiles':[{'path':p,'blob':blob(Path(p).read_bytes())} for p in CODE],'registryHistory':records,'previousFocusedRun':42005553465,'tests':{'pass':29,'fail':0,'skip':0,'kind':'isolated mounted components with fake API transport'},'pdf':{'pages':pages,'sha256':sha(Path(PDF).read_bytes()),'identicalCopies':[PDF,COPY],'visualReviewAtBuild':'PENDING'},'fullNativeCI':'REQUIRED ON SOURCE PR AND MAIN','independentReview':'PENDING','runtimeInstallation':'NOT SUBMITTED','hostedAcceptance':'NOT EXECUTED','businessMutationsSubmitted':False,'task3':'OPEN; retained owner /root'}
assert not Path(EVIDENCE).exists()
Path(EVIDENCE).parent.mkdir(parents=True,exist_ok=True)
Path(EVIDENCE).write_text(json.dumps(proof,indent=2)+'\n')
allowed=[*CODE,*REG,PDF,COPY,EVIDENCE]
(OUT/'allowed.json').write_text(json.dumps(allowed,indent=2))
(OUT/'staged.json').write_text(json.dumps([*REG,PDF,COPY,EVIDENCE]))
(OUT/'assembly-proof.json').write_text(json.dumps(proof,indent=2))
for p in allowed:
 dest=OUT/p;dest.parent.mkdir(parents=True,exist_ok=True);dest.write_bytes(Path(p).read_bytes())
