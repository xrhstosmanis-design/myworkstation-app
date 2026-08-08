import React,{useEffect,useState} from "react";
import {CheckCircle2,Database,ExternalLink,RefreshCw,ShieldCheck,Store,UserRoundCog,UsersRound} from "lucide-react";
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
  const sync=async()=>{setBusy(true);setError("");setResult(null);try{setResult(await request("/api/platform/kat-test/sync-from-kat",{method:"POST",body:"{}"}));await load()}catch(err){setError(err.message)}finally{setBusy(false)}};
  const storeId=status?.company?.stores?.[0]?.id||"kat-test-store",gold=status?.goldenSnapshot;
  return <div className="kat-test-shell">
    <header className="kat-test-header"><div><span>KAT TEST</span><h1>Κέντρο δοκιμών 3 ρόλων</h1><p>Απομονωμένο ψηφιακό δίδυμο του ΚΑΤ. Η βασική κατάσταση αποθηκεύεται στον server και δεν εξαρτάται από browser ή ανοιχτή σελίδα.</p></div><a href="/platform-admin"><ExternalLink/>Platform Admin</a></header>
    {error&&<div className="kat-test-alert error">{error}</div>}
    <section className="kat-test-grid">
      <article className="kat-test-card"><ShieldCheck/><div><small>Περιβάλλον</small><strong>{status?.ready?"ΕΤΟΙΜΟ":"ΔΕΝ ΕΧΕΙ ΣΤΗΘΕΙ"}</strong><span>{status?.ready?"Ξεχωριστός tenant/store":"Χρειάζεται αρχική δημιουργία"}</span></div></article>
      <article className="kat-test-card"><UsersRound/><div><small>Ρόλοι</small><strong>3</strong><span>Super Admin / Admin / Πωλητής</span></div></article>
      <article className="kat-test-card"><Database/><div><small>Golden snapshot</small><strong>{gold?"ΑΠΟΘΗΚΕΥΜΕΝΟ":"ΔΕΝ ΥΠΑΡΧΕΙ"}</strong><span>{gold?`${gold.sourceStoreName} · POS v${gold.layoutVersion} · ${gold.productCount} προϊόντα`:"Θα δημιουργηθεί από το πραγματικό ΚΑΤ"}</span></div></article>
    </section>
    <section className="kat-test-panel">
      <div className="kat-test-panel-head"><div><h2>Μόνιμο αντίγραφο ΚΑΤ</h2><p>Αντιγράφει το δημοσιευμένο POS, κατηγορίες, προϊόντα, barcodes, τιμές και stock του πραγματικού ΚΑΤ σε server-side snapshot και το επαναφέρει στο KAT TEST.</p></div><button className="secondary" onClick={sync} disabled={busy||!status?.ready}><RefreshCw/>{busy?"Συγχρονισμός…":"Συγχρονισμός από ΚΑΤ"}</button></div>
      {gold&&<div className="kat-test-alert success">Μόνιμη βάση: {gold.sourceStoreName} · POS έκδοση {gold.layoutVersion} · {gold.productCount} προϊόντα. Κλείσιμο browser ή σελίδας δεν τη διαγράφει.</div>}
    </section>
    <section className="kat-test-panel"><div className="kat-test-panel-head"><div><h2>Αρχική δημιουργία / επαναφορά KAT TEST</h2><p>Δημιουργεί τα δοκιμαστικά credentials και επαναφέρει το αποθηκευμένο golden snapshot.</p></div><button className="secondary" onClick={load} disabled={loading}><RefreshCw/>Ανανέωση</button></div>
      <form className="kat-test-form" onSubmit={bootstrap}>
        <label>Owner όνομα<input name="ownerName" defaultValue="KAT TEST Owner" required/></label><label>Owner email<input name="ownerEmail" type="email" placeholder="kat-test-owner@example.com" required/></label><label>Owner κωδικός<input name="ownerPassword" type="password" minLength="8" required/></label>
        <label>Admin όνομα<input name="adminName" defaultValue="KAT TEST Admin" required/></label><label>Admin email<input name="adminEmail" type="email" placeholder="kat-test-admin@example.com" required/></label><label>Admin κωδικός<input name="adminPassword" type="password" minLength="8" required/></label>
        <label>Πωλητής<input name="sellerName" defaultValue="KAT TEST Πωλητής" required/></label><label>PIN πωλητή<input name="sellerPin" inputMode="numeric" pattern="[0-9]{4,8}" placeholder="4-8 ψηφία" required/></label>
        <button disabled={busy}>{busy?"Δημιουργία…":"Δημιουργία / Επαναφορά KAT TEST"}</button>
      </form>
    </section>
    {status?.ready&&<section className="kat-test-panel"><h2>Άμεσες δοκιμές</h2><div className="kat-test-actions"><a className="primary" href={`/pos/${encodeURIComponent(storeId)}`}><UserRoundCog/>Άνοιγμα POS ΚΑΤ ως Πωλητής</a><a href="/platform-admin"><ShieldCheck/>Super Admin / POS Designer</a><a href="/"><ExternalLink/>Backoffice για Admin/Owner</a></div><div className="kat-test-checks"><span><CheckCircle2/>Προϊόντα & κατηγορίες</span><span><CheckCircle2/>Κουμπιά POS</span><span><CheckCircle2/>Τιμές</span><span><CheckCircle2/>Βάρδιες</span><span><CheckCircle2/>Μετρητά / κάρτα</span><span><CheckCircle2/>Δικαιώματα ρόλων</span></div>{result&&<div className="kat-test-alert success">Η ενέργεια ολοκληρώθηκε. Η κατάσταση αποθηκεύτηκε στον server.</div>}</section>}
  </div>;
}
