import React,{useEffect,useMemo,useState} from "react";
import {AlertTriangle,Building2,CalendarDays,CheckCircle2,Download,ExternalLink,KeyRound,LayoutDashboard,LayoutTemplate,LogOut,Plus,Printer,RefreshCw,Send,ShieldCheck,Store,Users,UsersRound,WalletCards,X} from "lucide-react";
import PlatformSecureLogin from "./PlatformSecureLogin.jsx";
import PlatformSecurityPanel from "./PlatformSecurityPanel.jsx";
import PosDesignerPanel from "./PosDesignerPanel.jsx";
import ScreenRecorderControl from "../commerce/ScreenRecorderControl.jsx";
import "./platform-admin.css";
import "./platform-super-access.css";

const plans=["TRIAL","PILOT","BASIC","PRO","ENTERPRISE"];
const planLabels={TRIAL:"Δοκιμαστικό",PILOT:"Πιλοτικό",BASIC:"Basic",PRO:"Pro",ENTERPRISE:"Enterprise"};
const when=value=>value?new Date(value).toLocaleDateString("el-GR"):"—";
const athensTime=value=>value?new Intl.DateTimeFormat("el-GR",{timeZone:"Europe/Athens",hour:"2-digit",minute:"2-digit",hour12:false}).format(new Date(value)):"—";

async function request(path,options={}){
  const token=localStorage.getItem("token");
  const response=await fetch(path,{
    ...options,
    headers:{"Content-Type":"application/json",...(token?{Authorization:`Bearer ${token}`}:{}) ,...(options.headers||{})}
  });
  const text=await response.text();
  let data={};
  if(text){try{data=JSON.parse(text)}catch{data={error:"Ο server επέστρεψε μη αναμενόμενη απάντηση."}}}
  if(!response.ok)throw new Error(data.error||`Σφάλμα ${response.status}`);
  return data;
}

