import React,{useEffect,useMemo,useState} from "react";
import {AlertTriangle,Building2,CalendarDays,Camera,CheckCircle2,Copy,Download,ExternalLink,KeyRound,LayoutDashboard,LayoutTemplate,LogOut,Monitor,Plus,Printer,RefreshCw,Send,ShieldCheck,ShoppingBag,Store,Trash2,Users,UsersRound,WalletCards,X} from "lucide-react";
import PlatformSecureLogin from "./PlatformSecureLogin.jsx";
import PlatformSecurityPanel from "./PlatformSecurityPanel.jsx";
import PosDesignerPanel from "./PosDesignerPanel.jsx";
import OnlineStoreManager from "./OnlineStoreManager.jsx";
import VideoConnectionManager from "./VideoConnectionManager.jsx";
import ScreenRecorderWindowLauncher from "../commerce/ScreenRecorderWindowLauncher.jsx";
import DeviceOperationsCenter from "./DeviceOperationsCenter.jsx";
import SuperAdminInstallationCenter from "./SuperAdminInstallationCenter.jsx";
import StoreFiscalIntegrations from "./StoreFiscalIntegrations.jsx";
import SupplierSettlementReviewCenter from "./SupplierSettlementReviewCenter.jsx";
import OtherExpenseReviewCenter from "./OtherExpenseReviewCenter.jsx";
import "./platform-admin.css";
import "./platform-super-access.css";
import "./terminal-manager.css";

const plans=["TRIAL","PILOT","BASIC","PRO","ENTERPRISE"];
const planLabels={TRIAL:"Δοκιμαστικό",PILOT:"Πιλοτικό",BASIC:"Basic",PRO:"Pro",ENTERPRISE:"Enterprise"};
const when=value=>value?new Date(value).toLocaleDateString("el-GR"):"—";
const athensTime=value=>value?new Intl.DateTimeFormat("el-GR",{timeZone:"Europe/Athens",hour:"2-digit",minute:"2-digit",hour12:false}).format(new Date(value)):"—";
const cashNumber=value=>Number(value||0);
const cashMoney=value=>cashNumber(value).toLocaleString("el-GR",{style:"currency",currency:"EUR"});
const cashEventTime=value=>value?new Intl.DateTimeFormat("el-GR",{timeZone:"Europe/Athens",day:"2-digit",month:"2-digit",hour:"2-digit",minute:"2-digit",hour12:false}).format(new Date(value)):"—";
const cashReportDateLabel=value=>value?new Intl.DateTimeFormat("el-GR",{timeZone:"Europe/Athens",weekday:"long",day:"2-digit",month:"2-digit",year:"numeric"}).format(new Date(`${value}T12:00:00+03:00`)):"—";
const cashConclusionLabels={AGREEMENT:"Ο ΕΛΕΓΧΟΣ ΟΛΟΚΛΗΡΩΘΗΚΕ — ΣΥΜΦΩΝΙΑ",UNEXPLAINED_SHORTAGE:"Ο ΕΛΕΓΧΟΣ ΟΛΟΚΛΗΡΩΘΗΚΕ — ΑΝΕΞΗΓΗΤΟ ΕΛΛΕΙΜΜΑ",SHORTAGE_WITH_FINDINGS:"Ο ΕΛΕΓΧΟΣ ΟΛΟΚΛΗΡΩΘΗΚΕ — ΕΛΛΕΙΜΜΑ ΜΕ ΕΥΡΗΜΑΤΑ",UNEXPLAINED_SURPLUS:"Ο ΕΛΕΓΧΟΣ ΟΛΟΚΛΗΡΩΘΗΚΕ — ΑΝΕΞΗΓΗΤΟ ΠΛΕΟΝΑΣΜΑ",SURPLUS_WITH_FINDINGS:"Ο ΕΛΕΓΧΟΣ ΟΛΟΚΛΗΡΩΘΗΚΕ — ΠΛΕΟΝΑΣΜΑ ΜΕ ΕΥΡΗΜΑΤΑ",FINDINGS_WITHOUT_CASH_VARIANCE:"Ο ΕΛΕΓΧΟΣ ΟΛΟΚΛΗΡΩΘΗΚΕ — ΒΡΕΘΗΚΑΝ ΣΥΜΒΑΝΤΑ"};
const cashFindingLabel=finding=>{
  const code=String(finding?.code||"");
  const at=`${cashEventTime(finding.at)} · `;
  if(code==="SHIFT_VARIANCE_OFFSET")return `${at}Πιθανή μη καταμετρημένη φύλαξη μεταξύ βαρδιών: ${cashMoney(finding.previousVariance)} (${finding.previousOperator||"—"}) και ${cashMoney(finding.currentVariance)} (${finding.currentOperator||"—"}). Καθαρή διαφορά ${cashMoney(finding.netVariance)}${finding.finalOperator?` καταλογίζεται στον/στην ${finding.finalOperator}`:""}.`;
  if(code==="EXPENSE_WITHOUT_DOCUMENT")return `${at}Έξοδο ${cashMoney(finding.amount)} χωρίς παραστατικό.`;
  if(code==="EXPENSE_DOCUMENT_MISMATCH")return `${at}Πληρωμή ${cashMoney(finding.amount)} δεν συμφωνεί με το τιμολόγιο/παραστατικό ${cashMoney(finding.documentTotal)} (διαφορά ${cashMoney(finding.difference)})${finding.actorName?` · ${finding.actorName}`:""}.`;
  if(code==="REVERSED_TRANSACTION")return `${at}Αντιλογισμένη συναλλαγή ${cashMoney(finding.amount)}${finding.actorName?` από ${finding.actorName}`:""}. Έχουν πάρει τα χρήματα;`;
  if(code==="CASH_TRANSFER_DIFFERENCE")return `${at}SOS — ανεξήγητη διαφορά μεταφοράς ταμείου ${cashMoney(finding.amount)}${finding.delivery?" στην αλυσίδα DELIVERY":" στο ίδιο POS"}.`;
  if(code==="CARD_RECORDED_CASH_PAID")return `${at}Πιθανή πώληση που καταχωρίστηκε ως κάρτα αλλά πληρώθηκε με μετρητά (${cashMoney(finding.amount)}).`;
  if(code==="EFTPOS_CONFIRMED_AS_FAILED")return `${at}Πιθανή επιλογή «ΟΧΙ» αντί «ΝΑΙ» στην επιβεβαίωση «πέρασε η κάρτα;» (${cashMoney(finding.amount)}).`;
  if(code==="POS_EFTPOS_DIFFERENCE")return `${at}Διαφορά POS–EFTPOS ${cashMoney(finding.amount)}.`;
  if(code==="DUPLICATE_CANDIDATES"||/DUPLICATE|REPLAY/.test(code))return `${at}Ένδειξη διπλής ή επαναληφθείσας συναλλαγής${finding.count?` (${finding.count})`:""}.`;
  if(code==="ACTION_AFTER_SHIFT_CLOSE")return `${at}Ενέργεια συναλλαγής μετά το κλείσιμο της βάρδιας.`;
  if(code==="ACTION_WITHOUT_ORIGINAL_SALE")return `${at}Ακύρωση ή επιστροφή χωρίς σύνδεση με την αρχική πώληση.`;
  if(code==="MULTIPLE_ACTIONS_ON_SAME_SALE")return `${at}Πολλαπλές ακυρώσεις ή επιστροφές στην ίδια πώληση.`;
  if(code==="ACTION_BY_DIFFERENT_OPERATOR")return `${at}Ενέργεια από διαφορετικό χειριστή${finding.actorName?` (${finding.actorName})`:""}.`;
  if(code==="AMOUNT_MATCHES_CASH_DIFFERENCE")return `${at}Συμβάν με ποσό ίσο με τη διαφορά ταμείου (${cashMoney(finding.amount)}).`;
  if(/CANCEL|RETURN|VOID|REVERSE/.test(code))return `${at}Ακύρωση, επιστροφή ή αντιλογισμός.`;
  return `${at}${code.replace(/^AUDIT_/,"").replaceAll("_"," ")}.`;
};

