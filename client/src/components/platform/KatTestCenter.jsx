import React,{useEffect,useState} from "react";
import {CheckCircle2,Database,ExternalLink,RefreshCw,ShieldCheck,UserRoundCog,UsersRound} from "lucide-react";
import "./kat-test-center.css";

async function request(path,options={}){
  const token=localStorage.getItem("token");
  const response=await fetch(path,{...options,headers:{"Content-Type":"application/json",...(token?{Authorization:`Bearer ${token}`}:{}) ,...(options.headers||{})}});
  const text=await response.text();let data={};if(text){try{data=JSON.parse(text)}catch{data={error:"Ο server επέστρεψε μη αναμενόμενη απάντηση."}}}
  if(!response.ok)throw new Error(data.error||`Σφάλμα ${response.status}`);return data;
}

export default function KatTestCenter(){
  const [status,setStatus]=useState(null),[loading,setLoading]=useState(true),[busy,setBusy]=useState(false),[error,setError]=useState(""),[result,setResult]=useState(null);
  const load=async()=>{setLoading(true);setError("");try{setStatus(await request("/api/platform/kat-test/status"))}catch(err){setError(err.message)}finally{setLoading(false)}};
  useEffect(()=>{load()},[]);
  const bootstrap=async event=>{event.preventDefault();setBusy(true);setError("");setResult(null);const body=Object.fromEntries(new FormData(event.currentTarget).entries());try{setResult(await request("/api/platform/kat-test/bootstrap",{method:"POST",body:JSON.stringify(body)}));await load()}catch(err){setError(err.message)}finally{setBusy(false)}};
  const saveState=async()=>{setBusy(true);setError("");setResult(null);try{setResult(await request("/api/platform/kat-test/save-state",{method:"POST",body:"{}"}));await load()}catch(err){setError(err.message)}finally{setBusy(false)}};
  const storeId=status?.company?.stores?.[0]?.id||"kat-test-store",snapshot=status?.testSnapshot;
  return <div className="kat-test-shell">
    <header className="kat-test-header"><div><span>TEST</span><h1>Μόνιμο περιβάλλον ανάπτυξης</h1><p>Εδώ χτίζουμε και ελέγχουμε το MyWorkStation μέχρι να γίνει η τελική εμπορική έκδοση. Δεν αντιστοιχεί σε πραγματικό κατάστημα και δεν επαναφέρεται από την αρχή.</p></div><a href="/platform-admin"><ExternalLink/>Platform Admin</a></header>
    {error&&<div className="kat-test-alert error">{error}</div>}
    <section className="kat-test-grid">
      <article className="kat-test-card"><ShieldCheck/><div><small>Περιβάλλον</small><strong>{status?.ready?"TEST ΕΤΟΙΜΟ":"ΔΕΝ ΕΧΕΙ ΣΤΗΘΕΙ"}</strong><span>{status?.ready?"Μόνιμο tenant/store ανάπτυξης":"Χρειάζεται αρχική δημιουργία"}</span></div></article>
      <article className="kat-test-card"><UsersRound/><div><small>Ρόλοι δοκιμής</small><strong>3</strong><span>Super Admin / Admin / Πωλητής</span></div></article>
      <article className="kat-test-card"><Database/><div><small>Τελευταίο snapshot</small><strong>{snapshot?"ΑΠΟΘΗΚΕΥΜΕΝΟ":"ΧΩΡΙΣ SNAPSHOT"}</strong><span>{snapshot?`POS v${snapshot.layoutVersion} · ${snapshot.productCount} προϊόντα`:"Η ενεργή κατάσταση παραμένει στη βάση TEST"}</span></div></article>
    </section>
    <section className="kat-test-panel">
      <div className="kat-test-panel-head"><div><h2>Μόνιμη κατάσταση TEST</h2><p>Πριν από σημαντικές αλλαγές αποθηκεύουμε snapshot του υπάρχοντος POS, προϊόντων, κατηγοριών, barcodes, τιμών και stock. Η καθημερινή δουλειά συνεχίζει πάνω στην ίδια βάση.</p></div><button className="secondary" onClick={saveState} disabled={busy||!status?.ready}><Database/>{busy?"Αποθήκευση…":"Αποθήκευση snapshot"}</button></div>
      {snapshot&&<div className="kat-test-alert success">Τελευταίο snapshot: POS έκδοση {snapshot.layoutVersion} · {snapshot.productCount} προϊόντα. Το κλείσιμο browser ή η αλλαγή υπολογιστή δεν διαγράφει το TEST.</div>}
    </section>
    <section className="kat-test-panel"><div className="kat-test-panel-head"><div><h2>Χρήστες TEST</h2><p>Δημιουργεί ή ενημερώνει τα δοκιμαστικά credentials χωρίς να διαγράφει προϊόντα, POS layout ή την υπάρχουσα εμπορική κατάσταση.</p></div><button className="secondary" onClick={load} disabled={loading}><RefreshCw/>Ανανέωση</button></div>
      <form className="kat-test-form" onSubmit={bootstrap}>
        <label>Owner όνομα<input name="ownerName" defaultValue="TEST Owner" required/></label><label>Owner email<input name="ownerEmail" type="email" placeholder="test-owner@example.com" required/></label><label>Owner κωδικός<input name="ownerPassword" type="password" minLength="8" required/></label>
        <label>Admin όνομα<input name="adminName" defaultValue="TEST Admin" required/></label><label>Admin email<input name="adminEmail" type="email" placeholder="test-admin@example.com" required/></label><label>Admin κωδικός<input name="adminPassword" type="password" minLength="8" required/></label>
        <label>Πωλητής<input name="sellerName" defaultValue="TEST Πωλητής" required/></label><label>PIN πωλητή<input name="sellerPin" inputMode="numeric" pattern="[0-9]{4,8}" placeholder="4-8 ψηφία" required/></label>
        <button disabled={busy}>{busy?"Αποθήκευση…":"Δημιουργία / ενημέρωση χρηστών TEST"}</button>
      </form>
    </section>
    {status?.ready&&<section className="kat-test-panel"><h2>Άμεσες δοκιμές</h2><div className="kat-test-actions"><a className="primary" href={`/pos/${encodeURIComponent(storeId)}`}><UserRoundCog/>Άνοιγμα TEST POS ως Πωλητής</a><a href="/platform-admin"><ShieldCheck/>Super Admin / POS Designer</a><a href="/"><ExternalLink/>Backoffice για Admin/Owner</a></div><div className="kat-test-checks"><span><CheckCircle2/>Προϊόντα & κατηγορίες</span><span><CheckCircle2/>Κουμπιά POS</span><span><CheckCircle2/>Τιμές</span><span><CheckCircle2/>Βάρδιες</span><span><CheckCircle2/>Μετρητά / κάρτα</span><span><CheckCircle2/>Δικαιώματα ρόλων</span></div>{result&&<div className="kat-test-alert success">Η ενέργεια ολοκληρώθηκε. Συνεχίζουμε πάνω στην ίδια κατάσταση TEST.</div>}</section>}
  </div>;
}
