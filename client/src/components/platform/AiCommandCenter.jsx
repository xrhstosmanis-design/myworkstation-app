import React,{useEffect,useMemo,useState} from "react";
import {AlertTriangle,BarChart3,BrainCircuit,Building2,CheckCircle2,ChevronRight,FileSearch,Landmark,MessageCircle,ReceiptText,RefreshCw,ShieldCheck,Store,WalletCards,X} from "lucide-react";

const countStores=companies=>companies.reduce((total,company)=>total+(company.stores?.length||0),0);

const athensToday=()=>new Intl.DateTimeFormat("en-CA",{timeZone:"Europe/Athens",year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date());
const invoiceNumber=value=>{if(typeof value==="number")return Number.isFinite(value)?value:null;const raw=String(value??"").trim();if(!raw)return null;const normalized=raw.includes(",")?raw.replace(/\./g,"").replace(",","."):raw,n=Number(normalized.replace(/[^0-9.-]/g,""));return Number.isFinite(n)?n:null};
const invoiceIdentity=document=>[document.supplierTaxId||String(document.supplierName||"").toUpperCase().trim(),document.invoiceNo||document.invoiceNumber||document.filename||"",document.invoiceDate||""].join("|");
const invoiceLineNet=line=>{const stored=invoiceNumber(line.netValue??line.netAmount);if(stored!==null)return stored;const quantity=invoiceNumber(line.quantity),price=invoiceNumber(line.unitPrice??line.unitCost);if(!(quantity>0&&price>=0))return 0;return [line.discount1,line.discount2,line.discount3].reduce((value,discount)=>value*(1-(invoiceNumber(discount)||0)/100),quantity*price)};

export default function AiCommandCenter({request,companies=[],loading=false,onClose,onRefresh,onOpenChecks,onOpenCash,onOpenPayments,onOpenBank,onOpenEvents,onOpenInvoices}){
  const [problems,setProblems]=useState({loading:true,error:"",cash:null,payments:null,bank:null});
  const [invoiceIntel,setInvoiceIntel]=useState({loading:true,error:"",workspace:null});
  const [question,setQuestion]=useState("");
  const [askState,setAskState]=useState({loading:false,error:"",result:null});
  const loadProblems=async()=>{
    setProblems(current=>({...current,loading:true,error:""}));
    try{
      const date=athensToday();
      const [cash,payments,bank]=await Promise.all([
        request(`/api/platform/cash-control/daily?${new URLSearchParams({date,fromTime:"00:00",toTime:"23:59"})}`),
        request("/api/transactions/supplier-settlements/review"),
        request("/api/transactions/bank-ledger/review")
      ]);
      setProblems({loading:false,error:"",cash,payments,bank});
    }catch(error){setProblems(current=>({...current,loading:false,error:error.message||"Δεν φορτώθηκαν οι υπάρχοντες έλεγχοι."}))}
  };
  const loadInvoiceIntel=async()=>{setInvoiceIntel(current=>({...current,loading:true,error:""}));try{const workspace=await request("/api/platform/invoice-learning/workspace");setInvoiceIntel({loading:false,error:"",workspace})}catch(error){setInvoiceIntel(current=>({...current,loading:false,error:error.message||"Δεν φορτώθηκε το Invoice Learning."}))}};
  useEffect(()=>{loadProblems();loadInvoiceIntel()},[]);
  const summary=useMemo(()=>{
    const activeCompanies=companies.filter(company=>company.active);
    const inactiveCompanies=companies.filter(company=>!company.active);
    const stores=countStores(companies);
    const attention=inactiveCompanies.length+activeCompanies.filter(company=>(company.stores?.length||0)===0).length;
    return{activeCompanies:activeCompanies.length,inactiveCompanies:inactiveCompanies.length,stores,attention};
  },[companies]);
  const problemSummary=useMemo(()=>{
    const cashTotals=problems.cash?.totals||{};
    const cashIssues=(Number(cashTotals.shortage||0)>.009?1:0)+(Math.abs(Number(cashTotals.cardVariance||0))>.009?1:0)+Number(cashTotals.expensesWithoutDocument||0)+Number(cashTotals.duplicateCandidates||0);
    const paymentItems=problems.payments?.items||[];
    const bankItems=problems.bank?.items||[];
    return{cashIssues,payments:paymentItems.length,paymentDiscrepancies:paymentItems.filter(item=>item.status==="DISCREPANCY").length,bank:bankItems.length,bankDiscrepancies:bankItems.filter(item=>item.status==="DISCREPANCY").length,total:cashIssues+paymentItems.length+bankItems.length};
  },[problems]);
  const storeStatuses=useMemo(()=>{
    const cashByStore=new Map((problems.cash?.stores||[]).map(item=>[item.storeId,item]));
    const paymentsByStore=new Map(),bankByStore=new Map();
    for(const item of problems.payments?.items||[]){const list=paymentsByStore.get(item.storeId)||[];list.push(item);paymentsByStore.set(item.storeId,list)}
    for(const item of problems.bank?.items||[]){const list=bankByStore.get(item.storeId)||[];list.push(item);bankByStore.set(item.storeId,list)}
    return companies.flatMap(company=>(company.stores||[]).map(store=>{
      const cash=cashByStore.get(store.id),payments=paymentsByStore.get(store.id)||[],bank=bankByStore.get(store.id)||[];
      const cashDanger=(Number(cash?.shortage||0)>.009?1:0)+(Math.abs(Number(cash?.cardVariance||0))>.009?1:0);
      const cashReview=Number(cash?.expensesWithoutDocument||0)+Number(cash?.duplicateCandidates||0);
      const discrepancies=payments.filter(item=>item.status==="DISCREPANCY").length+bank.filter(item=>item.status==="DISCREPANCY").length;
      const pending=payments.length+bank.length-discrepancies;
      const inactive=!company.active||store.active===false,missingCash=!cash;
      const state=inactive||cashDanger||discrepancies?"danger":cashReview||pending||missingCash?"warn":"ok";
      const label=state==="danger"?"ΠΡΟΒΛΗΜΑ":state==="warn"?"ΕΛΕΓΧΟΣ":"ΟΚ";
      const reasons=[];
      if(inactive)reasons.push("Ανενεργή μονάδα");
      if(cashDanger)reasons.push(`${cashDanger} σοβαρά ταμειακά`);
      if(cashReview)reasons.push(`${cashReview} ταμειακά προς έλεγχο`);
      if(payments.length)reasons.push(`${payments.length} πληρωμές`);
      if(bank.length)reasons.push(`${bank.length} τραπεζικά`);
      if(missingCash&&!inactive)reasons.push("Χωρίς σημερινό κλείσιμο");
      const open=cashDanger||cashReview?onOpenCash:payments.length?onOpenPayments:bank.length?onOpenBank:missingCash?onOpenCash:onOpenChecks;
      return{id:store.id,name:store.name,companyName:company.name,state,label,reasons,open};
    }));
  },[companies,problems,onOpenBank,onOpenCash,onOpenChecks,onOpenPayments]);
  const storeStatusTotals=useMemo(()=>storeStatuses.reduce((all,item)=>{all[item.state]++;return all},{ok:0,warn:0,danger:0}),[storeStatuses]);
  const dailyPriorities=useMemo(()=>{
    const storeItems=storeStatuses.filter(store=>store.state!=="ok").map(store=>({
      id:`store:${store.id}`,state:store.state,title:store.name,context:store.companyName,
      detail:store.reasons.join(" · ")||"Χρειάζεται έλεγχο",open:store.open
    }));
    const companyItems=companies.filter(company=>(company.stores?.length||0)===0).map(company=>({
      id:`company:${company.id}`,state:!company.active?"danger":"warn",title:company.name,context:"Εταιρεία",
      detail:!company.active?"Ανενεργή εταιρεία":"Δεν έχει συνδεδεμένο κατάστημα",open:onOpenChecks
    }));
    const weight={danger:0,warn:1};
    return [...storeItems,...companyItems].sort((a,b)=>weight[a.state]-weight[b.state]||a.title.localeCompare(b.title,"el")).slice(0,5);
  },[companies,onOpenChecks,storeStatuses]);
  const invoiceDetective=useMemo(()=>{
    const state=invoiceIntel.workspace?.state||{},documents=Array.isArray(state.documents)?state.documents:[],profiles=state.profiles&&typeof state.profiles==="object"?state.profiles:{};
    const duplicateGroups=new Map();for(const document of documents){const key=invoiceIdentity(document);if(key.replaceAll("|","").trim()){const group=duplicateGroups.get(key)||[];group.push(document);duplicateGroups.set(key,group)}}
    const duplicates=[...duplicateGroups.values()].filter(group=>group.length>1),findings=new Map(),add=(document,stateValue,reason)=>{const key=document.id||invoiceIdentity(document),current=findings.get(key)||{id:key,document,state:"warn",reasons:[]};if(stateValue==="danger")current.state="danger";if(!current.reasons.includes(reason))current.reasons.push(reason);findings.set(key,current)};
    let drafts=0,reviewLines=0,totalMismatches=0,discountReviews=0;const priceChanges=[];
    const ordered=[...documents].sort((a,b)=>new Date(a.updatedAt||a.createdAt||0)-new Date(b.updatedAt||b.createdAt||0)),lastPrices=new Map();
    for(const document of ordered){
      const lines=Array.isArray(document.lines)?document.lines.filter(line=>line.status!=="REJECTED"):[];if(document.status!=="LEARNED")drafts++;
      const reviews=lines.filter(line=>line.status==="REVIEW"||line.resolutionStatus==="UNRESOLVED"||line.needsReview===true);reviewLines+=reviews.length;if(reviews.length)add(document,"warn",`${reviews.length} γραμμές προς έλεγχο`);
      const discountIssues=lines.filter(line=>[line.reviewReason,line.ocrReviewReasons,...(Array.isArray(line.reasons)?line.reasons:[])].join(" ").match(/DISCOUNT|ΕΚΠΤ/i)||[line.discount1,line.discount2,line.discount3].some(value=>{const n=invoiceNumber(value);return n!==null&&(n<0||n>100)}));discountReviews+=discountIssues.length;if(discountIssues.length)add(document,"warn",`${discountIssues.length} εκπτώσεις προς έλεγχο`);
      const calculated=lines.reduce((sum,line)=>{const net=invoiceLineNet(line),vat=invoiceNumber(line.vatRate)||0;return sum+net+Math.round(net*vat)/100},0),declared=invoiceNumber(document.sourceGrossAmount??document.totalGross??document.grossAmount),difference=declared===null?null:Math.abs(declared-calculated);
      if(difference!==null&&difference>.05){totalMismatches++;add(document,"danger",`Διαφορά συνόλου ${difference.toLocaleString("el-GR",{minimumFractionDigits:2,maximumFractionDigits:2})} €`)}
      for(const line of lines){const supplier=document.supplierTaxId||String(document.supplierName||"").toUpperCase().trim(),code=line.supplierItemCode||line.code;if(!supplier||!code)continue;const quantity=invoiceNumber(line.quantity),net=invoiceLineNet(line),factor=invoiceNumber(line.stockUnitsPerInvoiceUnit??line.unitsPerPackage??line.conversionFactor)||1;if(!(quantity>0&&net>=0&&factor>0))continue;const price=net/quantity,key=`${supplier}|${code}|${factor}`,previous=lastPrices.get(key);if(previous&&Math.abs(price-previous.price)>.01&&Math.abs(price-previous.price)/Math.max(previous.price,.01)>.01){priceChanges.push({document,code,from:previous.price,to:price});add(document,"warn",`Μεταβολή τιμής στον κωδικό ${code}`)}lastPrices.set(key,{price,document})}
    }
    for(const group of duplicates)for(const document of group)add(document,"danger",`Πιθανό διπλό παραστατικό (${group.length} εγγραφές)`);
    const items=[...findings.values()].sort((a,b)=>(a.state==="danger"?0:1)-(b.state==="danger"?0:1)||new Date(b.document.updatedAt||b.document.createdAt||0)-new Date(a.document.updatedAt||a.document.createdAt||0)).slice(0,5);
    return{documents:documents.length,drafts,learned:documents.length-drafts,reviewLines,totalMismatches,discountReviews,duplicates:duplicates.length,priceChanges:priceChanges.length,profiles:Object.keys(profiles).length,items};
  },[invoiceIntel.workspace]);
  const refresh=()=>{onRefresh?.();loadProblems();loadInvoiceIntel()};
  const ask=async event=>{
    event.preventDefault();
    const value=question.trim()||"Ποια σημεία χρειάζονται έλεγχο σήμερα;";if(askState.loading)return;
    setAskState({loading:true,error:"",result:null});
    try{
      const companyStates=companies.map(company=>({name:company.name,active:Boolean(company.active),stores:company.stores?.length||0}));
      const result=await request("/api/platform/ai-command-center/ask",{method:"POST",body:JSON.stringify({question:value,snapshot:{
        generatedAt:new Date().toISOString(),
        companies:{active:summary.activeCompanies,inactive:summary.inactiveCompanies,stores:summary.stores,attention:summary.attention},
        problems:{total:problemSummary.total,cash:problemSummary.cashIssues,payments:problemSummary.payments,paymentDiscrepancies:problemSummary.paymentDiscrepancies,bank:problemSummary.bank,bankDiscrepancies:problemSummary.bankDiscrepancies},
        companyStates
      }})});
      setAskState({loading:false,error:"",result});
    }catch(error){setAskState({loading:false,error:error.message||"Δεν ήταν δυνατή η απάντηση.",result:null})}
  };

  return <div className="ai-command-page" data-ai-command-center="phase-6">
    <section className="ai-command-shell">
      <header className="ai-command-header">
        <div className="ai-command-heading"><span className="ai-command-mark"><BrainCircuit/></span><div><small>SUPER ADMIN · ΦΑΣΗ 6</small><h1>AI Command Center</h1><p>Μία κεντρική εικόνα της επιχείρησης, πάνω στις υπάρχουσες λειτουργίες του MyWorkStation.</p></div></div>
        <div className="ai-command-header-actions"><span><ShieldCheck/> Μόνο ανάγνωση</span><button type="button" onClick={refresh} disabled={loading||problems.loading||invoiceIntel.loading}><RefreshCw/> {loading||problems.loading||invoiceIntel.loading?"Ανανέωση…":"Ανανέωση"}</button><button type="button" className="ai-command-close" onClick={onClose} aria-label="Κλείσιμο AI Command Center"><X/></button></div>
      </header>

      <div className="ai-command-safety"><ShieldCheck/><div><b>Μία πηγή δεδομένων</b><p>Το Command Center δεν κρατά δεύτερα στοιχεία. Διαβάζει τη σημερινή επισκόπηση και σε οδηγεί στις κανονικές οθόνες για έλεγχο και ενέργειες.</p></div></div>

      <section className="ai-command-metrics" aria-label="Επισκόπηση επιχείρησης">
        <article className="ok"><Building2/><div><span>Ενεργές εταιρείες</span><strong>{summary.activeCompanies}</strong><small>Από τη σημερινή επισκόπηση</small></div></article>
        <article><Store/><div><span>Καταστήματα</span><strong>{summary.stores}</strong><small>Σε όλη την πλατφόρμα</small></div></article>
        <article className={summary.attention?"warn":"ok"}>{summary.attention?<AlertTriangle/>:<CheckCircle2/>}<div><span>Χρειάζονται έλεγχο</span><strong>{summary.attention}</strong><small>{summary.attention?"Ανενεργές εταιρείες ή χωρίς κατάστημα":"Δεν υπάρχει ένδειξη στη βασική εικόνα"}</small></div></article>
        <article className={summary.inactiveCompanies?"danger":"ok"}>{summary.inactiveCompanies?<AlertTriangle/>:<CheckCircle2/>}<div><span>Ανενεργές εταιρείες</span><strong>{summary.inactiveCompanies}</strong><small>Δεν αλλάζει κατάσταση από εδώ</small></div></article>
      </section>

      <div className="ai-command-grid">
        <section className="ai-command-panel">
          <div className="ai-command-panel-title"><div><small>ΚΕΝΤΡΟ ΠΡΟΒΛΗΜΑΤΩΝ · ΦΑΣΗ 2</small><h2>{problems.loading?"Φόρτωση ελέγχων…":`${problemSummary.total} ανοικτά σημεία`}</h2><p>Σύνοψη από τους υπάρχοντες ελέγχους· η διαχείριση γίνεται στις κανονικές οθόνες.</p></div><AlertTriangle/></div>
          {problems.error&&<div className="ai-command-problem-error"><AlertTriangle/>{problems.error}</div>}
          <div className="ai-command-actions">
            <button type="button" onClick={onOpenChecks}><BarChart3/><span><b>Έλεγχοι & Αναλύσεις</b><small>Πλήρης υφιστάμενος έλεγχος</small></span><ChevronRight/></button>
            <button type="button" onClick={onOpenCash}><WalletCards/><span><b>Ταμεία</b><small>Έλλειμμα, POS–EFTPOS, αποδεικτικά και διπλότυπα</small></span><em className={problemSummary.cashIssues?"warn":"ok"}>{problemSummary.cashIssues}</em><ChevronRight/></button>
            <button type="button" onClick={onOpenPayments}><ReceiptText/><span><b>Πληρωμές</b><small>{problemSummary.paymentDiscrepancies} με καταγεγραμμένη απόκλιση</small></span><em className={problemSummary.payments?"warn":"ok"}>{problemSummary.payments}</em><ChevronRight/></button>
            <button type="button" onClick={onOpenBank}><Landmark/><span><b>Τράπεζα</b><small>{problemSummary.bankDiscrepancies} με καταγεγραμμένη απόκλιση</small></span><em className={problemSummary.bank?"warn":"ok"}>{problemSummary.bank}</em><ChevronRight/></button>
            <button type="button" onClick={onOpenEvents}><ShieldCheck/><span><b>Συμβάντα</b><small>Κεντρικό Audit</small></span><ChevronRight/></button>
          </div>
        </section>

        <section className="ai-command-panel">
          <div className="ai-command-panel-title"><div><small>ΚΑΤΑΣΤΑΣΗ ΚΑΤΑΣΤΗΜΑΤΩΝ · ΦΑΣΗ 4</small><h2>{storeStatusTotals.ok} ΟΚ · {storeStatusTotals.warn} έλεγχος · {storeStatusTotals.danger} πρόβλημα</h2><p>Ανά κατάστημα, από τους ήδη διαθέσιμους ελέγχους.</p></div><Store/></div>
          <div className="ai-store-list">
            {storeStatuses.length===0?<div className="ai-command-empty">{loading?"Φόρτωση επισκόπησης…":"Δεν υπάρχουν καταστήματα στην επισκόπηση."}</div>:storeStatuses.map(store=>
              <button type="button" key={store.id} onClick={store.open}><span className={`ai-state-dot ${store.state}`} aria-hidden="true"/><div><b>{store.name}</b><small>{store.companyName} · {store.reasons.join(" · ")||"Χωρίς ανοικτό εύρημα"}</small></div><strong className={store.state}>{store.label}</strong><ChevronRight/></button>
            )}
          </div>
        </section>
      </div>

      <section className="ai-command-daily">
        <div className="ai-command-panel-title"><div><small>AI ΗΜΕΡΗΣΙΑ ΑΝΑΛΥΣΗ · ΦΑΣΗ 5</small><h2>{dailyPriorities.length?`${dailyPriorities.length} σημεία χρειάζονται σήμερα την προσοχή σου`:"Δεν υπάρχει ανοικτή προτεραιότητα σήμερα"}</h2><p>Αυτόματη ιεράρχηση από τα ίδια σημερινά δεδομένα· καμία αυτόματη ενέργεια ή μεταβολή.</p></div><BarChart3/></div>
        {problems.loading?<div className="ai-command-empty">Ανάλυση σημερινών δεδομένων…</div>:dailyPriorities.length===0?<div className="ai-daily-clear"><CheckCircle2/><div><b>Η σημερινή εικόνα είναι καθαρή</b><span>Δεν εντοπίστηκε ανοικτό σημείο στους διαθέσιμους ελέγχους.</span></div></div>:<div className="ai-daily-list">{dailyPriorities.map((item,index)=><button type="button" key={item.id} onClick={item.open}><span className={`ai-daily-rank ${item.state}`}>{index+1}</span><div><b>{item.title}</b><small>{item.context} · {item.detail}</small></div><strong className={item.state}>{item.state==="danger"?"ΑΜΕΣΑ":"ΕΛΕΓΧΟΣ"}</strong><ChevronRight/></button>)}</div>}
        <small className="ai-daily-source">Πηγή: σημερινή επισκόπηση, Ταμεία, Πληρωμές και Τράπεζα. Εμφανίζονται έως 5 προτεραιότητες.</small>
      </section>

      <section className="ai-command-detective">
        <div className="ai-command-panel-title"><div><small>INVOICE & SUPPLIER DETECTIVE · ΦΑΣΗ 6</small><h2>{invoiceIntel.loading?"Έλεγχος τιμολογίων…":invoiceDetective.items.length?`${invoiceDetective.items.length} τιμολόγια χρειάζονται προσοχή`:"Δεν υπάρχει ανοικτό εύρημα τιμολογίου"}</h2><p>Σύνοψη από το υπάρχον Invoice Learning· η διόρθωση και η εκμάθηση γίνονται μόνο στην κανονική οθόνη.</p></div><FileSearch/></div>
        {invoiceIntel.error&&<div className="ai-command-problem-error"><AlertTriangle/>{invoiceIntel.error}</div>}
        <div className="ai-detective-metrics"><span><small>Πρόχειρα</small><b>{invoiceDetective.drafts}</b></span><span><small>Γραμμές ελέγχου</small><b>{invoiceDetective.reviewLines}</b></span><span><small>Διαφορές συνόλου</small><b>{invoiceDetective.totalMismatches}</b></span><span><small>Εκπτώσεις ελέγχου</small><b>{invoiceDetective.discountReviews}</b></span><span><small>Πιθανά διπλά</small><b>{invoiceDetective.duplicates}</b></span><span><small>Μεταβολές τιμής</small><b>{invoiceDetective.priceChanges}</b></span></div>
        {!invoiceIntel.loading&&!invoiceIntel.error&&(invoiceDetective.items.length?<div className="ai-detective-list">{invoiceDetective.items.map(item=><button type="button" key={item.id} onClick={onOpenInvoices}><span className={`ai-state-dot ${item.state}`}/><div><b>{item.document.supplierName||"Χωρίς προμηθευτή"} · {item.document.invoiceNo||item.document.invoiceNumber||item.document.filename||"Χωρίς αριθμό"}</b><small>{item.reasons.join(" · ")}</small></div><strong className={item.state}>{item.state==="danger"?"ΠΡΟΒΛΗΜΑ":"ΕΛΕΓΧΟΣ"}</strong><ChevronRight/></button>)}</div>:<div className="ai-daily-clear"><CheckCircle2/><div><b>Δεν εντοπίστηκε ανοικτό εύρημα</b><span>{invoiceDetective.documents} τιμολόγια · {invoiceDetective.learned} εκπαιδευμένα · {invoiceDetective.profiles} κανόνες προμηθευτών.</span></div></div>)}
        <button type="button" className="ai-detective-open" onClick={onOpenInvoices}><FileSearch/>Άνοιγμα Invoice Learning Lab<ChevronRight/></button>
        <small className="ai-daily-source">Μόνο ανάγνωση: δεν γίνεται OCR, διόρθωση, πληρωμή, οριστικοποίηση ή κίνηση stock από εδώ.</small>
      </section>

      <section className="ai-command-ask">
        <div className="ai-command-panel-title"><div><small>ΡΩΤΑ ΤΟ MYWORKSTATION · ΦΑΣΗ 3</small><h2>Τι χρειάζεται την προσοχή μου;</h2><p>Η απάντηση βασίζεται μόνο στη σημερινή επισκόπηση και στους μετρητές των υπαρχόντων ελέγχων.</p></div><MessageCircle/></div>
        <form onSubmit={ask}><textarea value={question} onChange={event=>setQuestion(event.target.value)} maxLength={600} rows={3} placeholder="π.χ. Ποια σημεία χρειάζονται έλεγχο σήμερα;"/><button type="submit" disabled={askState.loading}><MessageCircle/>{askState.loading?"Ανάλυση…":"Ρώτα"}</button></form>
        <div className="ai-command-prompts"><button type="button" onClick={()=>setQuestion("Ποια σημεία χρειάζονται έλεγχο σήμερα;")}>Τι χρειάζεται έλεγχο;</button><button type="button" onClick={()=>setQuestion("Υπάρχουν ανενεργές εταιρείες ή καταστήματα χωρίς κάλυψη;")}>Κατάσταση δικτύου</button><button type="button" onClick={()=>setQuestion("Σε ποια κανονική οθόνη πρέπει να πάω πρώτα και γιατί;")}>Πού να πάω πρώτα;</button></div>
        {askState.error&&<div className="ai-command-problem-error"><AlertTriangle/>{askState.error}</div>}
        {askState.result&&<article className="ai-command-answer"><div className="ai-command-answer-head"><BrainCircuit/><b>Απάντηση MyWorkStation</b><span>Μόνο ανάγνωση</span></div><p>{askState.result.answer}</p>{askState.result.highlights?.length>0&&<ul>{askState.result.highlights.map((item,index)=><li key={index}>{item}</li>)}</ul>}<small><b>Πηγές:</b> {askState.result.sources?.join(" · ")||"Τρέχουσα επισκόπηση"}</small>{askState.result.limitations&&<small><b>Όριο:</b> {askState.result.limitations}</small>}</article>}
      </section>

      <section className="ai-command-roadmap">
        <div><small>ΕΠΟΜΕΝΑ ΒΗΜΑΤΑ</small><h2>Η ανάπτυξη παραμένει σταδιακή</h2></div>
        <div className="ai-roadmap-cards"><article><MessageCircle/><b>Ρώτα το MyWorkStation</b><span>Φάση 3 · ενεργό</span></article><article><BarChart3/><b>AI ημερήσια ανάλυση</b><span>Φάση 5 · ενεργό</span></article><article className="current"><FileSearch/><b>Invoice Detective</b><span>Φάση 6 · ενεργό</span></article><article><Store/><b>Digital Twin</b><span>Αργότερα</span></article></div>
      </section>
    </section>
  </div>;
}