const cashWrittenReport=row=>{
  const variance=cashNumber(row.variance);
  const cardVariance=cashNumber(row.cardVariance);
  const undocumented=cashNumber(row.expensesWithoutDocument);
  const duplicates=cashNumber(row.duplicateCandidates);
  const investigation=row.investigation||{};
  const findings=Array.isArray(investigation.findings)?investigation.findings:[];
  const conclusion=investigation.conclusion||(variance<-.009?"UNEXPLAINED_SHORTAGE":variance>.009?"UNEXPLAINED_SURPLUS":"AGREEMENT");
  const result=variance<-.009?`έλλειμμα ${cashMoney(Math.abs(variance))}`:variance>.009?`πλεόνασμα ${cashMoney(variance)}`:"μηδενική διαφορά μετρητών";
  const paragraphs=findings.length?findings.map(cashFindingLabel):variance<-.009?[`${cashEventTime(row.closedAt)} · Ανεξήγητο έλλειμμα ${cashMoney(Math.abs(variance))}.`]:variance>.009?[`${cashEventTime(row.closedAt)} · Ανεξήγητο πλεόνασμα ${cashMoney(variance)}.`]:["Δεν εντοπίστηκε περίεργο συμβάν."];
  return{paragraphs,alert:conclusion!=="AGREEMENT",conclusion:cashConclusionLabels[conclusion]||cashConclusionLabels.AGREEMENT};
};

