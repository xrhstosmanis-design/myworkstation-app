import React,{useState} from "react";
import {N40_FIXTURE} from "../../../../shared/n40-backoffice-fixture.mjs";
import {n40ReadHeaders} from "../../../../shared/n40-read-trace.mjs";

const company=N40_FIXTURE.companyId,store=N40_FIXTURE.storeId;
const base=`/api/platform/companies/${company}/stores/${store}`;
const probes=[
  ["POS",`/api/platform/store-modules/companies/${company}/stores/${store}/check-packages`],
  ["EFTPOS / Ταμειακές",`${base}/device-routing`],
  ["Ταμείο",`/api/platform/cash-control/daily?companyId=${company}&storeId=${store}&date=2026-10-10`],
  ["Modules προσωπικού",`/api/platform/store-modules/companies/${company}/stores/${store}`],
  ["Κάμερες",`${base}/video-connection`]
];
const scope={companyId:company,storeId:store};
const button={padding:12,cursor:"pointer"};
const field={display:"grid",gap:6,marginBottom:14};
function fixtureUser(user){return user?.email===N40_FIXTURE.email&&user?.role==="EMPLOYEE"&&user?.company?.id===company;}
async function jsonRequest(path,options={}){
  const response=await fetch(path,{...options,headers:{"Content-Type":"application/json",...options.headers}});
  const data=await response.json().catch(()=>({}));
  if(!response.ok)throw new Error(data.error||`HTTP ${response.status}`);
  return data;
}
export default function N40ReadonlyAudit(){
  // Private memory only. Never replace the owner's global Backoffice session.
  const[session,setSession]=useState(null),[fixture,setFixture]=useState(null),[busy,setBusy]=useState(false),[error,setError]=useState(""),[message,setMessage]=useState(""),[results,setResults]=useState([]);
  const[supportHistory,setSupportHistory]=useState(null);
  const platformToken=()=>localStorage.getItem("platformToken")||localStorage.getItem("token");
  const perform=async fn=>{setBusy(true);setError("");try{await fn();}catch(e){setError(e.message);}finally{setBusy(false);}};
  const readSupportHistory=()=>perform(async()=>{setSupportHistory(await jsonRequest("/api/auth/security/n40-stock-support-history",{headers:{Authorization:`Bearer ${platformToken()}`}}));});
  const inspect=()=>perform(async()=>{const data=await jsonRequest("/api/platform/n40-backoffice-fixture",{headers:{Authorization:`Bearer ${platformToken()}`}});setFixture(data);});
  const create=e=>{e.preventDefault();const form=e.currentTarget,values=new FormData(form);perform(async()=>{const data=await jsonRequest("/api/platform/n40-backoffice-fixture",{method:"POST",headers:{Authorization:`Bearer ${platformToken()}`},body:JSON.stringify({password:values.get("password"),confirmPassword:values.get("confirmPassword")})});form.reset();setFixture({exists:true,user:data.user});setMessage("Δημιουργήθηκε ο περιορισμένος χρήστης. Στην πρώτη σύνδεση απαιτείται αλλαγή προσωρινού κωδικού.");});};
  const login=e=>{e.preventDefault();const form=e.currentTarget,values=new FormData(form);perform(async()=>{const data=await jsonRequest("/api/auth/login",{method:"POST",body:JSON.stringify({email:N40_FIXTURE.email,password:values.get("password"),deviceName:"N40 LAB read-only audit"})});form.reset();if(!fixtureUser(data.user)||!data.token)throw new Error("Η ταυτότητα του περιορισμένου χρήστη δεν επιβεβαιώθηκε.");setSession(data);setResults([]);setMessage("Σύνδεση μόνο του περιορισμένου χρήστη στην τρέχουσα καρτέλα.");});};
  const changePassword=e=>{e.preventDefault();const form=e.currentTarget,values=new FormData(form);perform(async()=>{const data=await jsonRequest("/api/auth/change-password",{method:"POST",headers:{Authorization:`Bearer ${session.token}`},body:JSON.stringify({newPassword:values.get("newPassword"),confirmPassword:values.get("confirmPassword"),deviceName:"N40 LAB read-only audit"})});form.reset();if(!fixtureUser(data.user)||!data.token)throw new Error("Η ταυτότητα του περιορισμένου χρήστη δεν επιβεβαιώθηκε.");setSession(data);setMessage("Ο προσωρινός κωδικός αντικαταστάθηκε μέσω της κανονικής διαδικασίας.");});};
  const readStatus=async(label,path,token,expected)=>{
    const trace=n40ReadHeaders(path,scope,"GET");
    const response=await fetch(path,{method:"GET",headers:{Authorization:`Bearer ${token}`,...trace?.headers}});
    // Do not parse or render protected business payloads, even on unexpected 200.
    await response.body?.cancel();
    const row={label,path,traceId:trace?.traceId||"",status:response.status,expected,time:new Date().toISOString()};
    setResults(previous=>[...previous,row]);return row;
  };
  const check=()=>perform(async()=>{setResults([]);for(const[label,path]of probes){const row=await readStatus(label,path,session.token,403);if(row.status!==403){setMessage("Η παρτίδα σταμάτησε: υπάρχει μη αναμενόμενο αποτέλεσμα. Δεν αποτελεί PASS.");return;}}setMessage("Καταγράφηκαν οι HTTP αποκρίσεις. Απαιτείται αντιστοίχιση με το server trace πριν από καταγραφή LAB PASS.");});
  const logout=()=>perform(async()=>{const oldToken=session.token;await jsonRequest("/api/auth/logout",{method:"POST",headers:{Authorization:`Bearer ${oldToken}`},body:"{}"});setSession(null);await readStatus("Ανάκληση της συγκεκριμένης συνεδρίας",probes[0][1],oldToken,401);setMessage("Έξοδος μόνο της συνεδρίας του εικονικού χρήστη. Καταγράφηκε η απόκριση του προηγούμενου token.");});
  return <main style={{maxWidth:900,margin:"30px auto",padding:24,fontFamily:"system-ui",background:"#fff",color:"#172b4d"}}>
    <a href="/platform-admin">Επιστροφή στο Super Admin</a><h1>Νο40 · Περιορισμένος χρήστης Backoffice</h1>
    <p><b>MYWORKSTATION LAB → ΕΡΓΑΣΤΗΡΙΟ ΔΟΚΙΜΩΝ</b></p><p>{N40_FIXTURE.email} · EMPLOYEE</p>
    <p>Ξεχωριστός λογαριασμός από τον χειριστή POS. Εδώ χρειάζεται κωδικός Backoffice, όχι PIN POS. Οι έλεγχοι είναι μόνο ανάγνωσης και τα δεδομένα επιχειρησιακών αποκρίσεων δεν εμφανίζονται.</p>
    {error&&<p role="alert" style={{color:"#b91c1c"}}>{error}</p>}{message&&<p role="status">{message}</p>}
    <section style={{border:"1px solid #ccd",padding:20,marginBottom:20}}><h2>Ιστορικό Stock · μόνο ανάγνωση Audit</h2><p>Μόνο ο ίδιος Super Admin, LAB και 10/10/2026 15:00–15:30 ώρα Ελλάδας. Δεν επαναλαμβάνει είσοδο ή έξοδο υποστήριξης.</p><button style={button} disabled={busy} onClick={readSupportHistory}>Ανάγνωση παλιών εγγραφών υποστήριξης LAB</button>{supportHistory&&<><p>{supportHistory.label} · {supportHistory.records.length} εγγραφές{supportHistory.truncated?" · Ελλιπής παρτίδα":""}</p><p>Η παλιά εγγραφή αποθήκευε ετικέτα και χρήστη, όχι προορισμό, store ID ή συσχέτιση συνεδρίας. Δεν προκύπτει αυτόματα PASS.</p><pre aria-label="Νο40 ιστορικό υποστήριξης" style={{whiteSpace:"pre-wrap",overflowWrap:"anywhere"}}>{JSON.stringify(supportHistory,null,2)}</pre></>}</section>
    {!session&&<section style={{border:"1px solid #ccd",padding:20,marginBottom:20}}><h2>1. Προετοιμασία μόνο από Super Admin</h2><button style={button} disabled={busy} onClick={inspect}>Έλεγχος ύπαρξης εικονικού χρήστη</button>
      {fixture?.exists&&<p>Ο λογαριασμός υπάρχει ήδη. Δεν επιτρέπεται αλλαγή ή επαναφορά από αυτή τη φόρμα.</p>}
      {fixture&&!fixture.exists&&<form onSubmit={create}><p>Δημιουργείται μόνο ο παραπάνω EMPLOYEE στην εταιρεία LAB, χωρίς σύνδεση με προσωπικό ή πρόσθετα δικαιώματα. Συμπλήρωσε και υπέβαλε εσύ τους νέους κωδικούς.</p><label style={field}>Προσωρινός κωδικός νέου χρήστη<input type="password" name="password" minLength={10} maxLength={72} autoComplete="new-password" required/></label><label style={field}>Επιβεβαίωση προσωρινού κωδικού<input type="password" name="confirmPassword" minLength={10} maxLength={72} autoComplete="new-password" required/></label><button style={button} disabled={busy}>Δημιουργία περιορισμένου χρήστη LAB</button></form>}
    </section>}
    {!session&&<section style={{border:"1px solid #ccd",padding:20}}><h2>2. Σύνδεση εικονικού χρήστη</h2><form onSubmit={login}><label style={field}>Email Backoffice<input type="email" name="email" value={N40_FIXTURE.email} readOnly autoComplete="username"/></label><label style={field}>Κωδικός Backoffice<input type="password" name="password" autoComplete="current-password" required/></label><button style={button} disabled={busy}>Σύνδεση περιορισμένου χρήστη</button></form></section>}
    {session?.user.mustChangePassword&&<form onSubmit={changePassword}><h2>Αλλαγή προσωρινού κωδικού</h2><p>Ο νέος κωδικός πρέπει να διαφέρει από τον προσωρινό. Συμπλήρωσε και υπέβαλε εσύ τη φόρμα.</p><label style={field}>Νέος κωδικός Backoffice<input type="password" name="newPassword" minLength={10} maxLength={100} autoComplete="new-password" required/></label><label style={field}>Επιβεβαίωση νέου κωδικού<input type="password" name="confirmPassword" minLength={10} maxLength={100} autoComplete="new-password" required/></label><button style={button} disabled={busy}>Αλλαγή κωδικού</button></form>}
    {session&&!session.user.mustChangePassword&&<section><h2>3. Έλεγχοι πρόσβασης μόνο ανάγνωσης</h2><p>Η σύνδεση παραμένει μόνο στη μνήμη αυτής της καρτέλας. Δεν αντικαθιστά τη σύνδεση του Super Admin. Ανανέωση της σελίδας απαιτεί νέα σύνδεση.</p><button style={button} disabled={busy} onClick={check}>Έλεγχος απόρριψης Super Admin GET</button><button style={{...button,marginLeft:12}} disabled={busy} onClick={logout}>Έξοδος εικονικού χρήστη και έλεγχος ανάκλησης</button></section>}
    {results.length>0&&<section><h2>Πραγματικές αποκρίσεις HTTP</h2>{results.map((row,i)=><article key={i} style={{padding:12,borderBottom:"1px solid #ddd",overflowWrap:"anywhere"}}><b>{row.label} · HTTP {row.status} · αναμενόμενο {row.expected}</b><p>{row.path}</p><p>{row.time} · {row.traceId||"Χωρίς συσχέτιση: NOT TESTED"}</p></article>)}</section>}
    <p>Το Νο40 παραμένει OPEN. Αυτή η παρτίδα δεν αποδεικνύει όλους τους ελέγχους εταιρείας, καταστήματος, modules ή καθυστερημένων αποκρίσεων.</p>
  </main>;
}
