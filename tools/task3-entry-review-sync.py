from pathlib import Path
import hashlib,json,shutil,subprocess,sys
BASE='3b33cc2998dc366cc44f9bd9e65dadf77a343651'
MAIN='27b756ef28fe417ede7bdf122fab183214e8cb85'
FIX='bee87b99e1357b77b9de31134ffb79611fcf14f0'
OUT=Path('/tmp/task3-entry-review-sync');OUT.mkdir(exist_ok=True)
CODE=['client/src/components/cloud/StoreCloudPage.jsx','client/src/components/commerce/CommerceHub.jsx','client/src/components/cloud/StoreInvoiceEntry.jsx','server/test/store-invoice-entry-mounted.test.mjs']
REG=['CHECKPOINTS/KAT_ACTIVE_LIST_2026-09-05.md','docs/roadmap/OPEN_WORK_TRACKER.md','docs/roadmap/PENDING_WORK.md']
CHECK='CHECKPOINTS/CHANGES/2026-11-05-task3-hosted-preparation-design.md'
E='CHECKPOINTS/EVIDENCE/task3-hosted-preparation-20261105/store-entry-review-fix.json'
OLD_E='CHECKPOINTS/EVIDENCE/task3-hosted-preparation-20261105/store-entry-source.json'
PDF='output/pdf/MyWorkStation_Open_Work_2026-10-07.pdf'
COPY='docs/roadmap/MyWorkStation_Open_Work_2026-10-07.pdf'
def git(*args):return subprocess.check_output(['git',*args])
def data(ref,p):return git('show',ref+':'+p)
def blob(b):return hashlib.sha1(b'blob '+str(len(b)).encode()+b'\0'+b).hexdigest()
subprocess.run(['git','fetch','origin',MAIN],check=True)
changes=git('diff','--name-only',BASE,MAIN).decode().splitlines()
assert all(p.startswith(('CHECKPOINTS/','docs/','output/')) for p in changes),changes
for p in [*CODE,CHECK,E,OLD_E]:assert Path(p).read_bytes()==data(FIX,p),p
assert data(MAIN,CHECK)==data(BASE,CHECK)
records=[]
for p in REG:
 base=data(BASE,p);candidate=data(FIX,p);assert Path(p).read_bytes()==candidate,p
 assert candidate.endswith(base),p
 prefix=candidate[:-len(base)];current=data(MAIN,p);assert current.endswith(base),p
 new=prefix+current;Path(p).write_bytes(new)
 records.append({'path':p,'mainBeforeBlob':blob(current),'afterBlob':blob(new),'mainBytes':len(current),'preservedMainSuffix':new.endswith(current),'unchangedTask3Prefix':new[:len(prefix)]==prefix})
subprocess.run([sys.executable,'docs/roadmap/generate-open-work-tracker.py'],check=True)
shutil.copyfile(PDF,COPY)
import fitz
with fitz.open(PDF) as doc:
 text=' '.join(' '.join(doc[i].get_text() for i in range(min(6,len(doc)))).split())
 assert 'PR3672 REVIEW FIX' in text and 'R01-R05 MEASURED' in text
 for i in sorted({0,1,2,len(doc)-1}):doc[i].get_pixmap(matrix=fitz.Matrix(1.2,1.2)).save(OUT/('page-%04d.png'%(i+1)))
 pages=len(doc)
proof=json.loads(Path(E).read_text())
proof['reconciledMain']=MAIN
proof['reviewFixCandidate']=FIX
proof['peerReconciliation']=records
proof['priorRedGreenRun']=42010240985
proof['priorArtifact']={'id':13406537500,'sha256':'d28bb91b85b5118e671824b5bb5183fc07e51beecb8b5150dcb3ff9a7aa47b16','rawAssertionsAndBlobsVerified':True}
proof['unchangedRuntimeAndTestBlobs']=[{'path':p,'blob':blob(Path(p).read_bytes())} for p in CODE]
proof['pdf']={'pages':pages,'sha256':hashlib.sha256(Path(PDF).read_bytes()).hexdigest(),'copiesIdentical':Path(PDF).read_bytes()==Path(COPY).read_bytes(),'visualReview':'PENDING'}
Path(E).write_text(json.dumps(proof,indent=2)+'\n')
allowed=[*CODE,*REG,CHECK,E,OLD_E,PDF,COPY]
(OUT/'allowed.json').write_text(json.dumps(allowed,indent=2))
(OUT/'staged.json').write_text(json.dumps([*REG,E,PDF,COPY]))
(OUT/'main-tree.txt').write_bytes(git('rev-parse',MAIN+'^{tree}'))
for p in allowed:
 dest=OUT/p;dest.parent.mkdir(parents=True,exist_ok=True);dest.write_bytes(Path(p).read_bytes())
