import React,{useEffect,useMemo,useState} from "react";
import AiCreditAlert from "./AiCreditAlert.jsx";
import {AlertTriangle,BarChart3,BrainCircuit,Building2,Camera,CheckCircle2,ChevronRight,CreditCard,FileSearch,Landmark,MessageCircle,Monitor,MoonStar,ReceiptText,RefreshCw,ShieldCheck,Store,Sunrise,UsersRound,WalletCards,X} from "lucide-react";

const countStores=companies=>companies.reduce((total,company)=>total+(company.stores?.length||0),0);
const commandMoney=value=>Number(value||0).toLocaleString("el-GR",{minimumFractionDigits:2,maximumFractionDigits:2});

const athensToday=()=>new Intl.DateTimeFormat("en-CA",{timeZone:"Europe/Athens",year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date());
const invoiceNumber=value=>{if(typeof value==="number")return Number.isFinite(value)?value:null;const raw=String(value??"").trim();if(!raw)return null;const normalized=raw.includes(",")?raw.replace(/\./g,"").replace(",","."):raw,n=Number(normalized.replace(/[^0-9.-]/g,""));return Number.isFinite(n)?n:null};
const invoiceIdentity=document=>[document.supplierTaxId||String(document.supplierName||"").toUpperCase().trim(),document.invoiceNo||document.invoiceNumber||document.filename||"",document.invoiceDate||""].join("|");
const invoiceLineNet=line=>{const stored=invoiceNumber(line.netValue??line.netAmount);if(stored!==null)return stored;const quantity=invoiceNumber(line.quantity),price=invoiceNumber(line.unitPrice??line.unitCost);if(!(quantity>0&&price>=0))return 0;return [line.discount1,line.discount2,line.discount3].reduce((value,discount)=>value*(1-(invoiceNumber(discount)||0)/100),quantity*price)};

export default function AiCommandCenter({request,companies=[],loading=false,onClose,onRefresh,onOpenChecks,onOpenCash,onOpenPayments,onOpenBank,onOpenEvents,onOpenInvoices,onOpenStock,onOpenWorkforce,onOpenVideo}){
  const [problems,setProblems]=useState({loading:true,error:"",cash:null,payments:null,bank:null});
  const [invoiceIntel,setInvoiceIntel]=useState({loading:true,error:"",workspace:null});
  const [twinDevices,setTwinDevices]=useState({loading:true,rows:{}});
  const [selectedTwinId,setSelectedTwinId]=useState("");
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
  const loadTwinDevices=async()=>{
    setTwinDevices(current=>({...current,loading:true}));
    const stores=companies.flatMap(company=>(company.stores||[]).map(store=>({companyId:company.id,storeId:store.id})));
    const entries=await Promise.all(stores.map(async item=>{
      const base=`/api/platform/companies/${encodeURIComponent(item.companyId)}/stores/${encodeURIComponent(item.storeId)}`;
      const [terminalsResult,routingResult,videoResult]=await Promise.allSettled([request(`${base}/installation-terminals`),request(`${base}/device-routing`),request(`${base}/video-connection`)]);
      const devicesUnavailable=terminalsResult.status!=="fulfilled"||routingResult.status!=="fulfilled",videoUnavailable=videoResult.status!=="fulfilled";
      const terminals=terminalsResult.status==="fulfilled"?terminalsResult.value:{},routing=routingResult.status==="fulfilled"?routingResult.value:{},video=videoResult.status==="fulfilled"?videoResult.value:null;
      return[item.storeId,{terminals:terminals.terminals||[],fiscalDevices:routing.fiscalDevices||[],eftposDevices:routing.eftposDevices||[],video,unavailable:devicesUnavailable,videoUnavailable}];
    }));
    setTwinDevices({loading:false,rows:Object.fromEntries(entries)});
  };
  useEffect(()=>{loadProblems();loadInvoiceIntel()},[]);
  useEffect(()=>{loadTwinDevices()},[companies]);
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
  const cashPaymentIntel=useMemo(()=>{
    const totals=problems.cash?.totals||{},cashStores=problems.cash?.stores||[],paymentItems=problems.payments?.items||[],bankItems=problems.bank?.items||[],items=[];
    const add=(id,state,title,context,detail,open)=>items.push({id,state,title,context,detail,open});
    for(const store of cashStores){
      const name=store.storeName||"Κατάστημα";
      if(Number(store.shortage||0)>.009)add(`cash-shortage:${store.storeId}`,"danger",name,"Έλλειμμα μετρητών",`${commandMoney(store.shortage)} € λιγότερα από το αναμενόμενο κλείσιμο. Χρειάζεται έλεγχος της υπάρχουσας βάρδιας και των κινήσεων.`,onOpenCash);
      if(Number(store.surplus||0)>.009)add(`cash-surplus:${store.storeId}`,"warn",name,"Πλεόνασμα μετρητών",`${commandMoney(store.surplus)} € περισσότερα από το αναμενόμενο κλείσιμο. Δεν γίνεται αυτόματος συμψηφισμός.`,onOpenCash);
      if(Math.abs(Number(store.cardVariance||0))>.009)add(`card:${store.storeId}`,"danger",name,"Διαφορά POS–EFTPOS",`${commandMoney(Math.abs(Number(store.cardVariance)))} € μεταξύ καταγεγραμμένων καρτών και EFTPOS.`,onOpenCash);
      if(Number(store.expensesWithoutDocument||0)>0)add(`evidence:${store.storeId}`,"warn",name,"Έξοδα χωρίς αποδεικτικό",`${Number(store.expensesWithoutDocument)} κινήσεις χρειάζονται το υπάρχον αποδεικτικό τους.`,onOpenCash);
      if(Number(store.duplicateCandidates||0)>0)add(`duplicates:${store.storeId}`,"warn",name,"Πιθανές επαναλαμβανόμενες κινήσεις",`${Number(store.duplicateCandidates)} υποψήφιες κινήσεις μόνο για ανθρώπινο έλεγχο — δεν ακυρώνονται αυτόματα.`,onOpenCash);
    }
    for(const item of paymentItems.filter(row=>row.status==="DISCREPANCY")){const reasons=item.automaticCheck?.checks||item.checks||[];add(`payment:${item.id}`,"danger",item.supplierName||item.storeName||"Πληρωμή προμηθευτή","Καταγεγραμμένη απόκλιση πληρωμής",reasons.join(" · ")||`Η υπάρχουσα πληρωμή ${commandMoney(item.amount)} € χρειάζεται έλεγχο μαζί με το παραστατικό της.`,onOpenPayments)}
    for(const item of bankItems.filter(row=>row.status==="DISCREPANCY")){const reasons=item.automaticCheck?.checks||item.checks||[];add(`bank:${item.id}`,"danger",item.storeName||item.bankName||"Τραπεζική κίνηση","Καταγεγραμμένη τραπεζική απόκλιση",reasons.join(" · ")||`Η υπάρχουσα τραπεζική κίνηση ${commandMoney(item.amount)} € χρειάζεται έλεγχο.`,onOpenBank)}
    const weight={danger:0,warn:1};items.sort((a,b)=>weight[a.state]-weight[b.state]||a.title.localeCompare(b.title,"el"));
    return{shortage:Number(totals.shortage||0),surplus:Number(totals.surplus||0),cardVariance:Number(totals.cardVariance||0),withoutEvidence:Number(totals.expensesWithoutDocument||0),duplicates:Number(totals.duplicateCandidates||0),paymentDiscrepancies:paymentItems.filter(item=>item.status==="DISCREPANCY").length,bankDiscrepancies:bankItems.filter(item=>item.status==="DISCREPANCY").length,items:items.slice(0,5)};
  },[onOpenBank,onOpenCash,onOpenPayments,problems]);
  const stockIntel=useMemo(()=>{
    const stores=companies.flatMap(company=>(company.stores||[]).map(store=>({company,store,summary:store.stockSummary||{}}))),items=[];
    const totals=stores.reduce((all,item)=>{for(const key of Object.keys(all))all[key]+=Number(item.summary[key]||0);return all},{trackedProducts:0,lowStock:0,outOfStock:0,negativeStock:0,slowMovers:0,suggestedUnits:0,recentAdjustments:0});
    const add=(item,state,context,detail)=>items.push({id:`${context}:${item.store.id}`,state,title:item.store.name,companyName:item.company.name,context,detail,open:()=>onOpenStock?.(item.company.id,item.store.id)});
    for(const item of stores){const stock=item.summary;if(Number(stock.negativeStock)>0)add(item,"danger","Αρνητικό stock",`${stock.negativeStock} είδη έχουν αρνητικό υπόλοιπο και χρειάζονται έλεγχο στο υπάρχον ledger.`);if(Number(stock.outOfStock)>0)add(item,"warn","Μηδενικό stock",`${stock.outOfStock} ενεργά είδη εμφανίζονται χωρίς διαθέσιμο απόθεμα.`);if(Number(stock.lowStock)>0)add(item,"warn","Χαμηλό stock",`${stock.lowStock} είδη είναι κάτω από το αποθηκευμένο ελάχιστο · προτεινόμενη κάλυψη ${commandMoney(stock.suggestedUnits)} μονάδες.`);if(Number(stock.slowMovers)>0)add(item,"warn","Slow movers 30 ημερών",`${stock.slowMovers} είδη έχουν θετικό stock χωρίς καταγεγραμμένη πώληση τις τελευταίες 30 ημέρες.`);if(Number(stock.recentAdjustments)>0)add(item,"warn","Κινήσεις ελέγχου 7 ημερών",`${stock.recentAdjustments} χειροκίνητες κινήσεις, φύρες ή μεταφορές υπάρχουν στο ledger για έλεγχο.`)}
    const weight={danger:0,warn:1};items.sort((a,b)=>weight[a.state]-weight[b.state]||a.title.localeCompare(b.title,"el"));return{...totals,items:items.slice(0,5)};
  },[companies,onOpenStock]);
  const workforceIntel=useMemo(()=>{
    const stores=companies.flatMap(company=>(company.stores||[]).map(store=>({company,store,summary:store.workforceSummary||{}}))),items=[];
    const totals=stores.reduce((all,item)=>{for(const key of Object.keys(all))all[key]+=Number(item.summary[key]||0);return all},{activeEmployees:0,scheduledToday:0,attendanceOpen:0,attendanceReview:0,lateArrivals:0,overtimeMinutes:0,pendingLeaves:0,unfilledShifts:0});
    const add=(item,state,context,detail)=>items.push({id:`${context}:${item.store.id}`,state,title:item.store.name,companyName:item.company.name,context,detail,open:()=>onOpenWorkforce?.(item.company.id,item.store.id)});
    for(const item of stores){const workforce=item.summary;if(Number(workforce.activeEmployees)>0&&!workforce.publishedToday)add(item,"danger","Χωρίς δημοσιευμένο πρόγραμμα","Υπάρχει ενεργό προσωπικό, αλλά δεν βρέθηκε δημοσιευμένο πρόγραμμα που να καλύπτει τη σημερινή ημέρα.");if(Number(workforce.unfilledShifts)>0)add(item,"danger","Κενά προγράμματος",`${workforce.unfilledShifts} θέσεις των επόμενων 7 ημερών δεν έχουν εργαζόμενο.`);if(Number(workforce.attendanceReview)>0)add(item,"danger","Παρουσίες προς έγκριση",`${workforce.attendanceReview} σημερινές παρουσίες χρειάζονται έλεγχο ή έγκριση.`);if(Number(workforce.attendanceOpen)>0)add(item,"warn","Ανοιχτές παρουσίες",`${workforce.attendanceOpen} εργαζόμενοι έχουν ενεργή παρουσία αυτή τη στιγμή.`);if(Number(workforce.lateArrivals)>0)add(item,"warn","Καθυστερήσεις",`${workforce.lateArrivals} σημερινές παρουσίες έχουν καταγεγραμμένη καθυστέρηση.`);if(Number(workforce.overtimeMinutes)>0)add(item,"warn","Υπερωρίες",`${workforce.overtimeMinutes} λεπτά υπερωρίας έχουν καταγραφεί σήμερα.`);if(Number(workforce.pendingLeaves)>0)add(item,"warn","Αιτήματα αδειών",`${workforce.pendingLeaves} αιτήματα άδειας περιμένουν απόφαση.`)}
    const weight={danger:0,warn:1};items.sort((a,b)=>weight[a.state]-weight[b.state]||a.title.localeCompare(b.title,"el"));return{...totals,items:items.slice(0,5)};
  },[companies,onOpenWorkforce]);
  const morningBriefing=useMemo(()=>{
    const items=[];
    const add=(id,state,title,detail,open)=>items.push({id,state,title,detail,open});
    if(storeStatusTotals.danger||storeStatusTotals.warn)add("network",storeStatusTotals.danger?"danger":"warn","Κατάσταση δικτύου",`${storeStatusTotals.danger} καταστήματα με πρόβλημα · ${storeStatusTotals.warn} προς έλεγχο · ${storeStatusTotals.ok} ΟΚ.`,onOpenChecks);
    else add("network","ok","Κατάσταση δικτύου",`${storeStatusTotals.ok} καταστήματα χωρίς ανοικτό εύρημα στους διαθέσιμους ελέγχους.`,onOpenChecks);
    if(cashPaymentIntel.items.length)add("cash",cashPaymentIntel.items.some(item=>item.state==="danger")?"danger":"warn","Ταμεία & πληρωμές",`${cashPaymentIntel.items.length} οικονομικά σημεία χρειάζονται έλεγχο.`,cashPaymentIntel.items[0]?.open||onOpenCash);
    else add("cash","ok","Ταμεία & πληρωμές","Δεν υπάρχει καταγεγραμμένη οικονομική απόκλιση.",onOpenCash);
    if(invoiceDetective.items.length)add("invoices",invoiceDetective.items.some(item=>item.state==="danger")?"danger":"warn","Τιμολόγια & προμηθευτές",`${invoiceDetective.items.length} τιμολόγια εμφανίζονται στις πρώτες προτεραιότητες ελέγχου.`,onOpenInvoices);
    else add("invoices","ok","Τιμολόγια & προμηθευτές","Δεν υπάρχει ανοικτό εύρημα τιμολογίου.",onOpenInvoices);
    if(stockIntel.items.length)add("stock",stockIntel.items.some(item=>item.state==="danger")?"danger":"warn","Αποθήκη",`${stockIntel.items.length} σημεία stock εμφανίζονται στις πρώτες προτεραιότητες.`,stockIntel.items[0]?.open||onOpenChecks);
    else add("stock","ok","Αποθήκη","Δεν υπάρχει ανοικτό εύρημα stock.",onOpenChecks);
    if(workforceIntel.items.length)add("workforce",workforceIntel.items.some(item=>item.state==="danger")?"danger":"warn","Προσωπικό",`${workforceIntel.items.length} σημεία προσωπικού χρειάζονται έλεγχο.`,workforceIntel.items[0]?.open||onOpenChecks);
    else add("workforce","ok","Προσωπικό","Δεν υπάρχει ανοικτό εύρημα προσωπικού.",onOpenChecks);
    return items;
  },[cashPaymentIntel,invoiceDetective,onOpenCash,onOpenChecks,onOpenInvoices,stockIntel,storeStatusTotals,workforceIntel]);
  const nightBriefing=useMemo(()=>{
    const openAreas=morningBriefing.filter(item=>item.state!=="ok").length;
    return [
      {id:"tomorrow",state:openAreas?"warn":"ok",title:"Ανοικτά για αύριο",detail:openAreas?`${openAreas} από τους 5 τομείς χρειάζονται συνέχεια.`:"Δεν μένει ανοικτός τομέας στη διαθέσιμη εικόνα.",open:onOpenChecks},
      {id:"stores",state:storeStatusTotals.danger?"danger":storeStatusTotals.warn?"warn":"ok",title:"Καταστήματα στο κλείσιμο",detail:`${storeStatusTotals.danger} πρόβλημα · ${storeStatusTotals.warn} έλεγχος · ${storeStatusTotals.ok} ΟΚ.`,open:onOpenChecks},
      {id:"finance",state:cashPaymentIntel.items.some(item=>item.state==="danger")?"danger":cashPaymentIntel.items.length?"warn":"ok",title:"Οικονομικός έλεγχος",detail:cashPaymentIntel.items.length?`${cashPaymentIntel.items.length} σημεία δεν έχουν κλείσει.`:"Οι διαθέσιμοι οικονομικοί έλεγχοι συμφωνούν.",open:cashPaymentIntel.items[0]?.open||onOpenCash},
      {id:"operations",state:invoiceDetective.items.some(item=>item.state==="danger")||stockIntel.items.some(item=>item.state==="danger")?"danger":invoiceDetective.items.length||stockIntel.items.length?"warn":"ok",title:"Τιμολόγια & stock",detail:`${invoiceDetective.items.length} τιμολόγια · ${stockIntel.items.length} σημεία stock για συνέχεια.`,open:invoiceDetective.items.length?onOpenInvoices:stockIntel.items[0]?.open||onOpenChecks},
      {id:"people",state:workforceIntel.items.some(item=>item.state==="danger")?"danger":workforceIntel.items.length?"warn":"ok",title:"Προσωπικό αύριο",detail:workforceIntel.items.length?`${workforceIntel.items.length} σημεία προσωπικού παραμένουν ανοικτά.`:"Δεν υπάρχει ανοικτό εύρημα προσωπικού.",open:workforceIntel.items[0]?.open||onOpenChecks}
    ];
  },[cashPaymentIntel,invoiceDetective,morningBriefing,onOpenCash,onOpenChecks,onOpenInvoices,stockIntel,storeStatusTotals,workforceIntel]);
  const digitalTwin=useMemo(()=>{
    const statusByStore=new Map(storeStatuses.map(item=>[item.id,item]));
    return companies.flatMap(company=>(company.stores||[]).map(store=>{
      const status=statusByStore.get(store.id)||{state:"warn",label:"ΕΛΕΓΧΟΣ",reasons:["Χωρίς διαθέσιμη κατάσταση"],open:onOpenChecks};
      const devices=twinDevices.rows[store.id]||{terminals:[],fiscalDevices:[],eftposDevices:[]};
      const activeTerminals=devices.terminals.filter(item=>item.active!==false),recentTerminals=activeTerminals.filter(item=>item.lastSeenAt&&Date.now()-new Date(item.lastSeenAt).getTime()<=15*60*1000);
      const fiscalDevices=devices.fiscalDevices.filter(item=>item.active!==false),eftposDevices=devices.eftposDevices.filter(item=>item.active!==false);
      const stock=store.stockSummary||{},workforce=store.workforceSummary||{},video=devices.video,activeCameras=(video?.cameras||[]).filter(item=>item.active!==false).length;
      const videoLabel=devices.videoUnavailable?"ΜΗ ΔΙΑΘΕΣΙΜΟ":!video?.connection?.active?"Δεν έχει ρυθμιστεί":`${video.connector?.online?"ONLINE":"OFFLINE"} · ${activeCameras} ${activeCameras===1?"κάμερα":"κάμερες"}`;
      return{id:store.id,companyId:company.id,name:store.name,companyName:company.name,status,devices,activeTerminals:activeTerminals.length,recentTerminals:recentTerminals.length,fiscalDevices:fiscalDevices.length,eftposDevices:eftposDevices.length,stock,workforce,videoLabel};
    }));
  },[companies,onOpenChecks,storeStatuses,twinDevices.rows]);
  const selectedTwin=useMemo(()=>digitalTwin.find(item=>item.id===selectedTwinId)||digitalTwin[0]||null,[digitalTwin,selectedTwinId]);
  const fullTwinAreas=useMemo(()=>{
    if(!selectedTwin)return[];
    const unavailable=selectedTwin.devices.unavailable,video=selectedTwin.devices.video,stock=selectedTwin.stock,workforce=selectedTwin.workforce;
    return[
      {id:"pos",icon:Monitor,title:"POS",state:unavailable?"warn":selectedTwin.activeTerminals>0&&selectedTwin.recentTerminals===selectedTwin.activeTerminals?"ok":"warn",detail:unavailable?"Μη διαθέσιμη πηγή":`${selectedTwin.recentTerminals}/${selectedTwin.activeTerminals} πρόσφατα`,open:onOpenChecks},
      {id:"eftpos",icon:CreditCard,title:"EFTPOS / Ταμειακές",state:unavailable?"warn":selectedTwin.eftposDevices>0&&selectedTwin.fiscalDevices>0?"ok":"warn",detail:unavailable?"Μη διαθέσιμη πηγή":`${selectedTwin.eftposDevices} EFTPOS · ${selectedTwin.fiscalDevices} ταμειακές`,open:onOpenCash},
      {id:"cash",icon:WalletCards,title:"Ταμείο",state:selectedTwin.status.state,detail:selectedTwin.status.reasons[0]||"Χωρίς ανοικτό εύρημα",open:selectedTwin.status.open},
      {id:"stock",icon:Store,title:"Stock",state:Number(stock.negativeStock||0)>0?"danger":Number(stock.outOfStock||0)>0?"warn":"ok",detail:`${Number(stock.negativeStock||0)} αρνητικά · ${Number(stock.outOfStock||0)} μηδενικά`,open:()=>onOpenStock?.(selectedTwin.companyId,selectedTwin.id)},
      {id:"workforce",icon:UsersRound,title:"Προσωπικό",state:Number(workforce.attendanceReview||0)>0||Number(workforce.unfilledShifts||0)>0?"danger":Number(workforce.activeEmployees||0)>0&&!workforce.publishedToday?"warn":"ok",detail:`${Number(workforce.activeEmployees||0)} ενεργοί · ${Number(workforce.scheduledToday||0)} σήμερα`,open:()=>onOpenWorkforce?.(selectedTwin.companyId,selectedTwin.id)},
      {id:"video",icon:Camera,title:"Κάμερες",state:selectedTwin.devices.videoUnavailable?"warn":!video?.connection?.active?"warn":video.connector?.online?"ok":"danger",detail:selectedTwin.videoLabel,open:()=>onOpenVideo?.(selectedTwin.companyId,selectedTwin.id)}
    ];
  },[onOpenCash,onOpenChecks,onOpenStock,onOpenVideo,onOpenWorkforce,selectedTwin]);
  const fullTwinTotals=useMemo(()=>fullTwinAreas.reduce((all,item)=>{all[item.state]++;return all},{ok:0,warn:0,danger:0}),[fullTwinAreas]);
  const briefingTime=useMemo(()=>new Intl.DateTimeFormat("el-GR",{timeZone:"Europe/Athens",weekday:"long",day:"2-digit",month:"long",hour:"2-digit",minute:"2-digit",hour12:false}).format(new Date()),[companies,problems,invoiceIntel]);
  const refresh=()=>{onRefresh?.();loadProblems();loadInvoiceIntel();loadTwinDevices()};
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

  return <div className="ai-command-page" data-ai-command-center="phase-14">
    <section className="ai-command-shell">
      <header className="ai-command-header">
        <div className="ai-command-heading"><span className="ai-command-mark"><BrainCircuit/></span><div><small>SUPER ADMIN · ΦΑΣΗ 14</small><h1>AI Command Center</h1><p>Μία κεντρική εικόνα της επιχείρησης, πάνω στις υπάρχουσες λειτουργίες του MyWorkStation.</p></div></div>
        <div className="ai-command-header-actions"><span><ShieldCheck/> Μόνο ανάγνωση</span><button type="button" onClick={refresh} disabled={loading||problems.loading||invoiceIntel.loading}><RefreshCw/> {loading||problems.loading||invoiceIntel.loading?"Ανανέωση…":"Ανανέωση"}</button><button type="button" className="ai-command-close" onClick={onClose} aria-label="Κλείσιμο AI Command Center"><X/></button></div>
      </header>

      <div className="ai-command-safety"><ShieldCheck/><div><b>Μία πηγή δεδομένων</b><p>Το Command Center δεν κρατά δεύτερα στοιχεία. Διαβάζει τη σημερινή επισκόπηση και σε οδηγεί στις κανονικές οθόνες για έλεγχο και ενέργειες.</p></div></div>

      <AiCreditAlert request={request} settings/>
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

      <section className="ai-command-morning">
        <div className="ai-command-panel-title"><div><small>MORNING BRIEFING · ΦΑΣΗ 10</small><h2>Καλημέρα — αυτή είναι η πρωινή εικόνα της επιχείρησης</h2><p>{briefingTime} · Σύνοψη από τις ενεργές read-only ενότητες του Command Center.</p></div><Sunrise/></div>
        <div className="ai-morning-list">{morningBriefing.map(item=><button type="button" key={item.id} onClick={item.open}><span className={`ai-state-dot ${item.state}`}/><div><b>{item.title}</b><small>{item.detail}</small></div><strong className={item.state}>{item.state==="danger"?"ΠΡΟΒΛΗΜΑ":item.state==="warn"?"ΕΛΕΓΧΟΣ":"ΟΚ"}</strong><ChevronRight/></button>)}</div>
        <small className="ai-daily-source">Δημιουργείται όταν ανοίγεις ή ανανεώνεις το Command Center. Δεν αποστέλλεται μήνυμα, δεν προγραμματίζεται εργασία και δεν αλλάζει κανένα δεδομένο.</small>
      </section>

      <section className="ai-command-night">
        <div className="ai-command-panel-title"><div><small>NIGHT BRIEFING · ΦΑΣΗ 11</small><h2>Τι συνέβη σήμερα και τι μένει ανοικτό</h2><p>{briefingTime} · Απολογισμός από την ίδια τρέχουσα read-only εικόνα.</p></div><MoonStar/></div>
        <div className="ai-night-list">{nightBriefing.map(item=><button type="button" key={item.id} onClick={item.open}><span className={`ai-state-dot ${item.state}`}/><div><b>{item.title}</b><small>{item.detail}</small></div><strong className={item.state}>{item.state==="danger"?"ΠΡΟΒΛΗΜΑ":item.state==="warn"?"ΑΥΡΙΟ":"ΚΛΕΙΣΤΟ"}</strong><ChevronRight/></button>)}</div>
        <small className="ai-daily-source">Στιγμιότυπο της τρέχουσας κατάστασης: δεν κλείνει εκκρεμότητα, δεν μεταφέρει υπόλοιπο, δεν στέλνει αναφορά και δεν προγραμματίζει ενέργεια.</small>
      </section>

      <section className="ai-command-twin">
        <div className="ai-command-panel-title"><div><small>DIGITAL TWIN LITE · ΦΑΣΕΙΣ 12–13</small><h2>Ζωντανή λειτουργική εικόνα ανά κατάστημα</h2><p>POS, EFTPOS, ταμεία, stock, προσωπικό και κάμερες από τις υπάρχουσες read-only πηγές.</p></div><Building2/></div>
        {twinDevices.loading&&digitalTwin.length===0?<div className="ai-command-empty">Σύνθεση καταστημάτων και συσκευών…</div>:<div className="ai-twin-grid">{digitalTwin.map(item=><article key={item.id} className={`ai-twin-card ${item.status.state}`}>
          <header><span className={`ai-state-dot ${item.status.state}`}/><div><b>{item.name}</b><small>{item.companyName}</small></div><strong>{item.status.label}</strong></header>
          <div className="ai-twin-map">
            <button type="button" onClick={onOpenChecks}><Monitor/><span><small>POS</small><b>{item.devices.unavailable?"ΜΗ ΔΙΑΘΕΣΙΜΟ":`${item.recentTerminals}/${item.activeTerminals} πρόσφατα`}</b></span></button>
            <button type="button" onClick={onOpenCash}><CreditCard/><span><small>EFTPOS</small><b>{item.devices.unavailable?"ΜΗ ΔΙΑΘΕΣΙΜΟ":`${item.eftposDevices} ενεργά · ${item.fiscalDevices} ταμειακές`}</b></span></button>
            <button type="button" onClick={item.status.open}><WalletCards/><span><small>Ταμείο</small><b>{item.status.reasons[0]||"Χωρίς εύρημα"}</b></span></button>
            <button type="button" onClick={()=>onOpenStock?.(item.companyId,item.id)}><Store/><span><small>Stock</small><b>{Number(item.stock.negativeStock||0)} αρνητικά · {Number(item.stock.outOfStock||0)} μηδενικά</b></span></button>
            <button type="button" onClick={()=>onOpenWorkforce?.(item.companyId,item.id)}><UsersRound/><span><small>Προσωπικό</small><b>{Number(item.workforce.activeEmployees||0)} ενεργοί · {Number(item.workforce.scheduledToday||0)} σήμερα</b></span></button>
            <button type="button" onClick={()=>onOpenVideo?.(item.companyId,item.id)}><Camera/><span><small>Κάμερες</small><b>{item.videoLabel}</b></span></button>
          </div>
          <footer><span>{item.status.reasons.join(" · ")||"Δεν υπάρχει ανοικτό εύρημα"}</span><ChevronRight/></footer>
        </article>)}</div>}
        <small className="ai-daily-source">Digital Twin Lite μόνο ανάγνωσης: δεν ελέγχει συσκευή, δεν ανοίγει βάρδια, δεν εκτελεί EFTPOS, δεν αλλάζει stock ή προσωπικό και δεν ζητά snapshot, live video ή clip από NVR.</small>
      </section>

      <section className="ai-command-full-twin">
        <div className="ai-command-panel-title"><div><small>FULL DIGITAL TWIN · ΦΑΣΗ 14</small><h2>{selectedTwin?selectedTwin.name:"Δεν υπάρχει διαθέσιμο κατάστημα"}</h2><p>{selectedTwin?`${selectedTwin.companyName} · ${fullTwinTotals.ok} ΟΚ · ${fullTwinTotals.warn} έλεγχος · ${fullTwinTotals.danger} πρόβλημα`:"Η ενιαία εικόνα δημιουργείται από τις υπάρχουσες read-only πηγές."}</p></div><Building2/></div>
        <div className="ai-full-twin-selector" aria-label="Επιλογή καταστήματος">{digitalTwin.map(item=><button type="button" key={item.id} className={selectedTwin?.id===item.id?"active":""} onClick={()=>setSelectedTwinId(item.id)}><span className={`ai-state-dot ${item.status.state}`}/>{item.name}</button>)}</div>
        {selectedTwin&&<div className="ai-full-twin-areas">{fullTwinAreas.map(area=>{const Icon=area.icon;return <button type="button" key={area.id} className={area.state} onClick={area.open}><Icon/><span><small>{area.title}</small><b>{area.detail}</b></span><strong>{area.state==="danger"?"ΠΡΟΒΛΗΜΑ":area.state==="warn"?"ΕΛΕΓΧΟΣ":"ΟΚ"}</strong><ChevronRight/></button>})}</div>}
        <small className="ai-daily-source">Ενιαία λειτουργική εικόνα μόνο ανάγνωσης από τα δεδομένα των Φάσεων 12–13. Δεν δημιουργεί δεύτερο score ή dataset και δεν εκτελεί ενέργεια σε συσκευή, βάρδια, πληρωμή, stock, προσωπικό ή NVR.</small>
      </section>

      <section className="ai-command-detective">
        <div className="ai-command-panel-title"><div><small>INVOICE & SUPPLIER DETECTIVE · ΦΑΣΗ 6</small><h2>{invoiceIntel.loading?"Έλεγχος τιμολογίων…":invoiceDetective.items.length?`${invoiceDetective.items.length} τιμολόγια χρειάζονται προσοχή`:"Δεν υπάρχει ανοικτό εύρημα τιμολογίου"}</h2><p>Σύνοψη από το υπάρχον Invoice Learning· η διόρθωση και η εκμάθηση γίνονται μόνο στην κανονική οθόνη.</p></div><FileSearch/></div>
        {invoiceIntel.error&&<div className="ai-command-problem-error"><AlertTriangle/>{invoiceIntel.error}</div>}
        <div className="ai-detective-metrics"><span><small>Πρόχειρα</small><b>{invoiceDetective.drafts}</b></span><span><small>Γραμμές ελέγχου</small><b>{invoiceDetective.reviewLines}</b></span><span><small>Διαφορές συνόλου</small><b>{invoiceDetective.totalMismatches}</b></span><span><small>Εκπτώσεις ελέγχου</small><b>{invoiceDetective.discountReviews}</b></span><span><small>Πιθανά διπλά</small><b>{invoiceDetective.duplicates}</b></span><span><small>Μεταβολές τιμής</small><b>{invoiceDetective.priceChanges}</b></span></div>
        {!invoiceIntel.loading&&!invoiceIntel.error&&(invoiceDetective.items.length?<div className="ai-detective-list">{invoiceDetective.items.map(item=><button type="button" key={item.id} onClick={onOpenInvoices}><span className={`ai-state-dot ${item.state}`}/><div><b>{item.document.supplierName||"Χωρίς προμηθευτή"} · {item.document.invoiceNo||item.document.invoiceNumber||item.document.filename||"Χωρίς αριθμό"}</b><small>{item.reasons.join(" · ")}</small></div><strong className={item.state}>{item.state==="danger"?"ΠΡΟΒΛΗΜΑ":"ΕΛΕΓΧΟΣ"}</strong><ChevronRight/></button>)}</div>:<div className="ai-daily-clear"><CheckCircle2/><div><b>Δεν εντοπίστηκε ανοικτό εύρημα</b><span>{invoiceDetective.documents} τιμολόγια · {invoiceDetective.learned} εκπαιδευμένα · {invoiceDetective.profiles} κανόνες προμηθευτών.</span></div></div>)}
        <button type="button" className="ai-detective-open" onClick={onOpenInvoices}><FileSearch/>Άνοιγμα Invoice Learning Lab<ChevronRight/></button>
        <small className="ai-daily-source">Μόνο ανάγνωση: δεν γίνεται OCR, διόρθωση, πληρωμή, οριστικοποίηση ή κίνηση stock από εδώ.</small>
      </section>

      <section className="ai-command-cash-intel">
        <div className="ai-command-panel-title"><div><small>AI ΤΑΜΕΙΩΝ &amp; ΠΛΗΡΩΜΩΝ · ΦΑΣΗ 7</small><h2>{problems.loading?"Ανάλυση αποκλίσεων…":cashPaymentIntel.items.length?`${cashPaymentIntel.items.length} οικονομικά σημεία εξηγούνται`:`Δεν υπάρχει καταγεγραμμένη οικονομική απόκλιση`}</h2><p>Εξήγηση από τους υπάρχοντες ελέγχους Ταμείων, Πληρωμών και Τράπεζας· χωρίς αυτόματη απόφαση ή μεταβολή.</p></div><WalletCards/></div>
        <div className="ai-cash-metrics"><span><small>Έλλειμμα μετρητών</small><b>{commandMoney(cashPaymentIntel.shortage)} €</b></span><span><small>Πλεόνασμα</small><b>{commandMoney(cashPaymentIntel.surplus)} €</b></span><span><small>Διαφορά POS–EFTPOS</small><b>{commandMoney(cashPaymentIntel.cardVariance)} €</b></span><span><small>Χωρίς αποδεικτικό</small><b>{cashPaymentIntel.withoutEvidence}</b></span><span><small>Πιθανά διπλά</small><b>{cashPaymentIntel.duplicates}</b></span><span><small>Αποκλίσεις πληρωμών / τράπεζας</small><b>{cashPaymentIntel.paymentDiscrepancies+cashPaymentIntel.bankDiscrepancies}</b></span></div>
        {!problems.loading&&!problems.error&&(cashPaymentIntel.items.length?<div className="ai-cash-list">{cashPaymentIntel.items.map(item=><button type="button" key={item.id} onClick={item.open}><span className={`ai-state-dot ${item.state}`}/><div><b>{item.title} · {item.context}</b><small>{item.detail}</small></div><strong className={item.state}>{item.state==="danger"?"ΠΡΟΒΛΗΜΑ":"ΕΛΕΓΧΟΣ"}</strong><ChevronRight/></button>)}</div>:<div className="ai-daily-clear"><CheckCircle2/><div><b>Οι διαθέσιμοι έλεγχοι συμφωνούν</b><span>Δεν βρέθηκε απόκλιση στα σημερινά κλεισίματα ή στις ανοικτές πληρωμές και τραπεζικές κινήσεις.</span></div></div>)}
        <div className="ai-cash-open"><button type="button" onClick={onOpenCash}><WalletCards/>Άνοιγμα Ταμείων<ChevronRight/></button><button type="button" onClick={onOpenPayments}><ReceiptText/>Άνοιγμα Πληρωμών<ChevronRight/></button><button type="button" onClick={onOpenBank}><Landmark/>Άνοιγμα Τράπεζας<ChevronRight/></button></div>
        <small className="ai-daily-source">Μόνο ανάγνωση: δεν εγκρίνεται, δεν διορθώνεται, δεν συμψηφίζεται και δεν δημιουργείται πληρωμή ή χρέωση από εδώ.</small>
      </section>

      <section className="ai-command-stock-intel">
        <div className="ai-command-panel-title"><div><small>STOCK INTELLIGENCE · ΦΑΣΗ 8</small><h2>{loading?"Ανάλυση αποθήκης…":stockIntel.items.length?`${stockIntel.items.length} σημεία stock χρειάζονται έλεγχο`:"Δεν υπάρχει ανοικτό εύρημα stock"}</h2><p>Ζωντανή σύνοψη από το υπάρχον stock, τις πωλήσεις και το ledger κινήσεων· χωρίς αυτόματη παραγγελία ή μεταβολή.</p></div><Store/></div>
        <div className="ai-stock-metrics"><span><small>Ενεργά είδη</small><b>{stockIntel.trackedProducts}</b></span><span><small>Χαμηλό stock</small><b>{stockIntel.lowStock}</b></span><span><small>Μηδενικό stock</small><b>{stockIntel.outOfStock}</b></span><span><small>Αρνητικό stock</small><b>{stockIntel.negativeStock}</b></span><span><small>Slow movers 30ημ.</small><b>{stockIntel.slowMovers}</b></span><span><small>Πρόταση κάλυψης</small><b>{commandMoney(stockIntel.suggestedUnits)}</b></span></div>
        {stockIntel.items.length?<div className="ai-stock-list">{stockIntel.items.map(item=><button type="button" key={item.id} onClick={item.open}><span className={`ai-state-dot ${item.state}`}/><div><b>{item.title} · {item.context}</b><small>{item.companyName} · {item.detail}</small></div><strong className={item.state}>{item.state==="danger"?"ΠΡΟΒΛΗΜΑ":"ΕΛΕΓΧΟΣ"}</strong><ChevronRight/></button>)}</div>:<div className="ai-daily-clear"><CheckCircle2/><div><b>Η διαθέσιμη εικόνα stock είναι καθαρή</b><span>Δεν βρέθηκε αρνητικό, μηδενικό ή χαμηλό stock ούτε slow mover στα ενεργά είδη.</span></div></div>}
        <small className="ai-daily-source">Μόνο ανάγνωση: οι ποσότητες είναι προτάσεις ελέγχου. Δεν δημιουργείται παραγγελία, παραλαβή, μεταφορά, φύρα ή κίνηση stock από εδώ.</small>
      </section>

      <section className="ai-command-workforce-intel">
        <div className="ai-command-panel-title"><div><small>WORKFORCE INTELLIGENCE · ΦΑΣΗ 9</small><h2>{loading?"Ανάλυση προσωπικού…":workforceIntel.items.length?`${workforceIntel.items.length} σημεία προσωπικού χρειάζονται έλεγχο`:"Δεν υπάρχει ανοικτό εύρημα προσωπικού"}</h2><p>Σύνοψη από το υπάρχον πρόγραμμα, τις παρουσίες και τα αιτήματα αδειών· χωρίς αλλαγή ή έγκριση από εδώ.</p></div><UsersRound/></div>
        <div className="ai-workforce-metrics"><span><small>Ενεργοί εργαζόμενοι</small><b>{workforceIntel.activeEmployees}</b></span><span><small>Πρόγραμμα σήμερα</small><b>{workforceIntel.scheduledToday}</b></span><span><small>Ανοιχτές παρουσίες</small><b>{workforceIntel.attendanceOpen}</b></span><span><small>Προς έλεγχο</small><b>{workforceIntel.attendanceReview}</b></span><span><small>Καθυστερήσεις</small><b>{workforceIntel.lateArrivals}</b></span><span><small>Υπερωρία σήμερα</small><b>{workforceIntel.overtimeMinutes}′</b></span></div>
        {workforceIntel.items.length?<div className="ai-workforce-list">{workforceIntel.items.map(item=><button type="button" key={item.id} onClick={item.open}><span className={`ai-state-dot ${item.state}`}/><div><b>{item.title} · {item.context}</b><small>{item.companyName} · {item.detail}</small></div><strong className={item.state}>{item.state==="danger"?"ΠΡΟΒΛΗΜΑ":"ΕΛΕΓΧΟΣ"}</strong><ChevronRight/></button>)}</div>:<div className="ai-daily-clear"><CheckCircle2/><div><b>Η διαθέσιμη εικόνα προσωπικού είναι καθαρή</b><span>Δεν βρέθηκε κενό προγράμματος, παρουσία προς έλεγχο, καθυστέρηση, υπερωρία ή εκκρεμές αίτημα άδειας.</span></div></div>}
        <small className="ai-daily-source">Μόνο ανάγνωση: δεν δημιουργείται ή αλλάζει βάρδια, παρουσία, άδεια, έγκριση ή μισθοδοσία από εδώ.</small>
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
        <div className="ai-roadmap-cards"><article><Building2/><b>Digital Twin Lite</b><span>Φάση 12 · ενεργό</span></article><article><Camera/><b>NVR / Cameras</b><span>Φάση 13 · ενεργό</span></article><article className="current"><Store/><b>Full Digital Twin</b><span>Φάση 14 · ενεργό</span></article><article><CheckCircle2/><b>Αρχικό πλάνο</b><span>Φάσεις 1–14</span></article></div>
      </section>
    </section>
  </div>;
}
