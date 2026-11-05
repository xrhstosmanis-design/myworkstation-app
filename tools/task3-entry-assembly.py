from pathlib import Path
import hashlib,json,subprocess,sys
SOURCE='2618f358a9d6613d6d6044cc9d9253c0c345792e'
OUT=Path('/tmp/task3-entry-candidate');OUT.mkdir(exist_ok=True)
S='client/src/components/cloud/StoreCloudPage.jsx'
H='client/src/components/commerce/CommerceHub.jsx'
W='client/src/components/cloud/StoreInvoiceEntry.jsx'
T='server/test/store-invoice-entry-mounted.test.mjs'
REG=['CHECKPOINTS/KAT_ACTIVE_LIST_2026-09-05.md','docs/roadmap/OPEN_WORK_TRACKER.md','docs/roadmap/PENDING_WORK.md']
CHECK='CHECKPOINTS/CHANGES/2026-11-05-task3-hosted-preparation-design.md'
PDF='output/pdf/MyWorkStation_Open_Work_2026-10-07.pdf'
def git(*args):return subprocess.check_output(['git',*args])
def original(p):return git('show',SOURCE+':'+p)
def replace(s,a,b):
 assert s.count(a)==1,repr(a)
 return s.replace(a,b,1)
for p in [S,H,*REG,CHECK]:assert Path(p).read_bytes()==original(p),p
s=Path(S).read_text()
s=replace(s,'import ScreenRecorderWindowLauncher','import StoreInvoiceEntry from "./StoreInvoiceEntry.jsx";\nimport ScreenRecorderWindowLauncher')
s=replace(s,'  const [toolOpen,setToolOpen]=useState("");','  const [toolOpen,setToolOpen]=useState("");\n  const [invoiceOpen,setInvoiceOpen]=useState(false);')
s=replace(s,'        {!delegated&&<ScreenRecorderWindowLauncher/>}','        {!delegated&&<button className="cloud-refresh" type="button" aria-expanded={invoiceOpen} disabled={navigationLocked} onClick={()=>{if(!navigationLocked)setInvoiceOpen(true)}}>Θυρίδα τιμολογίων καταστήματος</button>}\n        {!delegated&&<ScreenRecorderWindowLauncher/>}')
s=replace(s,'    <nav className="owner-primary-nav"','    {!delegated&&invoiceOpen&&<section aria-label="Θυρίδα επιλεγμένου καταστήματος">\n      <button className="owner-tool-close" type="button" disabled={navigationLocked} onClick={()=>{if(!navigationLocked)setInvoiceOpen(false)}}>Κλείσιμο θυρίδας τιμολογίων</button>\n      <StoreInvoiceEntry api={api} storeId={store.id}/>\n    </section>}\n\n    <nav className="owner-primary-nav"')
Path(S).write_text(s)
s=Path(H).read_text()
s=replace(s,'export default function CommerceHub({api,stores=[],activeStoreId=""}){','export default function CommerceHub({api,stores=[],activeStoreId="",initialTab="modules",initialActiveModules}){')
s=replace(s,'const [activeModules,setActiveModules]=useState(readActive);','const [activeModules,setActiveModules]=useState(()=>Array.isArray(initialActiveModules)?initialActiveModules:readActive());')
s=replace(s,'const [tab,setTab]=useState("modules");','const [tab,setTab]=useState(()=>initialTab==="documents"?"documents":"modules");')
s=replace(s,'{tab==="documents"&&<InvoiceInboxPanel','{tab==="documents"&&(initialTab!=="documents"||active.has("DOCUMENTS"))&&<InvoiceInboxPanel')
Path(H).write_text(s)
prefix='''## 05/11/2026 - INVOICE-CREDIT-HOSTED-PREP-01 / DIRECT STORE ENTRY CANDIDATE / AWAITING FULL CI AND LAB

Retained task3 owner /root; source branch fix/task3-lab-preparation-20261105. Before-source claim PR3669 merged2618f358 after normal PR/main CI. This first bounded stage adds a visible invoice entry to the already selected native StoreCloudPage, using its existing session-bound API and the original CommerceHub/InvoiceInboxPanel. It does not open a replacement page or use the independently mounted CommerceLauncher. Existing product/operations entries and their owners remain unchanged.

A fresh server store list and DOCUMENTS licence are required before the invoice view mounts. Empty, foreign, inactive, ambiguous or denied scope cannot fall back to the first store. Closing/changing store cancels old entry results; focus/module changes recheck access. Parent Backoffice session invalidation still removes readers. Delegated users receive no new entry; navigation locks and existing payment form identity are preserved. No credential, permission, backend, schema, provider, money/credit writer or invoice-reading logic changes.

Focused actual-component Node20 regression suites are scheduled by an isolated helper; exact results are retained in its downloadable TAP artifact and must be independently verified. This source entry itself does not claim test success. New coverage includes real selected-store/inbox mounting, cached-module refusal, inactive/foreign scope, late/closed requests, existing session boundary, module/lifecycle revocation, no duplicate remount and GET-only LAB navigation. Full native PR/main CI, independent review, normal guarded healthy release and actual hosted navigation remain required. No new manual or numbered acceptance PASS.

Original pair PASS and third-member review FAIL remain protected. Hosted consolidation and synthetic fixture preparation remain NOT EXECUTED. No business record, payment/credit application, stock/fiscal operation, integration setting or external myDATA/OCR/AI request was submitted. This is entry stage only; readiness/fixture preparation and per-action BEFORE/AFTER/CONTROL acceptance remain OPEN. Single next: inspect focused tests and exact full source CI/review before any merge or installation. Checkpoint CHECKPOINTS/CHANGES/2026-11-05-task3-hosted-preparation-design.md.

'''.encode()
records=[]
for p in [*REG,CHECK]:
 old=original(p);new=prefix+old;Path(p).write_bytes(new)
 assert new[len(prefix):]==old
 records.append({'path':p,'beforeSha256':hashlib.sha256(old).hexdigest(),'afterSha256':hashlib.sha256(new).hexdigest(),'oldBytes':len(old),'preservedSuffix':True})
subprocess.run([sys.executable,'docs/roadmap/generate-open-work-tracker.py'],check=True)
import fitz
with fitz.open(PDF) as doc:
 first=' '.join(' '.join(doc[i].get_text() for i in range(min(3,len(doc)))).split())
 assert 'INVOICE-CREDIT-HOSTED-PREP-01 / DIRECT STORE ENTRY CANDIDATE' in first
 for i in sorted({0,1,2,len(doc)-1}):doc[i].get_pixmap(matrix=fitz.Matrix(1.2,1.2)).save(OUT/('page-%04d.png'%(i+1)))
 pages=len(doc)
allowed=[S,H,W,T,*REG,CHECK,PDF]
(OUT/'allowed.json').write_text(json.dumps(allowed,indent=2))
(OUT/'assembly-proof.json').write_text(json.dumps({'source':SOURCE,'registryHistory':records,'pdfPages':pages,'visualReview':'PENDING','hostedAcceptance':'NOT EXECUTED','applicationBusinessMutations':False},indent=2))
for p in allowed:
 dest=OUT/p;dest.parent.mkdir(parents=True,exist_ok=True);dest.write_bytes(Path(p).read_bytes())
