from pathlib import Path
import hashlib,json,subprocess,sys,shutil
SOURCE='7851efe9889621553790fe920316c6b0a5bdbfcd'
OLD='401f6a1f5dad3a8c5f38b65ab5d7c9115b6cee6f'
CANDIDATE='6d7981ae4e4c2eb752a98d06e1b85c6903513857'
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
for ref in [SOURCE,CANDIDATE]:
 if subprocess.run(['git','cat-file','-e',ref],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL).returncode:subprocess.run(['git','fetch','origin',ref],check=True)
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
 assert Path(p).read_bytes()==candidate,p
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
 assert 'INVOICE-PHYSICAL-PAGE-DISPLAY-01' in first
 for i in sorted({0,1,2,len(doc)-1}):doc[i].get_pixmap(matrix=fitz.Matrix(1.2,1.2)).save(OUT/('page-%04d.png'%(i+1)))
 pages=len(doc)
proof={'schemaVersion':1,'baseCommit':SOURCE,'previousSourcePR':3672,'previousCandidateCommit':CANDIDATE,'sourceFiles':[{'path':p,'blob':blob(Path(p).read_bytes())} for p in CODE],'registryHistory':records,'previousFocusedRuns':[42005553465,42006172236],'tests':{'pass':29,'fail':0,'skip':0,'kind':'isolated mounted components with fake API transport; unchanged source blobs'},'pdf':{'pages':pages,'sha256':sha(Path(PDF).read_bytes()),'identicalCopies':[PDF,COPY],'visualReviewAtBuild':'PENDING'},'fullNativeCI':'REQUIRED ON RECONCILED SOURCE PR AND MAIN','independentReview':'PENDING','runtimeInstallation':'NOT SUBMITTED','hostedAcceptance':'NOT EXECUTED','businessMutationsSubmitted':False,'task3':'OPEN; retained owner /root','peerPageCountClaim':'PRESERVED; no edits to peer checkpoint, source or ownership'}
assert Path(EVIDENCE).read_bytes()==data(CANDIDATE,EVIDENCE)
Path(EVIDENCE).write_text(json.dumps(proof,indent=2)+'\n')
allowed=[*CODE,*REG,PDF,COPY,EVIDENCE]
(OUT/'allowed.json').write_text(json.dumps(allowed,indent=2))
(OUT/'staged.json').write_text(json.dumps([*REG[:3],PDF,COPY,EVIDENCE]))
(OUT/'assembly-proof.json').write_text(json.dumps(proof,indent=2))
for p in allowed:
 dest=OUT/p;dest.parent.mkdir(parents=True,exist_ok=True);dest.write_bytes(Path(p).read_bytes())