const cashShiftResult=row=>{
  const variance=cashNumber(row.variance),cardVariance=cashNumber(row.cardVariance),findings=row.investigation?.findings||[];
  if(variance<-.009)return `Έλλειμμα ${cashMoney(Math.abs(variance))} — ${row.openedByName||"Χωρίς όνομα"}`;
  if(variance>.009)return `Πλεόνασμα ${cashMoney(variance)} — ${row.openedByName||"Χωρίς όνομα"}`;
  if(Math.abs(cardVariance)>.02)return `Διαφορά POS / EFTPOS ${cashMoney(cardVariance)} — ${row.openedByName||"Χωρίς όνομα"}`;
  return findings.length?"Βρέθηκε περίεργο συμβάν":"Χωρίς διαφορά";
};

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
  const [recoveryWorkflow,setRecoveryWorkflow]=useState(null);
  const [cashReport,setCashReport]=useState(null);
  const [cashReportDate,setCashReportDate]=useState(()=>new Intl.DateTimeFormat("en-CA",{timeZone:"Europe/Athens"}).format(new Date()));
  const [cashRangeFrom,setCashRangeFrom]=useState(()=>new Intl.DateTimeFormat("en-CA",{timeZone:"Europe/Athens"}).format(new Date()));
  const [cashRangeTo,setCashRangeTo]=useState(()=>new Intl.DateTimeFormat("en-CA",{timeZone:"Europe/Athens"}).format(new Date()));
  const [cashFromTime,setCashFromTime]=useState("00:00");
  const [cashToTime,setCashToTime]=useState("23:59");
  const [cashOperator,setCashOperator]=useState("");
  const [terminalManager,setTerminalManager]=useState(null);
  const [deviceOperationsManager,setDeviceOperationsManager]=useState(null);
  const [showInstallationCenter,setShowInstallationCenter]=useState(false);
  const [openDeviceCenter,setOpenDeviceCenter]=useState(false);
  const [terminalActivationNotice,setTerminalActivationNotice]=useState(null);
  const [onlineStoreManager,setOnlineStoreManager]=useState(null);
  const [videoConnectionManager,setVideoConnectionManager]=useState(null);
  const [cashStoreId,setCashStoreId]=useState("");
  const [deleteCompany,setDeleteCompany]=useState(null);
  const [fiscalIntegrations,setFiscalIntegrations]=useState(null);
  const [showSupplierSettlementReview,setShowSupplierSettlementReview]=useState(false);
  const [showOtherExpenseReview,setShowOtherExpenseReview]=useState(false);
  const [analyticsResult,setAnalyticsResult]=useState(null);

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

  const runSuperAdminAnalytics=async()=>{
    setBusy("super-admin-analytics");setError("");setMessage("");
    try{const result=await request("/api/platform/super-admin-analytics/execute",{method:"POST",body:JSON.stringify({})});setAnalyticsResult(result);setMessage(result.status==="ΟΚ"?"Ο έλεγχος ολοκληρώθηκε χωρίς διαφορές.":`Ο έλεγχος ολοκληρώθηκε: ${result.findings.length} εύρημα(τα) χρειάζονται έλεγχο.`)}catch(err){setError(err.message)}finally{setBusy("")}
  };

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

  const permanentlyDeleteCompany=async event=>{
    event.preventDefault();setBusy("delete-company");setError("");setMessage("");
    const form=new FormData(event.currentTarget);
    try{
      const result=await request(`/api/platform/companies/${deleteCompany.id}`,{method:"DELETE",body:JSON.stringify({confirmationName:form.get("confirmationName"),confirmationPhrase:form.get("confirmationPhrase")})});
      setDeleteCompany(null);
      setMessage(`Η δοκιμαστική εταιρεία «${result.deleted.name}» διαγράφηκε οριστικά μαζί με ${result.deleted.stores} κατάστημα, ${result.deleted.users} χρήστες και ${result.deleted.employees} εργαζομένους.`);
      await load();
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
    try{setReadiness(await request(`/api/platform/companies/${company.id}/stores/${store.id}/pilot-readiness`));setRecoveryWorkflow(null)}
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

  const verifyPilotBackup=async event=>{
    const file=event.target.files?.[0];event.target.value="";
    if(!file)return;
    setBusy("pilot-backup-verify");setError("");setMessage("");
    try{
      if(!/\.json$/i.test(file.name))throw new Error("Επίλεξε το αρχείο backup JSON του MyWorkStation.");
      if(file.size>10*1024*1024)throw new Error("Το αρχείο backup είναι μεγαλύτερο από 10 MB.");
      let document;try{document=JSON.parse(await file.text())}catch{throw new Error("Το αρχείο backup δεν περιέχει έγκυρο JSON.")}
      const result=await request(`/api/platform/companies/${readiness.company.id}/stores/${readiness.store.id}/pilot-backup/verify`,{method:"POST",body:JSON.stringify(document)});
      const total=Object.values(result.counts||{}).reduce((sum,value)=>sum+Number(value||0),0);
      const report=result.recoveryReport||{};
      setRecoveryWorkflow(result);
      setMessage(`Το backup επαληθεύτηκε χωρίς αλλαγή στη βάση · ${total} εγγραφές · SHA-256 ${result.checksum.slice(0,16)} · schema ${report.backupSchemaRevision||"—"} · app ${String(report.backupAppRevision||"UNKNOWN").slice(0,12)} · dry-run ${report.dryRunResult||"PASSED"}. Επόμενο: ${report.nextManualAction||"φύλαξε το report και το rollback checkpoint."}`);
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

  const openTerminals=async(company,store,openOperations=false)=>{
    setBusy(`terminals:${store.id}`);setError("");
    try{const [result,routing]=await Promise.all([request(`/api/platform/companies/${company.id}/stores/${store.id}/installation-terminals`),request(`/api/platform/companies/${company.id}/stores/${store.id}/device-routing`)]);const manager={company,store,terminals:result.terminals,routing,activationUrl:""};setOpenDeviceCenter(openOperations);setShowInstallationCenter(false);if(openOperations){setDeviceOperationsManager(manager);setTerminalManager(null)}else{setDeviceOperationsManager(null);setTerminalManager(manager)}}
    catch(err){setError(err.message)}finally{setBusy("")}
  };
  const openFiscalIntegrations=async(company,store)=>{
    setBusy(`integrations:${store.id}`);setError("");
    try{const result=await request(`/api/platform/companies/${company.id}/stores/${store.id}/integrations`);setFiscalIntegrations({company,store,integrations:result.integrations||[]})}catch(err){setError(err.message)}finally{setBusy("")}
  };
  const refreshFiscalIntegrations=async()=>{
    const result=await request(`/api/platform/companies/${fiscalIntegrations.company.id}/stores/${fiscalIntegrations.store.id}/integrations`);
    setFiscalIntegrations(value=>({...value,integrations:result.integrations||[]}));setMessage("Οι κωδικοί του καταστήματος αποθηκεύτηκαν με ασφάλεια.");
  };
  const refreshTerminals=async(current=terminalManager)=>{
    const [result,routing]=await Promise.all([request(`/api/platform/companies/${current.company.id}/stores/${current.store.id}/installation-terminals`),request(`/api/platform/companies/${current.company.id}/stores/${current.store.id}/device-routing`)]);
    setTerminalManager(value=>({...value,terminals:result.terminals,routing}));
  };
  const createTerminal=async event=>{
    event.preventDefault();setBusy("terminal-create");setError("");
    const formElement=event.currentTarget;
    const form=new FormData(formElement);
    try{
      const result=await request(`/api/platform/companies/${terminalManager.company.id}/stores/${terminalManager.store.id}/installation-terminals`,{method:"POST",body:JSON.stringify({terminalPos:form.get("terminalPos"),displayName:form.get("displayName")})});
      const activationUrl=`${window.location.origin}${result.activationPath}`;
      formElement.reset();
      setTerminalActivationNotice({activationUrl,terminalPos:result.terminalPos});
      setTerminalManager(null);
      setMessage(`Δημιουργήθηκε το ${result.terminalPos}. Το παράθυρο έκλεισε αυτόματα και το εφάπαξ link παραμένει διαθέσιμο παρακάτω.`);
    }catch(err){setError(err.message)}finally{setBusy("")}
  };
  const rotateTerminalActivation=async terminal=>{
    setBusy(`terminal-link:${terminal.id}`);setError("");
    try{const result=await request(`/api/platform/companies/${terminalManager.company.id}/stores/${terminalManager.store.id}/installation-terminals/${terminal.id}/rotate-activation`,{method:"POST",body:"{}"});setTerminalManager(value=>({...value,activationUrl:`${window.location.origin}${result.activationPath}`,activationTerminal:terminal.terminalPos}));await refreshTerminals();setMessage(`Εκδόθηκε νέο εφάπαξ link για ${terminal.terminalPos}.`)}catch(err){setError(err.message)}finally{setBusy("")}
  };
  const toggleTerminal=async terminal=>{
    setBusy(`terminal-toggle:${terminal.id}`);setError("");
    try{await request(`/api/platform/companies/${terminalManager.company.id}/stores/${terminalManager.store.id}/installation-terminals/${terminal.id}`,{method:"PATCH",body:JSON.stringify({active:!terminal.active})});await refreshTerminals();setMessage(`${terminal.terminalPos}: ${terminal.active?"απενεργοποιήθηκε":"ενεργοποιήθηκε"}.`)}catch(err){setError(err.message)}finally{setBusy("")}
  };
  const saveTerminalDeviceRouting=async event=>{
    event.preventDefault();setBusy("device-routing");setError("");
    const form=new FormData(event.currentTarget),terminalPos=String(form.get("terminalPos")||"").toUpperCase(),fiscalDeviceCode=String(form.get("fiscalDeviceCode")||"").toUpperCase();
    const current=terminalManager.routing||{fiscalDevices:[],eftposDevices:[]};
    const fiscalDevices=[...(current.fiscalDevices||[]).filter(row=>row.terminalPos!==terminalPos),{deviceCode:fiscalDeviceCode,displayName:form.get("fiscalDisplayName"),terminalPos,active:true}];
    const retainedFiscalCodes=new Set(fiscalDevices.map(row=>row.deviceCode));
    const eftposDevices=(current.eftposDevices||[]).filter(row=>retainedFiscalCodes.has(row.fiscalDeviceCode)&&row.fiscalDeviceCode!==fiscalDeviceCode);
    eftposDevices.push({deviceCode:String(form.get("storeEftposCode")||"").toUpperCase(),displayName:form.get("storeEftposName"),fiscalDeviceCode,role:"STORE",active:true});
    eftposDevices.push({deviceCode:String(form.get("deliveryEftposCode")||"").toUpperCase(),displayName:form.get("deliveryEftposName"),fiscalDeviceCode,role:"DELIVERY",active:true});
    try{await request(`/api/platform/companies/${terminalManager.company.id}/stores/${terminalManager.store.id}/device-routing`,{method:"PUT",body:JSON.stringify({fiscalDevices,eftposDevices})});event.currentTarget.reset();await refreshTerminals();setMessage(`Αποθηκεύτηκε ασφαλές Fiscal/EFTPOS mapping για ${terminalPos}.`)}catch(err){setError(err.message)}finally{setBusy("")}
  };
  const copyActivation=async()=>{try{await navigator.clipboard.writeText(terminalManager.activationUrl);setMessage(`Το link εγκατάστασης για ${terminalManager.activationTerminal} αντιγράφηκε.`)}catch{setError("Δεν ήταν δυνατή η αντιγραφή. Αντέγραψε χειροκίνητα το link.")}};
  const copyActivationNotice=async()=>{try{await navigator.clipboard.writeText(terminalActivationNotice.activationUrl);setMessage(`Το link εγκατάστασης για ${terminalActivationNotice.terminalPos} αντιγράφηκε.`)}catch{setError("Δεν ήταν δυνατή η αντιγραφή. Αντέγραψε χειροκίνητα το link.")}};
  const openOnlineStore=async(company,store)=>{
    setBusy(`online-store:${store.id}`);setError("");
    try{const result=await request(`/api/platform/companies/${company.id}/stores/${store.id}/online-store`);setOnlineStoreManager({...result,company,store})}
    catch(err){setError(err.message)}finally{setBusy("")}
  };
  const openVideoConnection=async(company,store)=>{setBusy(`video:${store.id}`);setError("");try{const result=await request(`/api/platform/companies/${company.id}/stores/${store.id}/video-connection`);setVideoConnectionManager({...result,company,store})}catch(err){setError(err.message)}finally{setBusy("")}};
  const toggleTableService=async(company,store)=>{setBusy(`tables:${store.id}`);setError("");try{const current=await request(`/api/platform/companies/${company.id}/stores/${store.id}/table-service`),next=!current.enabled;if(!window.confirm(`${next?"Ενεργοποίηση":"Απενεργοποίηση"} Ασύρματης Παραγγελιοληψίας στο ${store.name};`))return;await request(`/api/platform/companies/${company.id}/stores/${store.id}/table-service`,{method:"PUT",body:JSON.stringify({enabled:next})});setMessage(`TABLE_SERVICE · ${store.name}: ${next?"ΕΝΕΡΓΟ":"ΑΝΕΝΕΡΓΟ"}.`)}catch(err){setError(err.message)}finally{setBusy("")}};

  const expiringTrials=useMemo(()=>{
    const now=Date.now(),week=7*24*60*60*1000;
    return (data?.companies||[]).filter(row=>row.plan==="TRIAL"&&row.trialEndsAt&&new Date(row.trialEndsAt).getTime()-now<=week).length;
  },[data]);

  const loadCashReport=async(date=cashReportDate)=>{
    setBusy("cash-report");setError("");
    try{setCashReport(await request(`/api/platform/cash-control/daily?${new URLSearchParams({date,fromTime:cashFromTime,toTime:cashToTime,...(cashStoreId?{storeId:cashStoreId}:{})})}`))}catch(err){setError(err.message)}finally{setBusy("")}
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
      <div className="platform-user"><div><small>Platform Owner</small><b>{user.fullName}</b></div><ScreenRecorderWindowLauncher/><button onClick={()=>setShowSecurity(true)}><ShieldCheck/>Ασφάλεια</button><button onClick={()=>logout()}><LogOut/>Έξοδος</button></div>
    </header>
    <main className="platform-main">
      <div className="platform-title"><div><span>SUPER ADMIN CONTROL CENTER</span><h1>Πελάτες και εγκαταστάσεις</h1><p>Δημιουργία, ενεργοποίηση και εποπτεία όλων των εταιρειών του MyWorkStation.</p></div><div className="platform-title-actions"><button onClick={()=>setShowInstallationCenter(true)}><Monitor/>Super Admin Installation Center</button><button className="secondary" onClick={load} disabled={loading}><RefreshCw/>Ανανέωση</button><button className="secondary" onClick={()=>loadCashReport()} disabled={busy==="cash-report"}><WalletCards/>{busy==="cash-report"?"Φόρτωση…":"Αναφορές Ταμείων"}</button><button className="secondary" onClick={()=>setShowSupplierSettlementReview(true)}><ShieldCheck/>Έλεγχος πληρωμών</button><button className="secondary" onClick={()=>setShowOtherExpenseReview(true)}><WalletCards/>Έλεγχος εξόδων</button><button className="secondary" onClick={runSuperAdminAnalytics} disabled={busy==="super-admin-analytics"}><AlertTriangle/>{busy==="super-admin-analytics"?"Έλεγχος…":"Έλεγχοι & Αναλύσεις"}</button><button onClick={()=>setShowPosDesigner(true)}><LayoutTemplate/>Σχεδιαστής POS</button><button onClick={()=>setShowNew(true)}><Plus/>Νέος πελάτης</button></div></div>
      {error&&<div className="platform-alert error">{error}</div>}
      {message&&<div className="platform-alert success">{message}</div>}
      {terminalActivationNotice&&<div className="terminal-created-notice"><button type="button" className="terminal-created-close" onClick={()=>setTerminalActivationNotice(null)}><X/></button><b>Το {terminalActivationNotice.terminalPos} δημιουργήθηκε</b><span>Το παράθυρο δημιουργίας έκλεισε. Το link ισχύει 24 ώρες και χρησιμοποιείται μία φορά.</span><input value={terminalActivationNotice.activationUrl} readOnly/><button type="button" onClick={copyActivationNotice}><Copy/> Αντιγραφή link εγκατάστασης</button></div>}
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
              {company.name==="KAT TEST"&&<button className="danger" onClick={()=>setDeleteCompany(company)} disabled={Boolean(busy)}><Trash2/>Οριστική διαγραφή</button>}
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
      <div className="cash-report-filters"><label>Κατάστημα<select value={cashStoreId} onChange={event=>setCashStoreId(event.target.value)}><option value="">Όλα τα καταστήματα</option>{(data?.companies||[]).flatMap(company=>company.stores.map(store=><option key={store.id} value={store.id}>{store.name}</option>))}</select></label><label>Ημερομηνία<input type="date" value={cashReportDate} onChange={event=>setCashReportDate(event.target.value)}/></label><label>Ώρα από<input type="time" value={cashFromTime} onChange={event=>setCashFromTime(event.target.value)}/></label><label>Ώρα έως<input type="time" value={cashToTime} onChange={event=>setCashToTime(event.target.value)}/></label><button onClick={()=>loadCashReport(cashReportDate)} disabled={busy==="cash-report"}><RefreshCw/>Εμφάνιση</button><button type="button" className="secondary" onClick={()=>window.print()}><Printer/>Εκτύπωση αναφοράς</button><label>Από<input type="date" value={cashRangeFrom} onChange={event=>setCashRangeFrom(event.target.value)}/></label><label>Έως<input type="date" value={cashRangeTo} onChange={event=>setCashRangeTo(event.target.value)}/></label><label>Χειριστής<input value={cashOperator} onChange={event=>setCashOperator(event.target.value)} placeholder="Όλοι οι χειριστές"/></label><button type="button" className="secondary" onClick={()=>downloadShortages()} disabled={busy==="cash-export:all"}><Download/>{busy==="cash-export:all"?"Δημιουργία…":"Excel ελλειμμάτων όλων"}</button></div>
      <div className="cash-report-totals"><span>Βάρδιες <b>{cashReport.totals.shifts}</b></span><span>Συνολικό έλλειμμα <b>{cashReport.totals.shortage.toFixed(2)} €</b></span><span>Πλεόνασμα <b>{cashReport.totals.surplus.toFixed(2)} €</b></span><span>Καθαρή διαφορά <b className={Math.abs(cashReport.totals.variance)>.009?"bad":"ok"}>{cashReport.totals.variance.toFixed(2)} €</b></span><span>POS–EFTPOS <b>{cashReport.totals.cardVariance.toFixed(2)} €</b></span><span>Χωρίς παραστατικό <b>{cashReport.totals.expensesWithoutDocument}</b></span></div>
      <div className="cash-store-summaries">{(cashReport.stores||[]).map(store=><article key={store.storeId}><small>{store.companyName}</small><h3>{store.storeName}</h3><span>Βάρδιες <b>{store.shifts}</b></span><span>Έλλειμμα <b className="bad">{store.shortage.toFixed(2)} €</b></span><span>Πλεόνασμα <b className="ok">{store.surplus.toFixed(2)} €</b></span><span>POS–EFTPOS <b>{store.cardVariance.toFixed(2)} €</b></span><span>Χωρίς παραστατικό <b>{store.expensesWithoutDocument}</b></span><button type="button" className="secondary" onClick={()=>sendCashPreviewToMe(store)} disabled={busy===`cash-preview:${store.storeId}`}><Send/>{busy===`cash-preview:${store.storeId}`?"Αποστολή…":"Δοκιμή στο email μου"}</button><button type="button" onClick={()=>previewAndSendCashReport(store)} disabled={busy===`cash-email:${store.storeId}`}><Send/>{busy===`cash-email:${store.storeId}`?"Αποστολή…":"Προεπισκόπηση & email ιδιοκτητών"}</button><button type="button" className="secondary" onClick={()=>downloadShortages(store)} disabled={busy===`cash-export:${store.storeId}`}><Download/>{busy===`cash-export:${store.storeId}`?"Δημιουργία…":"Excel ελλειμμάτων"}</button></article>)}</div>
      {cashReport.rows.length>0&&<section className="site-style-cash-reports">{(cashReport.stores||[]).map(store=>{const rows=cashReport.rows.filter(row=>row.storeId===store.storeId);const suspicious=rows.flatMap(row=>(row.investigation?.findings||[]).map(finding=>({row,finding})));const finalText=store.variance<-.009?`Έλλειμμα ${cashMoney(Math.abs(store.variance))}`:store.variance>.009?`Πλεόνασμα ${cashMoney(store.variance)}`:"Χωρίς διαφορά";return <article className="site-style-store-report" key={`site-report:${store.storeId}`}>
        <div className="site-result-head"><div><span className="result-ok">✓</span><div><h3>Ο έλεγχος των βαρδιών ολοκληρώθηκε</h3><p>{store.storeName} · αναλύθηκαν {rows.length} βάρδιες</p></div></div><span className="badge positive">Πραγματική ανάλυση</span></div>
        <div className="site-shift-table"><table><thead><tr><th>Ημερομηνία</th><th>Όνομα</th><th>Ώρες</th><th>Διαφορά</th><th>POS / EFTPOS</th><th>Αποτέλεσμα</th></tr></thead><tbody>{rows.map(row=>{const report=cashWrittenReport(row);return <tr className={report.alert?"sos-table-row":""} key={`site-row:${row.sessionId}`}><td>{cashReportDateLabel(cashReport.date)}</td><td><strong>{row.openedByName||"Χωρίς όνομα"}</strong></td><td>{athensTime(row.openedAt)}–{athensTime(row.closedAt)}<small>{row.shiftLabel||"Βάρδια"} · {row.terminalPos||"MAIN"}</small></td><td className={row.variance<-.009?"negative":row.variance>.009?"positive":""}>{cashMoney(row.variance)}</td><td>{cashMoney(row.cardVariance)}</td><td>{report.alert&&<span className="sos-badge">SOS</span>}{cashShiftResult(row)}</td></tr>})}</tbody></table></div>
        <div className="site-written-report"><div className="site-written-head"><div><p>ΕΤΟΙΜΟ ΓΙΑ ΑΠΟΣΤΟΛΗ</p><h3>Συνολική αναφορά ελέγχου ταμείου</h3></div><button type="button" className="secondary" onClick={()=>navigator.clipboard.writeText([`${store.storeName} — ${cashReportDateLabel(cashReport.date)}`,`Βάρδιες: ${rows.length}`,`Συνολικό έλλειμμα: ${cashMoney(store.shortage)}`,`Πλεόνασμα: ${cashMoney(store.surplus)}`,`POS–EFTPOS: ${cashMoney(store.cardVariance)}`,...suspicious.map(({finding})=>cashFindingLabel(finding)),`Τελικό αποτέλεσμα: ${finalText}`].join("\n"))}>Αντιγραφή συνολικής αναφοράς</button></div>
          <p className="site-overall-text">{store.storeName} — {cashReportDateLabel(cashReport.date)}. Ελέγχθηκαν {rows.length} βάρδιες, οι διαφορές ταμείου, POS–EFTPOS, οι πληρωμές και η αντιστοίχισή τους με τιμολόγια/παραστατικά, οι κινήσεις συναλλαγών, οι ακυρώσεις, οι επιστροφές, οι αντιλογισμοί και τα συμβάντα. Συνολικό έλλειμμα {cashMoney(store.shortage)}, πλεόνασμα {cashMoney(store.surplus)} και καθαρή διαφορά {cashMoney(store.variance)}.</p>
          <h4>Ανάλυση ανά βάρδια</h4>{rows.map(row=>{const report=cashWrittenReport(row);return <article className={report.alert?"site-shift-note sos-note":"site-shift-note"} key={`note:${row.sessionId}`}><div><span>{cashReportDateLabel(cashReport.date)}</span><strong>{row.openedByName||"Χωρίς όνομα"}</strong><small>{row.shiftLabel||"Βάρδια"} · {athensTime(row.openedAt)}–{athensTime(row.closedAt)}</small></div><div>{report.paragraphs.map((line,index)=><p key={`line:${row.sessionId}:${index}`}>{report.alert&&index===0&&<strong>SOS — </strong>}{line}</p>)}</div></article>})}
          <div className="site-report-total"><span>Τελικό αποτέλεσμα καταστήματος</span><strong>{finalText}</strong></div>
        </div><p className="site-explanation">Ελλείμματα: {cashMoney(store.shortage)} · Πλεονάσματα: {cashMoney(store.surplus)}. Οι κανονικές κινήσεις δεν εμφανίζονται· εμφανίζονται μόνο τα περίεργα συμβάντα με την ακριβή ώρα.</p>
      </article>})}</section>}
    </section></div>}

    {showNew&&<div className="platform-modal"><form onSubmit={createCompany}><button type="button" className="modal-close" onClick={()=>setShowNew(false)}><X/></button><h2>Νέος εμπορικός πελάτης</h2><p>Δημιουργούνται εταιρεία, ιδιοκτήτης και πρώτο κατάστημα.</p><div className="platform-form-grid"><label>Επωνυμία εταιρείας<input name="companyName" required/></label><label>ΑΦΜ<input name="taxId"/></label><label>Πόλη<input name="city"/></label><label>Τηλέφωνο<input name="phone"/></label><label>Email εταιρείας<input name="companyEmail" type="email"/></label><label>Πακέτο<select name="plan" defaultValue="TRIAL">{plans.map(plan=><option value={plan} key={plan}>{planLabels[plan]}</option>)}</select></label><label>Ημέρες δοκιμής<input name="trialDays" type="number" min="1" max="365" defaultValue="14"/></label><div></div><label>Ονοματεπώνυμο ιδιοκτήτη<input name="ownerFullName" required/></label><label>Email ιδιοκτήτη<input name="ownerEmail" type="email" required/></label><label>Προσωρινός κωδικός<input name="temporaryPassword" type="password" minLength="8" required/></label><div></div><label>Πρώτο κατάστημα<input name="storeName" required/></label><label>Πόλη καταστήματος<input name="storeCity"/></label></div><div className="platform-form-actions"><button type="button" className="secondary" onClick={()=>setShowNew(false)}>Ακύρωση</button><button disabled={busy==="create"}>{busy==="create"?"Δημιουργία…":"Δημιουργία πελάτη"}</button></div></form></div>}
    {deleteCompany&&<div className="platform-modal"><form onSubmit={permanentlyDeleteCompany}><button type="button" className="modal-close" onClick={()=>setDeleteCompany(null)}><X/></button><h2>Οριστική διαγραφή KAT TEST</h2><p><AlertTriangle/> Θα διαγραφούν οριστικά η εταιρεία, τα καταστήματα, οι χρήστες, οι εργαζόμενοι και όλα τα δοκιμαστικά δεδομένα της. Η ενέργεια δεν αναιρείται.</p><div className="platform-form-grid"><label>Γράψε KAT TEST<input name="confirmationName" autoComplete="off" required/></label><label>Γράψε DELETE KAT TEST<input name="confirmationPhrase" autoComplete="off" required/></label></div><div className="platform-form-actions"><button type="button" className="secondary" onClick={()=>setDeleteCompany(null)}>Ακύρωση</button><button className="danger" disabled={busy==="delete-company"}>{busy==="delete-company"?"Οριστική διαγραφή…":"Διαγραφή όλων των δεδομένων"}</button></div></form></div>}

    {ownerCompany&&<div className="platform-modal"><form className="small" onSubmit={saveOwner}><button type="button" className="modal-close" onClick={()=>setOwnerCompany(null)}><X/></button><h2>{ownerCompany.owner?"Στοιχεία ιδιοκτήτη πελάτη":"Ορισμός ιδιοκτήτη πελάτη"}</h2><p>{ownerCompany.name}</p><label>Ονοματεπώνυμο<input name="fullName" defaultValue={ownerCompany.owner?.fullName||""} required autoFocus/></label><label>Email<input name="email" type="email" defaultValue={ownerCompany.owner?.email||""} required/></label><label>{ownerCompany.owner?"Νέος προσωρινός κωδικός — προαιρετικό":"Προσωρινός κωδικός"}<input name="temporaryPassword" type="password" minLength="8" required={!ownerCompany.owner}/></label><div className="platform-form-actions"><button type="button" className="secondary" onClick={()=>setOwnerCompany(null)}>Ακύρωση</button><button disabled={busy==="owner"}>{busy==="owner"?"Αποθήκευση…":"Αποθήκευση ιδιοκτήτη"}</button></div></form></div>}

    {resetCompany&&<div className="platform-modal"><form className="small" onSubmit={resetPassword}><button type="button" className="modal-close" onClick={()=>setResetCompany(null)}><X/></button><h2>Νέος προσωρινός κωδικός</h2><p>{resetCompany.owner?.fullName} · {resetCompany.owner?.email}</p><label>Προσωρινός κωδικός<input name="temporaryPassword" type="password" minLength="8" required autoFocus/></label><div className="platform-form-actions"><button type="button" className="secondary" onClick={()=>setResetCompany(null)}>Ακύρωση</button><button disabled={busy==="reset"}>{busy==="reset"?"Αποθήκευση…":"Αλλαγή κωδικού"}</button></div></form></div>}

    {storeCompany&&!storeEdit&&!terminalManager&&<div className="platform-modal"><section className="platform-security-dialog"><button type="button" className="modal-close" onClick={()=>setStoreCompany(null)}><X/></button><h2>Καταστήματα πελάτη</h2><p>{storeCompany.name}</p><div className="security-list">{storeCompany.stores.map(store=><article key={store.id}><Store/><div><b>{store.name}</b><span>{store.city||"Χωρίς πόλη"}</span><small>{store.responsibleEmail||"Δεν έχει οριστεί email υπευθύνου"} · Email κλεισίματος: {store.cashCloseEmailEnabled!==false?"ΝΑΙ":"ΟΧΙ"}</small></div><div className="platform-store-actions"><button onClick={()=>openTerminals(storeCompany,store)} disabled={busy===`terminals:${store.id}`}><Monitor/>{busy===`terminals:${store.id}`?"Φόρτωση…":"Εγκαταστάσεις / Τερματικά"}</button><a href={storeModeUrl(store)} target="_blank" rel="noreferrer"><ExternalLink/>Store Mode</a><button className="secondary" onClick={()=>downloadStoreShortcut(store)}><Download/>Απλή συντόμευση</button><button onClick={()=>openCustomer(storeCompany,store,"BACKOFFICE")}><LayoutDashboard/>Πλήρες Backoffice</button><button className="secondary" onClick={()=>openOnlineStore(storeCompany,store)} disabled={busy===`online-store:${store.id}`}><ShoppingBag/>{busy===`online-store:${store.id}`?"Φόρτωση…":"Online Store"}</button>{storeCompany.modules?.some(module=>module.key==="TABLE_SERVICE"&&module.active)&&<button className="secondary" onClick={()=>toggleTableService(storeCompany,store)} disabled={busy===`tables:${store.id}`}><UsersRound/>{busy===`tables:${store.id}`?"Έλεγχος…":"TABLE_SERVICE ενεργό/ανενεργό"}</button>}<button className="secondary" onClick={()=>openCustomer(storeCompany,store,"SHIFTS")}><CalendarDays/>Βάρδιες</button><button className="secondary" onClick={()=>openCustomer(storeCompany,store,"CASH_CONTROL")}><WalletCards/>Έλεγχος Ταμείων</button><button className="secondary" onClick={()=>checkReadiness(storeCompany,store)} disabled={busy===`readiness:${store.id}`}><ShieldCheck/>{busy===`readiness:${store.id}`?"Έλεγχος…":"Ετοιμότητα"}</button><button className="secondary" onClick={()=>setStoreEdit(store)}>Επεξεργασία</button></div></article>)}</div></section></div>}

    {terminalManager&&<div className="platform-modal"><section className="platform-security-dialog terminal-manager-dialog"><button type="button" className="modal-close" onClick={()=>setTerminalManager(null)}><X/></button><h2>Εγκαταστάσεις / Τερματικά</h2><p>{terminalManager.company.name} · {terminalManager.store.name}</p><div className="terminal-explainer"><ShieldCheck/><span>Κάθε PC παίρνει δικό του Terminal ID. Όλα τα τερματικά του καταστήματος χρησιμοποιούν την ίδια αποθήκη, ενώ κρατούν χωριστές βάρδιες και ταμεία.</span></div><form className="terminal-create-form" onSubmit={createTerminal}><label>Terminal ID<input name="terminalPos" placeholder="KAT-POS-01" pattern="[A-Za-z0-9_-]+" required/></label><label>Όνομα PC / ταμείου<input name="displayName" placeholder="Ταμείο 1 — Είσοδος" required/></label><button disabled={busy==="terminal-create"}><Plus/>{busy==="terminal-create"?"Δημιουργία…":"Δημιουργία τερματικού"}</button></form>{terminalManager.activationUrl&&<div className="terminal-activation-box"><b>Link εγκατάστασης για {terminalManager.activationTerminal}</b><input value={terminalManager.activationUrl} readOnly/><button onClick={copyActivation}><Copy/>Αντιγραφή link</button><small>Άνοιξέ το μόνο στο PC που θα γίνει αυτό το ταμείο. Ισχύει 24 ώρες και μόνο μία φορά.</small></div>}<div className="security-list terminal-list">{terminalManager.terminals.length===0?<p>Δεν υπάρχουν τερματικά. Δημιούργησε ένα για κάθε PC.</p>:terminalManager.terminals.map(terminal=><article key={terminal.id}><Monitor/><div><b>{terminal.displayName}</b><span>{terminal.terminalPos} · {terminal.active?"Ενεργό":"Ανενεργό"}</span><small>{terminal.activatedAt?`Ενεργοποιήθηκε ${new Date(terminal.activatedAt).toLocaleString("el-GR")}`:terminal.activationPending?"Αναμένει εγκατάσταση":"Δεν έχει ενεργοποιηθεί"}{terminal.lastSeenAt?` · Τελευταία χρήση ${new Date(terminal.lastSeenAt).toLocaleString("el-GR")}`:""}</small></div><div className="platform-store-actions"><button className="secondary" onClick={()=>rotateTerminalActivation(terminal)} disabled={!terminal.active||busy===`terminal-link:${terminal.id}`}><Copy/>{busy===`terminal-link:${terminal.id}`?"Έκδοση…":"Νέο link"}</button><button className="secondary" onClick={()=>toggleTerminal(terminal)} disabled={busy===`terminal-toggle:${terminal.id}`}>{terminal.active?"Απενεργοποίηση":"Ενεργοποίηση"}</button></div></article>)}</div></section></div>}

    {readiness&&<div className="platform-modal"><section className="platform-security-dialog readiness-dialog"><button type="button" className="modal-close" onClick={()=>setReadiness(null)}><X/></button><h2>Έλεγχος ετοιμότητας καταστήματος</h2><p>{readiness.company.name} · {readiness.store.name}</p><form className="pilot-profile-form" onSubmit={savePilotProfile}><h3>Κλείδωμα πιλοτικής εγκατάστασης</h3><div><label>Όνομα PC<input name="pcName" defaultValue={readiness.profile?.pcName||"Windows PC ΚΑΤ"} required/></label><label>Ωράριο λειτουργίας<input name="operatingHours" defaultValue={readiness.profile?.operatingHours||"24ωρη λειτουργία"} required/></label><label>Υπεύθυνος εγκατάστασης<input name="responsibleName" defaultValue={readiness.profile?.responsibleName||"Χρήστος Μάνης"} required/></label><label>Σημειώσεις<input name="notes" defaultValue={readiness.profile?.notes||""}/></label></div><div className="pilot-freeze-checks"><label><input type="checkbox" checked={Boolean(readiness.profile?.backupConfirmedAt)} readOnly disabled/> Ασφαλές backup {readiness.profile?.backupConfirmedAt?"ολοκληρώθηκε":"εκκρεμεί"}</label><button type="button" className="secondary" onClick={downloadPilotBackup} disabled={busy==="pilot-backup"}><Download/>{busy==="pilot-backup"?"Δημιουργία…":"Λήψη ασφαλούς backup"}</button><label className="secondary" style={{cursor:"pointer"}}><ShieldCheck/>{busy==="pilot-backup-verify"?"Έλεγχος…":"Έλεγχος αρχείου backup"}<input type="file" accept="application/json,.json" onChange={verifyPilotBackup} disabled={busy==="pilot-backup-verify"} style={{display:"none"}}/></label><label><input type="checkbox" name="designFrozen" defaultChecked={Boolean(readiness.profile?.designFrozenAt)}/> Κλείδωμα υπάρχοντος design</label><label><input type="checkbox" name="databaseFrozen" defaultChecked={Boolean(readiness.profile?.databaseFrozenAt)}/> Κλείδωμα δομής βάσης</label></div>{recoveryWorkflow&&<div className="readiness-summary ready" data-recovery-workflow-center="true"><ShieldCheck/><div><b>RECOVERY WORKFLOW · DRY-RUN PASSED</b><span>Run {recoveryWorkflow.recoveryReport?.workflowRunId} · SHA-256 {String(recoveryWorkflow.checksum||"").slice(0,16)} · πραγματικό restore ΚΛΕΙΔΩΜΕΝΟ</span><small>Δεν άλλαξε η βάση, δεν επανήλθαν secrets και δεν έγινε κλήση σε RBS/EFTPOS/fiscal provider.</small></div></div>}<h3 className="pilot-smoke-title">Πραγματικές δοκιμές καταστήματος</h3><div className="pilot-freeze-checks pilot-smoke-checks"><label><input type="checkbox" name="loginTested" defaultChecked={Boolean(readiness.profile?.loginTestedAt)}/> Είσοδος με PIN/κάρτα</label><label><input type="checkbox" name="shiftOpenTested" defaultChecked={Boolean(readiness.profile?.shiftOpenTestedAt)}/> Άνοιγμα βάρδιας</label><label><input type="checkbox" name="shiftCloseTested" defaultChecked={Boolean(readiness.profile?.shiftCloseTestedAt)}/> Κλείσιμο βάρδιας</label><label><input type="checkbox" name="kioskUnaffected" defaultChecked={Boolean(readiness.profile?.kioskUnaffectedAt)}/> Kiosk Manager ανεπηρέαστο</label></div><p className="pilot-smoke-note">Τσεκάρεται μόνο μετά από πραγματική δοκιμή. Το MyWorkStation δεν στέλνει εντολές σε RBS ή ταμειακή.</p><button disabled={busy==="pilot-profile"}>{busy==="pilot-profile"?"Αποθήκευση…":"Αποθήκευση και επανέλεγχος"}</button></form><div className={`readiness-summary ${readiness.ready?"ready":"blocked"}`}>{readiness.ready?<CheckCircle2/>:<AlertTriangle/>}<div><b>{readiness.ready?"ΕΤΟΙΜΟ ΓΙΑ ΠΑΡΑΛΛΗΛΗ ΠΙΛΟΤΙΚΗ ΛΕΙΤΟΥΡΓΙΑ":`${readiness.blockers} ΥΠΟΧΡΕΩΤΙΚΕΣ ΕΚΚΡΕΜΟΤΗΤΕΣ`}</b><span>Έλεγχος: {new Date(readiness.checkedAt).toLocaleString("el-GR")}</span></div></div><div className="readiness-list">{readiness.checks.map(check=><article className={check.ok?"ok":"missing"} key={check.key}>{check.ok?<CheckCircle2/>:<AlertTriangle/>}<div><b>{check.label}</b><span>{check.detail}</span></div><em>{check.ok?"OK":check.blocking?"ΥΠΟΧΡΕΩΤΙΚΟ":"ΠΡΟΑΙΡΕΤΙΚΟ"}</em></article>)}</div><p className="readiness-note">Ο έλεγχος είναι μόνο ανάγνωσης. Δεν ανοίγει βάρδια, δεν δημιουργεί συναλλαγές και δεν επικοινωνεί με RBS/ταμειακή.</p></section></div>}

    {storeCompany&&storeEdit&&<div className="platform-modal"><form className="small" onSubmit={saveStore}><button type="button" className="modal-close" onClick={()=>setStoreEdit(null)}><X/></button><h2>Επεξεργασία καταστήματος</h2><p>{storeCompany.name}</p><label>Όνομα καταστήματος<input name="name" defaultValue={storeEdit.name} required autoFocus/></label><label>Πόλη<input name="city" defaultValue={storeEdit.city||""}/></label><label>Email υπευθύνου αναφορών<input name="responsibleEmail" type="email" defaultValue={storeEdit.responsibleEmail||""} placeholder="manager@example.gr"/></label><p>Οι αναφορές στέλνονται μόνο όταν ο Super Admin πατήσει την αποστολή μετά τον ολοκληρωμένο έλεγχο.</p><div className="platform-form-actions"><button type="button" className="secondary" onClick={()=>setStoreEdit(null)}>Πίσω</button><button disabled={busy==="store"}>{busy==="store"?"Αποθήκευση…":"Αποθήκευση καταστήματος"}</button></div></form></div>}
    {readiness&&<form className="readiness-manager-floating" onSubmit={assignStoreModeManager}><select name="employeeId" defaultValue={readiness.operators?.find(row=>row.role==="MANAGER")?.employeeId||""} required><option value="" disabled>Υπεύθυνος Store Mode</option>{(readiness.operators||[]).filter(row=>row.hasCredential).map(row=><option key={row.employeeId} value={row.employeeId}>{row.displayName}{row.role==="MANAGER"?" — τρέχων":""}</option>)}</select><button disabled={busy==="store-mode-manager"}>{busy==="store-mode-manager"?"Αποθήκευση…":"Ορισμός υπευθύνου"}</button><small>Απομακρυσμένα · δεν αλλάζει PIN και δεν ανοίγει βάρδια</small></form>}
    {readiness&&<button type="button" className="readiness-print-floating" onClick={()=>window.print()}><Printer/>Εκτύπωση ελέγχου</button>}
    {terminalManager&&terminalManager.terminals.length>0&&<form className="readiness-manager-floating terminal-routing-floating" onSubmit={saveTerminalDeviceRouting}><b>Fiscal / EFTPOS mapping</b><select name="terminalPos" required defaultValue=""><option value="" disabled>Επίλεξε terminal</option>{terminalManager.terminals.filter(row=>row.active).map(row=><option key={row.id} value={row.terminalPos}>{row.terminalPos} · {row.displayName}</option>)}</select><input name="fiscalDeviceCode" placeholder="KAT-FISCAL-01" pattern="[A-Za-z0-9_-]+" required/><input name="fiscalDisplayName" placeholder="Ταμειακή 1" required/><input name="storeEftposCode" placeholder="KAT-EFTPOS-01A" pattern="[A-Za-z0-9_-]+" required/><input name="storeEftposName" placeholder="EFTPOS καταστήματος" required/><input name="deliveryEftposCode" placeholder="KAT-EFTPOS-01B" pattern="[A-Za-z0-9_-]+" required/><input name="deliveryEftposName" placeholder="EFTPOS Delivery / Online" required/><button disabled={busy==="device-routing"}>{busy==="device-routing"?"Αποθήκευση…":"Αποθήκευση mapping"}</button><small>Fail-closed: δεν γίνεται αυτόματη επιλογή άλλου EFTPOS.</small></form>}
    {onlineStoreManager&&<OnlineStoreManager manager={onlineStoreManager} setManager={setOnlineStoreManager} request={request} onClose={()=>setOnlineStoreManager(null)} setBusy={setBusy} busy={busy} setError={setError} setMessage={setMessage}/>}
    {storeCompany&&!videoConnectionManager&&storeCompany.modules?.some(module=>module.key==="VIDEO_EVENTS"&&module.active)&&<div style={{position:"fixed",left:32,bottom:32,zIndex:1002,display:"grid",gap:8}}>{storeCompany.stores.map(store=><button key={store.id} onClick={()=>openVideoConnection(storeCompany,store)} disabled={busy===`video:${store.id}`}><Camera/>{busy===`video:${store.id}`?"Φόρτωση…":`Video Events · ${store.name}`}</button>)}</div>}
    {storeCompany&&!fiscalIntegrations&&!storeEdit&&!terminalManager&&<div className="platform-store-integrations-launcher">{storeCompany.stores.map(store=><button key={store.id} type="button" onClick={()=>openFiscalIntegrations(storeCompany,store)} disabled={busy===`integrations:${store.id}`}><KeyRound/>{busy===`integrations:${store.id}`?"Φόρτωση…":`myDATA / ΑΦΜ · ${store.name}`}</button>)}</div>}
    {videoConnectionManager&&<VideoConnectionManager manager={videoConnectionManager} request={request} onClose={()=>setVideoConnectionManager(null)} setError={setError} setMessage={setMessage}/>}
    {fiscalIntegrations&&<StoreFiscalIntegrations manager={fiscalIntegrations} request={request} onClose={()=>setFiscalIntegrations(null)} onChanged={refreshFiscalIntegrations}/>}
    {analyticsResult&&<div className="platform-alert success">Έλεγχος Super Admin: {analyticsResult.rows.length} κατάστημα(τα), {analyticsResult.findings.length} εύρημα(τα). Η ανάλυση είναι μόνο για ανάγνωση και δεν άλλαξε ταμείο, τράπεζα, απόθεμα ή υπόλοιπα.</div>}
    {showSupplierSettlementReview&&<SupplierSettlementReviewCenter request={request} onClose={()=>setShowSupplierSettlementReview(false)} setMessage={setMessage}/>}
    {showOtherExpenseReview&&<OtherExpenseReviewCenter request={request} onClose={()=>setShowOtherExpenseReview(false)} setMessage={setMessage}/>}
    {showInstallationCenter&&<SuperAdminInstallationCenter companies={data?.companies||[]} request={request} onOpenTerminals={openTerminals} onClose={()=>setShowInstallationCenter(false)}/>}
    {(deviceOperationsManager||terminalManager)&&<DeviceOperationsCenter manager={deviceOperationsManager||terminalManager} request={request} initialOpen={Boolean(deviceOperationsManager)||openDeviceCenter} onLaunch={()=>{if(terminalManager){setDeviceOperationsManager(terminalManager);setTerminalManager(null)}}}/>}
  </div>;
}
