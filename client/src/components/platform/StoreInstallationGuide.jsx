import React,{useEffect,useState} from "react";
import {RefreshCw,MonitorUp} from "lucide-react";
import RbsInstallationSetup from "./RbsInstallationSetup.jsx";

export default function StoreInstallationGuide({company,store,request,onOpenTerminals}){
  const [result,setResult]=useState(null),[error,setError]=useState(""),[busy,setBusy]=useState(false),[mode,setMode]=useState("LOCAL");
  useEffect(()=>{let current=true;setResult(null);setError("");setBusy(true);
    Promise.all([request(`/api/platform/companies/${company.id}/stores/${store.id}/pilot-readiness`),request(`/api/platform/companies/${company.id}/stores/${store.id}/installation-terminals`),request(`/api/platform/companies/${company.id}/stores/${store.id}/device-routing`)]).then(([readiness,terminals,routing])=>{if(current)setResult({readiness,terminals:terminals.terminals||[],routing})}).catch(e=>{if(current)setError(e.message)}).finally(()=>{if(current)setBusy(false)});
    return()=>{current=false};
  },[company.id,store.id,request]);
  const refresh=async()=>{setBusy(true);setError("");try{const [readiness,terminals,routing]=await Promise.all([request(`/api/platform/companies/${company.id}/stores/${store.id}/pilot-readiness`),request(`/api/platform/companies/${company.id}/stores/${store.id}/installation-terminals`),request(`/api/platform/companies/${company.id}/stores/${store.id}/device-routing`)]);setResult({readiness,terminals:terminals.terminals||[],routing})}catch(e){setError(e.message)}finally{setBusy(false)}};
  const checks=result?.readiness?.checks||[],check=key=>checks.find(row=>row.key===key),terminals=result?.terminals.filter(row=>row.active)||[];
  const fiscals=(result?.routing?.fiscalDevices||[]).filter(row=>row.active!==false),eftpos=(result?.routing?.eftposDevices||[]).filter(row=>row.active!==false);
  const mapped=terminals.length>0&&terminals.every(t=>{const f=fiscals.filter(row=>row.terminalPos===t.terminalPos);return f.length===1&&eftpos.filter(row=>row.fiscalDeviceCode===f[0].deviceCode&&row.role==="STORE").length===1});
  const rows=[
    ["1. Εταιρεία και πακέτο",check("company")?.ok&&check("store")?.ok&&check("modules")?.ok,`${check("company")?.detail||"Έλεγχος…"} · ${check("modules")?.detail||""}`,"Έλεγξε εταιρεία, ΑΦΜ και συμφωνημένα modules στην καρτέλα πελάτη. Ο βασικός έλεγχος modules δεν πιστοποιεί full πακέτο."],
    ["2. Κατάλογος και σχεδιασμός POS",check("posLayout")?.ok,check("posLayout")?.detail||"Έλεγχος…","Άνοιξε Σχεδιαστή POS και Προϊόντα για τιμές, barcode, ΦΠΑ και αρχικό απόθεμα. Η δημοσίευση διάταξης δεν πιστοποιεί όλα τα είδη."],
    ["3. Χειριστές και πρόσβαση",check("credentials")?.ok&&check("employees")?.ok,check("credentials")?.detail||"Έλεγχος…","Έλεγξε τους ενεργούς χειριστές και τα δικαιώματά τους. PIN και κωδικοί παραμένουν προσωπικοί."],
    ["4. Υπολογιστής POS",terminals.length>0,`${terminals.length} ενεργά POS${terminals.length?` · ${terminals.map(t=>t.terminalPos).join(", ")}`:""}`,"Άνοιξε Τερματικά. Το εφάπαξ link ενεργοποίησης ανοίγει στον τελικό υπολογιστή. Δεν προσθέτεις δεύτερο POS για ένα μοναδικό EFTPOS."],
    ["5. Ταμειακή και EFTPOS",mapped,`${fiscals.length} ταμειακές · ${eftpos.length} EFTPOS`,"Άνοιξε Αντιστοίχιση εξοπλισμού. Κατάστημα με ένα EFTPOS δεν χρειάζεται δεύτερη εγγραφή Delivery. Έπειτα επιβεβαίωσε τους κωδικούς πληρωμής RBS στη φόρμα παρακάτω."],
    ["6. Σύνδεση CAPDriver",false,"Απαιτείται έλεγχος στον τελικό υπολογιστή","Στο BackOffice του ίδιου καταστήματος: Σύνδεση RBS CAP Driver v1 → κωδικός ζεύξης → Pair → Test-Connection → Writer. Κωδικός 15 λεπτών. Επιβεβαίωσε WRITER ONLINE και πραγματικούς κωδικούς/ΦΠΑ πριν από πώληση."],
    ["7. Φυσική δοκιμή και παράδοση",false,"Δεν πιστοποιείται από την αποθήκευση ρυθμίσεων","Μία ελεγχόμενη απόδειξη μετρητών και μία κάρτας με πριν/μετά βάρδιας, stock και Audit. Κατέγραψε IDs και αποτέλεσμα. Μικτή CAPDriver παραμένει εκκρεμής."]
  ];
  return <section style={{background:"#f5f9fb",border:"1px solid #cbdce5",borderRadius:14,padding:18,marginTop:16}}>
    <h3>Οδηγός εγκατάστασης · {store.name}</h3><p>{company.name} · Κάθε ένδειξη αφορά μόνο αυτό το κατάστημα.</p>
    <label>Τρόπος εργασίας <select value={mode} onChange={e=>setMode(e.target.value)}><option value="LOCAL">Στον χώρο</option><option value="REMOTE">Απομακρυσμένα</option></select></label>
    {mode==="REMOTE"&&<p>Χρειάζεται εξουσιοδοτημένη πρόσβαση στον τελικό υπολογιστή και άνθρωπος στον χώρο για απόδειξη/EFTPOS. Η επιλογή αυτή δεν ανοίγει απομακρυσμένη συνεδρία.</p>}
    <button onClick={refresh} disabled={busy}><RefreshCw/> {busy?"Έλεγχος…":"Επανέλεγχος εγκατάστασης"}</button>
    {error&&<p role="alert">Δεν ολοκληρώθηκε ο έλεγχος: {error}. Οι ελλείπουσες πηγές δεν θεωρούνται έτοιμες.</p>}
    {result&&rows.map(([title,ok,detail,next])=><article key={title} style={{background:"white",padding:14,marginTop:10,borderRadius:10,borderLeft:`4px solid ${ok?"#087a52":"#d98b21"}`}}><b>{title}</b><p>{ok?"Ρύθμιση υπάρχει":"Χρειάζεται έλεγχος / ενέργεια"} · {detail}</p><p>{next}</p></article>)}
    {result&&<RbsInstallationSetup key={store.id} company={company} store={store} terminals={terminals} request={request}/>}
    <div style={{display:"flex",gap:10,flexWrap:"wrap",marginTop:14}}><button onClick={()=>onOpenTerminals(company,store,false)}><MonitorUp/> Τερματικά / Αντιστοίχιση εξοπλισμού</button><a href="https://github.com/xrhstosmanis-design/myworkstation-app/blob/main/docs/manual/pilot-installation/CAPDRIVER_TECHNICIAN.md" target="_blank" rel="noreferrer">Manual τεχνικού</a><a href="https://github.com/xrhstosmanis-design/myworkstation-app/tree/main/tools/windows-rbs-capdriver-v1" target="_blank" rel="noreferrer">Αρχεία σύνδεσης Windows</a></div>
    <p><small>Οι αποθηκευμένες ρυθμίσεις διατηρούνται στον server. Δεν στέλνεται φορολογική εντολή από αυτόν τον έλεγχο. Εκκρεμεί η φυσική δοκιμή. Ο CAPDriver της RBS και ο εξοπλισμός πρέπει να έχουν εγκατασταθεί και ρυθμιστεί στον τελικό υπολογιστή.</small></p>
  </section>;
}