export default function PlatformAdminApp(){
  const [user,setUser]=useState(()=>{
    try{return JSON.parse(localStorage.getItem("platformUser")||"null")}catch{return null}
  });
  const [data,setData]=useState(null);
  const [loading,setLoading]=useState(false);
  const [busy,setBusy]=useState("");
  const [error,setError]=useState("");
  const [message,setMessage]=useState("");
  const [showNew,setShowNew]=useState(false);
  const [showSecurity,setShowSecurity]=useState(false);
  const [showPosDesigner,setShowPosDesigner]=useState(false);
  const [ownerCompany,setOwnerCompany]=useState(null);
  const [resetCompany,setResetCompany]=useState(null);
  const [storeCompany,setStoreCompany]=useState(null);
  const [storeEdit,setStoreEdit]=useState(null);
  const [readiness,setReadiness]=useState(null);
  const [cashReport,setCashReport]=useState(null);
  const [cashReportDate,setCashReportDate]=useState(()=>new Intl.DateTimeFormat("en-CA",{timeZone:"Europe/Athens"}).format(new Date()));
  const [cashRangeFrom,setCashRangeFrom]=useState(()=>new Intl.DateTimeFormat("en-CA",{timeZone:"Europe/Athens"}).format(new Date()));
  const [cashRangeTo,setCashRangeTo]=useState(()=>new Intl.DateTimeFormat("en-CA",{timeZone:"Europe/Athens"}).format(new Date()));
  const [cashFromTime,setCashFromTime]=useState("00:00");
  const [cashToTime,setCashToTime]=useState("23:59");
  const [cashOperator,setCashOperator]=useState("");

  useEffect(()=>{
    if(!readiness)return undefined;
    const closeOnEscape=event=>{if(event.key==="Escape")setReadiness(null)};
    window.addEventListener("keydown",closeOnEscape);
    return()=>window.removeEventListener("keydown",closeOnEscape);
  },[readiness]);

  const clearSession=(clearError=true)=>{
    localStorage.removeItem("token");localStorage.removeItem("platformUser");
    setUser(null);setData(null);setShowSecurity(false);if(clearError)setError("");
  };
  const logout=async(clearError=true)=>{
    try{if(localStorage.getItem("token"))await request("/api/auth/logout",{method:"POST",body:"{}"})}catch{}
    clearSession(clearError);
  };
  const load=async()=>{
    setLoading(true);setError("");
    try{setData(await request("/api/platform/overview"))}
    catch(err){
      setError(err.message);
      if(/σύνδεση|συνεδρία|Super Admin|2FA/i.test(err.message))clearSession(false);
    }finally{setLoading(false)}
  };
  useEffect(()=>{if(user)load()},[user]);

  const createCompany=async event=>{
    event.preventDefault();setBusy("create");setError("");setMessage("");
    const form=new FormData(event.currentTarget);
    const body=Object.fromEntries(form.entries());
    body.trialDays=Number(body.trialDays||14);
    try{
      const result=await request("/api/platform/companies",{method:"POST",body:JSON.stringify(body)});
      setMessage(`Ο πελάτης «${result.company.name}» δημιουργήθηκε με πρώτο κατάστημα «${result.store.name}».`);
      setShowNew(false);event.currentTarget.reset();await load();
    }catch(err){setError(err.message)}finally{setBusy("")}
  };

  const updateCompany=async(companyId,body,label)=>{
    setBusy(companyId);setError("");setMessage("");
    try{
      await request(`/api/platform/companies/${companyId}`,{method:"PATCH",body:JSON.stringify(body)});
      setMessage(label);await load();
    }catch(err){setError(err.message)}finally{setBusy("")}
  };

  const saveOwner=async event=>{
    event.preventDefault();setBusy("owner");setError("");setMessage("");
    const form=new FormData(event.currentTarget);
    const body={
      fullName:form.get("fullName"),
      email:form.get("email"),
      temporaryPassword:form.get("temporaryPassword")||""
    };
    try{
      const result=await request(`/api/platform/companies/${ownerCompany.id}/owner`,{method:"PUT",body:JSON.stringify(body)});
      setMessage(`Ο/Η ${result.fullName} ορίστηκε ως ιδιοκτήτης του πελάτη ${ownerCompany.name}.`);
      setOwnerCompany(null);await load();
    }catch(err){setError(err.message)}finally{setBusy("")}
  };

  const resetPassword=async event=>{
    event.preventDefault();setBusy("reset");setError("");setMessage("");
    const form=new FormData(event.currentTarget);
    try{
      await request(`/api/platform/companies/${resetCompany.id}/reset-owner-password`,{method:"POST",body:JSON.stringify({temporaryPassword:form.get("temporaryPassword")})});
      setMessage(`Ο προσωρινός κωδικός του ${resetCompany.owner?.fullName||"ιδιοκτήτη"} άλλαξε.`);
      setResetCompany(null);
    }catch(err){setError(err.message)}finally{setBusy("")}
  };

  const saveStore=async event=>{
    event.preventDefault();setBusy("store");setError("");setMessage("");
    const form=new FormData(event.currentTarget);
    try{
      await request(`/api/platform/companies/${storeCompany.id}/stores/${storeEdit.id}`,{method:"PUT",body:JSON.stringify({
        name:form.get("name"),city:form.get("city")||"",responsibleEmail:form.get("responsibleEmail")||"",cashCloseEmailEnabled:storeEdit.cashCloseEmailEnabled!==false
      })});
      setMessage(`Το κατάστημα «${form.get("name")}» ενημερώθηκε.`);
      setStoreEdit(null);setStoreCompany(null);await load();
    }catch(err){setError(err.message)}finally{setBusy("")}
  };

  const openCustomer=async(company,store,destination)=>{
    setBusy(`access:${store?.id||company.id}:${destination}`);setError("");
    try{
      const result=await request(`/api/platform/companies/${company.id}/support-access`,{method:"POST",body:JSON.stringify({storeId:store?.id||null,destination})});
      sessionStorage.setItem("platformToken",localStorage.getItem("token")||"");
      localStorage.setItem("token",result.token);localStorage.setItem("user",JSON.stringify(result.user));localStorage.setItem("supportContext",JSON.stringify(result.supportContext));
      const query=new URLSearchParams({supportPage:destination==="SHIFTS"?"schedule":"stores"});
      if(store?.id)query.set("supportStore",store.id);
      window.location.href=`/?${query}`;
    }catch(err){setError(err.message);setBusy("")}
  };

  const checkReadiness=async(company,store)=>{
    setBusy(`readiness:${store.id}`);setError("");
    try{setReadiness(await request(`/api/platform/companies/${company.id}/stores/${store.id}/pilot-readiness`))}
    catch(err){setError(err.message)}finally{setBusy("")}
  };

  const savePilotProfile=async event=>{
    event.preventDefault();setBusy("pilot-profile");setError("");setMessage("");
    const form=new FormData(event.currentTarget);
    try{
      await request(`/api/platform/companies/${readiness.company.id}/stores/${readiness.store.id}/pilot-profile`,{method:"PUT",body:JSON.stringify({
        pcName:form.get("pcName"),operatingHours:form.get("operatingHours"),responsibleName:form.get("responsibleName"),notes:form.get("notes")||"",
        designFrozen:form.get("designFrozen")==="on",databaseFrozen:form.get("databaseFrozen")==="on",
        loginTested:form.get("loginTested")==="on",shiftOpenTested:form.get("shiftOpenTested")==="on",shiftCloseTested:form.get("shiftCloseTested")==="on",kioskUnaffected:form.get("kioskUnaffected")==="on"
      })});
      setReadiness(await request(`/api/platform/companies/${readiness.company.id}/stores/${readiness.store.id}/pilot-readiness`));
      setMessage("Το πιλοτικό scope του καταστήματος αποθηκεύτηκε.");
    }catch(err){setError(err.message)}finally{setBusy("")}
  };

  const downloadPilotBackup=async()=>{
    setBusy("pilot-backup");setError("");setMessage("");
    try{
      const token=localStorage.getItem("token");
      const response=await fetch(`/api/platform/companies/${readiness.company.id}/stores/${readiness.store.id}/pilot-backup`,{method:"POST",headers:{...(token?{Authorization:`Bearer ${token}`}:{})}});
      if(!response.ok){const data=await response.json().catch(()=>({}));throw new Error(data.error||`Σφάλμα ${response.status}`)}
      const blob=await response.blob();
      const disposition=response.headers.get("Content-Disposition")||"";
      const filename=disposition.match(/filename="([^"]+)"/)?.[1]||"MyWorkStation_pilot-safety-backup.json";
      const link=document.createElement("a");link.href=URL.createObjectURL(blob);link.download=filename;document.body.appendChild(link);link.click();link.remove();URL.revokeObjectURL(link.href);
      setReadiness(await request(`/api/platform/companies/${readiness.company.id}/stores/${readiness.store.id}/pilot-readiness`));
      setMessage("Το ασφαλές αντίγραφο κατέβηκε και καταγράφηκε στον έλεγχο ετοιμότητας.");
    }catch(err){setError(err.message)}finally{setBusy("")}
  };

  const assignStoreModeManager=async event=>{
    event.preventDefault();setBusy("store-mode-manager");setError("");setMessage("");
    const form=new FormData(event.currentTarget);
    try{
      const result=await request(`/api/platform/companies/${readiness.company.id}/stores/${readiness.store.id}/store-mode-manager`,{method:"PUT",body:JSON.stringify({employeeId:form.get("employeeId")})});
      setReadiness(await request(`/api/platform/companies/${readiness.company.id}/stores/${readiness.store.id}/pilot-readiness`));
      setMessage(`Ο/Η ${result.displayName} ορίστηκε ως Υπεύθυνος Store Mode.`);
    }catch(err){setError(err.message)}finally{setBusy("")}
  };

  const storeModeUrl=store=>`${window.location.origin}/store/${encodeURIComponent(store.id)}`;
  const downloadStoreShortcut=store=>{
    const content=`[InternetShortcut]\r\nURL=${storeModeUrl(store)}\r\n`;
    const blob=new Blob([content],{type:"application/internet-shortcut;charset=utf-8"});
    const link=document.createElement("a");
    link.href=URL.createObjectURL(blob);
    link.download=`MyWorkStation Store Mode - ${store.name.replace(/[\\/:*?"<>|]/g,"-")}.url`;
    document.body.appendChild(link);link.click();link.remove();URL.revokeObjectURL(link.href);
    setMessage(`Η συντόμευση Store Mode για το «${store.name}» δημιουργήθηκε.`);
  };

  const expiringTrials=useMemo(()=>{
    const now=Date.now(),week=7*24*60*60*1000;
    return (data?.companies||[]).filter(row=>row.plan==="TRIAL"&&row.trialEndsAt&&new Date(row.trialEndsAt).getTime()-now<=week).length;
  },[data]);

  const loadCashReport=async(date=cashReportDate)=>{
    setBusy("cash-report");setError("");
    try{setCashReport(await request(`/api/platform/cash-control/daily?${new URLSearchParams({date,fromTime:cashFromTime,toTime:cashToTime})}`))}catch(err){setError(err.message)}finally{setBusy("")}
  };

  const previewAndSendCashReport=async store=>{
    setBusy(`cash-email:${store.storeId}`);setError("");setMessage("");
    try{
      const preview=await request(`/api/platform/cash-control/stores/${store.storeId}/email-preview?date=${cashReportDate}`);
      if(!preview.rows.length)throw new Error("Δεν υπάρχουν κλεισμένες βάρδιες για αποστολή.");
      if(!preview.readyToSend)throw new Error("Υπάρχει βάρδια χωρίς ολοκληρωμένο έλεγχο ή με νεότερη κίνηση. Κάνε επανέλεγχο πριν την αποστολή στους ιδιοκτήτες.");
      const recipients=preview.recipients.join(", ")||"Δεν έχουν οριστεί παραλήπτες";
      const comment=window.prompt(`ΠΡΟΕΠΙΣΚΟΠΗΣΗ ΑΝΑΦΟΡΑΣ\n${preview.storeName} · ${preview.date}\nΒάρδιες: ${preview.rows.length}\nΠαραλήπτες: ${recipients}\n\nΓράψε προαιρετικό σχόλιο. Πατώντας OK θα σταλεί το email.`,"");
      if(comment===null)return;
      const sent=await request(`/api/platform/cash-control/stores/${store.storeId}/send-email`,{method:"POST",body:JSON.stringify({date:cashReportDate,comment})});
      setMessage(`Η αναφορά του ${preview.storeName} στάλθηκε σε: ${sent.recipients.join(", ")}.`);
    }catch(err){setError(err.message)}finally{setBusy("")}
  };

  const sendCashPreviewToMe=async store=>{
    const key=`cash-preview:${store.storeId}`;setBusy(key);setError("");setMessage("");
    try{
      const comment=window.prompt(`Δοκιμαστική αναφορά στο δικό σου email\n${store.storeName} · ${cashReportDate}\n\nΓράψε προαιρετικό σχόλιο.`,"");if(comment===null)return;
      const sent=await request(`/api/platform/cash-control/stores/${store.storeId}/send-preview`,{method:"POST",body:JSON.stringify({date:cashReportDate,comment})});
      setMessage(`Η δοκιμαστική αναφορά στάλθηκε μόνο στο ${sent.recipients.join(", ")}.`);
    }catch(err){setError(err.message)}finally{setBusy("")}
  };

  const downloadShortages=async store=>{
    const key=`cash-export:${store?.storeId||"all"}`;setBusy(key);setError("");
    try{
      const query=new URLSearchParams({from:cashRangeFrom,to:cashRangeTo,fromTime:cashFromTime,toTime:cashToTime,...(store?{storeId:store.storeId}:{}),...(cashOperator.trim()?{operator:cashOperator.trim()}:{})});
      const result=await request(`/api/platform/cash-control/shortages?${query}`);
      const cell=value=>`"${String(value??"").replaceAll('"','""')}"`;
      const lines=[["Ημερομηνία","Άνοιγμα","Κλείσιμο","Εταιρεία","Κατάστημα","POS","Βάρδια","Χειριστής","Έλλειμμα","Διαφορά POS–EFTPOS"],...result.rows.map(row=>[row.date,athensTime(row.openedAt),athensTime(row.closedAt),row.companyName,row.storeName,row.terminalPos||"MAIN",row.shiftLabel,row.openedByName||"—",row.shortage.toFixed(2),row.cardVariance.toFixed(2)])];
      const blob=new Blob(["\ufeff"+lines.map(line=>line.map(cell).join(";")).join("\n")],{type:"text/csv;charset=utf-8"});
      const link=document.createElement("a");link.href=URL.createObjectURL(blob);link.download=`Ελλείμματα_${store?.storeName||"Όλα-τα-καταστήματα"}_${cashRangeFrom}_${cashRangeTo}.csv`;document.body.appendChild(link);link.click();link.remove();URL.revokeObjectURL(link.href);
      setMessage(`Το αρχείο ελλειμμάτων δημιουργήθηκε (${result.rows.length} εγγραφές · ${result.totalShortage.toFixed(2)} €).`);
    }catch(err){setError(err.message)}finally{setBusy("")}
  };

  if(!user)return <PlatformSecureLogin onLogin={setUser}/>;

  return <div className="platform-shell">
    <header className="platform-header">
      <div className="platform-brand"><div className="platform-logo">MW</div><div><b>MyWorkStation Platform Admin</b><span>Κεντρική εμπορική διαχείριση</span></div></div>
      <div className="platform-user"><div><small>Platform Owner</small><b>{user.fullName}</b></div><ScreenRecorderControl contextLabel="MYWORKSTATION · PLATFORM ADMIN"/><a href="/"><ExternalLink/>Backoffice ΚΑΤ</a><button onClick={()=>setShowSecurity(true)}><ShieldCheck/>Ασφάλεια</button><button onClick={()=>logout()}><LogOut/>Έξοδος</button></div>
    </header>
    <main className="platform-main">
      <div className="platform-title"><div><span>SUPER ADMIN CONTROL CENTER</span><h1>Πελάτες και εγκαταστάσεις</h1><p>Δημιουργία, ενεργοποίηση και εποπτεία όλων των εταιρειών του MyWorkStation.</p></div><div className="platform-title-actions"><button className="secondary" onClick={load} disabled={loading}><RefreshCw/>Ανανέωση</button><button className="secondary" onClick={()=>loadCashReport()} disabled={busy==="cash-report"}><WalletCards/>{busy==="cash-report"?"Φόρτωση…":"Αναφορές Ταμείων"}</button><button onClick={()=>setShowPosDesigner(true)}><LayoutTemplate/>Σχεδιαστής POS</button><button onClick={()=>setShowNew(true)}><Plus/>Νέος πελάτης</button></div></div>
      {error&&<div className="platform-alert error">{error}</div>}
      {message&&<div className="platform-alert success">{message}</div>}
      <div className="platform-stats">
        <article><Building2/><div><span>Εταιρείες</span><strong>{data?.stats?.companies||0}</strong><small>{data?.stats?.activeCompanies||0} ενεργές</small></div></article>
        <article><Store/><div><span>Καταστήματα</span><strong>{data?.stats?.stores||0}</strong><small>Σε όλη την πλατφόρμα</small></div></article>
        <article><Users/><div><span>Χρήστες</span><strong>{data?.stats?.users||0}</strong><small>{data?.stats?.employees||0} εργαζόμενοι</small></div></article>
        <article><UsersRound/><div><span>Δοκιμές</span><strong>{data?.stats?.trialCompanies||0}</strong><small>{expiringTrials} λήγουν σύντομα</small></div></article>
      </div>
      <section className="platform-panel">
        <div className="platform-panel-head"><div><h2>Εταιρείες πελατών</h2><p>Κάθε εταιρεία έχει απομονωμένα καταστήματα, χρήστες και δεδομένα.</p></div></div>
        {loading?<div className="platform-empty">Φόρτωση πλατφόρμας…</div>:(data?.companies||[]).length===0?<div className="platform-empty">Δεν υπάρχουν ακόμη πελάτες.</div>:<div className="platform-company-list">
          {data.companies.map(company=><article className={`platform-company ${!company.active?"inactive":""}`} key={company.id}>
            <div className="platform-company-main"><div className="company-mark">{company.name.slice(0,2).toUpperCase()}</div><div><div className="company-name"><h3>{company.name}</h3><span className={`company-status ${company.active?"active":"inactive"}`}>{company.active?"ΕΝΕΡΓΗ":"ΑΝΕΝΕΡΓΗ"}</span></div><p>{company.city||"Χωρίς πόλη"}{company.taxId?` · ΑΦΜ ${company.taxId}`:""}</p><small>Δημιουργήθηκε {when(company.createdAt)}</small></div></div>
            <div className="platform-company-counts"><div><Store/><span>{company.storeCount} καταστήματα</span></div><div><Users/><span>{company.userCount} χρήστες</span></div><div><UsersRound/><span>{company.employeeCount} εργαζόμενοι</span></div></div>
            <div className="platform-company-owner"><small>Ιδιοκτήτης πελάτη</small><b>{company.owner?.fullName||"Δεν έχει οριστεί"}</b><span>{company.owner?.email||"—"}</span></div>
            <div className="platform-company-plan"><label>Πακέτο<select value={company.plan} onChange={e=>updateCompany(company.id,{plan:e.target.value},`Το πακέτο του ${company.name} ενημερώθηκε.`)} disabled={busy===company.id}>{plans.map(plan=><option value={plan} key={plan}>{planLabels[plan]}</option>)}</select></label><small>{company.plan==="TRIAL"?`Λήξη δοκιμής: ${when(company.trialEndsAt)}`:"Χωρίς ημερομηνία λήξης"}</small></div>
            <div className="platform-company-actions">
              <button className="secondary" onClick={()=>setStoreCompany(company)}><Store/>Καταστήματα</button>
              {company.stores.length===1&&<button className="secondary" onClick={()=>checkReadiness(company,company.stores[0])} disabled={busy===`readiness:${company.stores[0].id}`}><ShieldCheck/>{busy===`readiness:${company.stores[0].id}`?"Έλεγχος…":"Ετοιμότητα"}</button>}
              <button className="secondary" onClick={()=>setOwnerCompany(company)}><Users/>{company.owner?"Στοιχεία ιδιοκτήτη":"Ορισμός ιδιοκτήτη"}</button>
              <button className="secondary" onClick={()=>setResetCompany(company)} disabled={!company.owner}><KeyRound/>Νέος κωδικός</button>
              <button className={company.active?"danger":"activate"} onClick={()=>updateCompany(company.id,{active:!company.active},company.active?`Ο πελάτης ${company.name} απενεργοποιήθηκε.`:`Ο πελάτης ${company.name} ενεργοποιήθηκε.`)} disabled={busy===company.id}>{company.active?"Απενεργοποίηση":"Ενεργοποίηση"}</button>
            </div>
          </article>)}
        </div>}
      </section>
    </main>

    {showSecurity&&<div className="platform-modal"><section className="platform-security-dialog"><button type="button" className="modal-close" onClick={()=>setShowSecurity(false)}><X/></button><h2>Ασφάλεια Platform Admin</h2><p>Έλεγχος δύο βημάτων, συνδεδεμένες συσκευές και ιστορικό εισόδων.</p><PlatformSecurityPanel request={request} onCurrentRevoked={()=>clearSession()}/></section></div>}
    {showPosDesigner&&<PosDesignerPanel request={request} onClose={()=>setShowPosDesigner(false)}/>}
    {cashReport&&<div className="platform-modal"><section className="platform-security-dialog cash-report-dialog">
      <button type="button" className="modal-close" onClick={()=>setCashReport(null)}><X/></button>
      <h2>Αυτόματος Έλεγχος Ταμείων</h2><p>Κάθε κατάστημα ξεχωριστά · ανά ημέρα, POS και βάρδια</p>
      <div className="cash-report-filters"><label>Ημερομηνία<input type="date" value={cashReportDate} onChange={event=>setCashReportDate(event.target.value)}/></label><label>Ώρα από<input type="time" value={cashFromTime} onChange={event=>setCashFromTime(event.target.value)}/></label><label>Ώρα έως<input type="time" value={cashToTime} onChange={event=>setCashToTime(event.target.value)}/></label><button onClick={()=>loadCashReport(cashReportDate)} disabled={busy==="cash-report"}><RefreshCw/>Εμφάνιση</button><button type="button" className="secondary" onClick={()=>window.print()}><Printer/>Εκτύπωση αναφοράς</button><label>Από<input type="date" value={cashRangeFrom} onChange={event=>setCashRangeFrom(event.target.value)}/></label><label>Έως<input type="date" value={cashRangeTo} onChange={event=>setCashRangeTo(event.target.value)}/></label><label>Χειριστής<input value={cashOperator} onChange={event=>setCashOperator(event.target.value)} placeholder="Όλοι οι χειριστές"/></label><button type="button" className="secondary" onClick={()=>downloadShortages()} disabled={busy==="cash-export:all"}><Download/>{busy==="cash-export:all"?"Δημιουργία…":"Excel ελλειμμάτων όλων"}</button></div>
      <div className="cash-report-totals"><span>Βάρδιες <b>{cashReport.totals.shifts}</b></span><span>Συνολικό έλλειμμα <b>{cashReport.totals.shortage.toFixed(2)} €</b></span><span>Πλεόνασμα <b>{cashReport.totals.surplus.toFixed(2)} €</b></span><span>POS–EFTPOS <b>{cashReport.totals.cardVariance.toFixed(2)} €</b></span><span>Χωρίς παραστατικό <b>{cashReport.totals.expensesWithoutDocument}</b></span></div>
      <div className="cash-store-summaries">{(cashReport.stores||[]).map(store=><article key={store.storeId}><small>{store.companyName}</small><h3>{store.storeName}</h3><span>Βάρδιες <b>{store.shifts}</b></span><span>Έλλειμμα <b className="bad">{store.shortage.toFixed(2)} €</b></span><span>Πλεόνασμα <b className="ok">{store.surplus.toFixed(2)} €</b></span><span>POS–EFTPOS <b>{store.cardVariance.toFixed(2)} €</b></span><span>Χωρίς παραστατικό <b>{store.expensesWithoutDocument}</b></span><button type="button" className="secondary" onClick={()=>sendCashPreviewToMe(store)} disabled={busy===`cash-preview:${store.storeId}`}><Send/>{busy===`cash-preview:${store.storeId}`?"Αποστολή…":"Δοκιμή στο email μου"}</button><button type="button" onClick={()=>previewAndSendCashReport(store)} disabled={busy===`cash-email:${store.storeId}`}><Send/>{busy===`cash-email:${store.storeId}`?"Αποστολή…":"Προεπισκόπηση & email ιδιοκτητών"}</button><button type="button" className="secondary" onClick={()=>downloadShortages(store)} disabled={busy===`cash-export:${store.storeId}`}><Download/>{busy===`cash-export:${store.storeId}`?"Δημιουργία…":"Excel ελλειμμάτων"}</button></article>)}</div>
      <div className="cash-report-table"><div className="head"><span>Εταιρεία / Κατάστημα</span><span>POS / Βάρδια</span><span>Χειριστής</span><span>Μετρητά</span><span>Κάρτες / EFTPOS</span><span>Έλλειμμα / Διαφορά</span><span>Έλεγχος</span></div>{cashReport.rows.map(row=><div className="row" key={row.sessionId}><span><b>{row.companyName}</b><small>{row.storeName}</small></span><span><b>{row.terminalPos||"MAIN"}</b><small>{row.shiftLabel} · {athensTime(row.openedAt)}–{athensTime(row.closedAt)}</small></span><span>{row.openedByName||"—"}</span><span>{row.cashSales.toFixed(2)} €</span><span>{row.cardSales.toFixed(2)} / {row.eftposTotal.toFixed(2)} €</span><strong className={Math.abs(row.variance)>0.009?"bad":"ok"}>{row.variance.toFixed(2)} €</strong><span>{row.expensesWithoutDocument||Math.abs(row.cardVariance)>0.009||row.duplicateCandidates?"ΧΡΕΙΑΖΕΤΑΙ ΕΛΕΓΧΟΣ":"ΣΥΜΦΩΝΙΑ"}</span></div>)}</div>
    </section></div>}

    {showNew&&<div className="platform-modal"><form onSubmit={createCompany}><button type="button" className="modal-close" onClick={()=>setShowNew(false)}><X/></button><h2>Νέος εμπορικός πελάτης</h2><p>Δημιουργούνται εταιρεία, ιδιοκτήτης και πρώτο κατάστημα.</p><div className="platform-form-grid"><label>Επωνυμία εταιρείας<input name="companyName" required/></label><label>ΑΦΜ<input name="taxId"/></label><label>Πόλη<input name="city"/></label><label>Τηλέφωνο<input name="phone"/></label><label>Email εταιρείας<input name="companyEmail" type="email"/></label><label>Πακέτο<select name="plan" defaultValue="TRIAL">{plans.map(plan=><option value={plan} key={plan}>{planLabels[plan]}</option>)}</select></label><label>Ημέρες δοκιμής<input name="trialDays" type="number" min="1" max="365" defaultValue="14"/></label><div></div><label>Ονοματεπώνυμο ιδιοκτήτη<input name="ownerFullName" required/></label><label>Email ιδιοκτήτη<input name="ownerEmail" type="email" required/></label><label>Προσωρινός κωδικός<input name="temporaryPassword" type="password" minLength="8" required/></label><div></div><label>Πρώτο κατάστημα<input name="storeName" required/></label><label>Πόλη καταστήματος<input name="storeCity"/></label></div><div className="platform-form-actions"><button type="button" className="secondary" onClick={()=>setShowNew(false)}>Ακύρωση</button><button disabled={busy==="create"}>{busy==="create"?"Δημιουργία…":"Δημιουργία πελάτη"}</button></div></form></div>}

    {ownerCompany&&<div className="platform-modal"><form className="small" onSubmit={saveOwner}><button type="button" className="modal-close" onClick={()=>setOwnerCompany(null)}><X/></button><h2>{ownerCompany.owner?"Στοιχεία ιδιοκτήτη πελάτη":"Ορισμός ιδιοκτήτη πελάτη"}</h2><p>{ownerCompany.name}</p><label>Ονοματεπώνυμο<input name="fullName" defaultValue={ownerCompany.owner?.fullName||""} required autoFocus/></label><label>Email<input name="email" type="email" defaultValue={ownerCompany.owner?.email||""} required/></label><label>{ownerCompany.owner?"Νέος προσωρινός κωδικός — προαιρετικό":"Προσωρινός κωδικός"}<input name="temporaryPassword" type="password" minLength="8" required={!ownerCompany.owner}/></label><div className="platform-form-actions"><button type="button" className="secondary" onClick={()=>setOwnerCompany(null)}>Ακύρωση</button><button disabled={busy==="owner"}>{busy==="owner"?"Αποθήκευση…":"Αποθήκευση ιδιοκτήτη"}</button></div></form></div>}

    {resetCompany&&<div className="platform-modal"><form className="small" onSubmit={resetPassword}><button type="button" className="modal-close" onClick={()=>setResetCompany(null)}><X/></button><h2>Νέος προσωρινός κωδικός</h2><p>{resetCompany.owner?.fullName} · {resetCompany.owner?.email}</p><label>Προσωρινός κωδικός<input name="temporaryPassword" type="password" minLength="8" required autoFocus/></label><div className="platform-form-actions"><button type="button" className="secondary" onClick={()=>setResetCompany(null)}>Ακύρωση</button><button disabled={busy==="reset"}>{busy==="reset"?"Αποθήκευση…":"Αλλαγή κωδικού"}</button></div></form></div>}

    {storeCompany&&!storeEdit&&<div className="platform-modal"><section className="platform-security-dialog"><button type="button" className="modal-close" onClick={()=>setStoreCompany(null)}><X/></button><h2>Καταστήματα πελάτη</h2><p>{storeCompany.name}</p><div className="security-list">{storeCompany.stores.map(store=><article key={store.id}><Store/><div><b>{store.name}</b><span>{store.city||"Χωρίς πόλη"}</span><small>{store.responsibleEmail||"Δεν έχει οριστεί email υπευθύνου"} · Οι αναφορές αποστέλλονται χειροκίνητα</small></div><div className="platform-store-actions"><a href={storeModeUrl(store)} target="_blank" rel="noreferrer"><ExternalLink/>Store Mode</a><button className="secondary" onClick={()=>downloadStoreShortcut(store)}><Download/>Συντόμευση PC</button><button onClick={()=>openCustomer(storeCompany,store,"BACKOFFICE")}><LayoutDashboard/>Πλήρες Backoffice</button><button className="secondary" onClick={()=>openCustomer(storeCompany,store,"SHIFTS")}><CalendarDays/>Βάρδιες</button><button className="secondary" onClick={()=>openCustomer(storeCompany,store,"CASH_CONTROL")}><WalletCards/>Έλεγχος Ταμείων</button><button className="secondary" onClick={()=>checkReadiness(storeCompany,store)} disabled={busy===`readiness:${store.id}`}><ShieldCheck/>{busy===`readiness:${store.id}`?"Έλεγχος…":"Ετοιμότητα"}</button><button className="secondary" onClick={()=>setStoreEdit(store)}>Επεξεργασία</button></div></article>)}</div></section></div>}

    {readiness&&<div className="platform-modal"><section className="platform-security-dialog readiness-dialog"><button type="button" className="modal-close" onClick={()=>setReadiness(null)}><X/></button><h2>Έλεγχος ετοιμότητας καταστήματος</h2><p>{readiness.company.name} · {readiness.store.name}</p><form className="pilot-profile-form" onSubmit={savePilotProfile}><h3>Κλείδωμα πιλοτικής εγκατάστασης</h3><div><label>Όνομα PC<input name="pcName" defaultValue={readiness.profile?.pcName||"Windows PC ΚΑΤ"} required/></label><label>Ωράριο λειτουργίας<input name="operatingHours" defaultValue={readiness.profile?.operatingHours||"24ωρη λειτουργία"} required/></label><label>Υπεύθυνος εγκατάστασης<input name="responsibleName" defaultValue={readiness.profile?.responsibleName||"Χρήστος Μάνης"} required/></label><label>Σημειώσεις<input name="notes" defaultValue={readiness.profile?.notes||""}/></label></div><div className="pilot-freeze-checks"><label><input type="checkbox" checked={Boolean(readiness.profile?.backupConfirmedAt)} readOnly disabled/> Ασφαλές backup {readiness.profile?.backupConfirmedAt?"ολοκληρώθηκε":"εκκρεμεί"}</label><button type="button" className="secondary" onClick={downloadPilotBackup} disabled={busy==="pilot-backup"}><Download/>{busy==="pilot-backup"?"Δημιουργία…":"Λήψη ασφαλούς backup"}</button><label><input type="checkbox" name="designFrozen" defaultChecked={Boolean(readiness.profile?.designFrozenAt)}/> Κλείδωμα υπάρχοντος design</label><label><input type="checkbox" name="databaseFrozen" defaultChecked={Boolean(readiness.profile?.databaseFrozenAt)}/> Κλείδωμα δομής βάσης</label></div><h3 className="pilot-smoke-title">Πραγματικές δοκιμές καταστήματος</h3><div className="pilot-freeze-checks pilot-smoke-checks"><label><input type="checkbox" name="loginTested" defaultChecked={Boolean(readiness.profile?.loginTestedAt)}/> Είσοδος με PIN/κάρτα</label><label><input type="checkbox" name="shiftOpenTested" defaultChecked={Boolean(readiness.profile?.shiftOpenTestedAt)}/> Άνοιγμα βάρδιας</label><label><input type="checkbox" name="shiftCloseTested" defaultChecked={Boolean(readiness.profile?.shiftCloseTestedAt)}/> Κλείσιμο βάρδιας</label><label><input type="checkbox" name="kioskUnaffected" defaultChecked={Boolean(readiness.profile?.kioskUnaffectedAt)}/> Kiosk Manager ανεπηρέαστο</label></div><p className="pilot-smoke-note">Τσεκάρεται μόνο μετά από πραγματική δοκιμή. Το MyWorkStation δεν στέλνει εντολές σε RBS ή ταμειακή.</p><button disabled={busy==="pilot-profile"}>{busy==="pilot-profile"?"Αποθήκευση…":"Αποθήκευση και επανέλεγχος"}</button></form><div className={`readiness-summary ${readiness.ready?"ready":"blocked"}`}>{readiness.ready?<CheckCircle2/>:<AlertTriangle/>}<div><b>{readiness.ready?"ΕΤΟΙΜΟ ΓΙΑ ΠΑΡΑΛΛΗΛΗ ΠΙΛΟΤΙΚΗ ΛΕΙΤΟΥΡΓΙΑ":`${readiness.blockers} ΥΠΟΧΡΕΩΤΙΚΕΣ ΕΚΚΡΕΜΟΤΗΤΕΣ`}</b><span>Έλεγχος: {new Date(readiness.checkedAt).toLocaleString("el-GR")}</span></div></div><div className="readiness-list">{readiness.checks.map(check=><article className={check.ok?"ok":"missing"} key={check.key}>{check.ok?<CheckCircle2/>:<AlertTriangle/>}<div><b>{check.label}</b><span>{check.detail}</span></div><em>{check.ok?"OK":check.blocking?"ΥΠΟΧΡΕΩΤΙΚΟ":"ΠΡΟΑΙΡΕΤΙΚΟ"}</em></article>)}</div><p className="readiness-note">Ο έλεγχος είναι μόνο ανάγνωσης. Δεν ανοίγει βάρδια, δεν δημιουργεί συναλλαγές και δεν επικοινωνεί με RBS/ταμειακή.</p></section></div>}

    {storeCompany&&storeEdit&&<div className="platform-modal"><form className="small" onSubmit={saveStore}><button type="button" className="modal-close" onClick={()=>setStoreEdit(null)}><X/></button><h2>Επεξεργασία καταστήματος</h2><p>{storeCompany.name}</p><label>Όνομα καταστήματος<input name="name" defaultValue={storeEdit.name} required autoFocus/></label><label>Πόλη<input name="city" defaultValue={storeEdit.city||""}/></label><label>Email υπευθύνου αναφορών<input name="responsibleEmail" type="email" defaultValue={storeEdit.responsibleEmail||""} placeholder="manager@example.gr"/></label><p>Οι αναφορές στέλνονται μόνο όταν ο Super Admin πατήσει την αποστολή μετά τον ολοκληρωμένο έλεγχο.</p><div className="platform-form-actions"><button type="button" className="secondary" onClick={()=>setStoreEdit(null)}>Πίσω</button><button disabled={busy==="store"}>{busy==="store"?"Αποθήκευση…":"Αποθήκευση καταστήματος"}</button></div></form></div>}
    {readiness&&<form className="readiness-manager-floating" onSubmit={assignStoreModeManager}><select name="employeeId" defaultValue={readiness.operators?.find(row=>row.role==="MANAGER")?.employeeId||""} required><option value="" disabled>Υπεύθυνος Store Mode</option>{(readiness.operators||[]).filter(row=>row.hasCredential).map(row=><option key={row.employeeId} value={row.employeeId}>{row.displayName}{row.role==="MANAGER"?" — τρέχων":""}</option>)}</select><button disabled={busy==="store-mode-manager"}>{busy==="store-mode-manager"?"Αποθήκευση…":"Ορισμός υπευθύνου"}</button><small>Απομακρυσμένα · δεν αλλάζει PIN και δεν ανοίγει βάρδια</small></form>}
    {readiness&&<button type="button" className="readiness-print-floating" onClick={()=>window.print()}><Printer/>Εκτύπωση ελέγχου</button>}
  </div>;
}
