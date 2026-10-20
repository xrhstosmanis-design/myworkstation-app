import React,{useEffect,useLayoutEffect,useMemo,useRef,useState} from "react";
import {buildSupplierProposalCsv,validateCurrentStockShortfall,matchesCurrentStockShortfall} from "./supplier-order-proposal-export.js";
import "./order-suggestions.css";
const n=value=>value==null?"—":Number(value).toLocaleString("el-GR",{maximumFractionDigits:3});
const searchText=value=>String(value||"").normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLocaleLowerCase("el-GR");
const supplierReasons={INCOMPLETE_EVIDENCE:"Ελλιπή στοιχεία — χωρίς ανάθεση",NO_APPROVED_DOCUMENT_EVIDENCE:"Χωρίς εγκεκριμένα παραστατικά",DOCUMENT_FREQUENCY_TIE:"Ισοβαθμία παραστατικών — χωρίς ανάθεση",DOCUMENT_FREQUENCY_IS_NOT_DELIVERY_FREQUENCY:"Υποψήφιος μόνο από συχνότητα παραστατικών"};
const shortfallLabels={BELOW_MINIMUM:"Κάτω από ελάχιστο",DEMAND_REPLENISHMENT:"Αναπλήρωση ζήτησης",NO_SHORTAGE:"Χωρίς καταγεγραμμένο έλλειμμα",REVIEW_REQUIRED:"Χρειάζεται έλεγχος"};
const shortfallReasons={NUMERIC_SUGGESTION_UNAVAILABLE:"Μη διαθέσιμα αριθμητικά στοιχεία πρότασης",INVALID_NUMERIC_SUGGESTION:"Μη έγκυρα αριθμητικά στοιχεία πρότασης",NEGATIVE_RECORDED_STOCK:"Αρνητικό καταγεγραμμένο απόθεμα"};
const shortfallQuantity=value=>value>0&&value<0.001?"<0,001":n(value);
const validIdentity=value=>typeof value==="string"&&value.trim().length>0;
function validateSupplierProposal(data){
  const evidence=data.supplierEvidence;
  if(typeof data.generatedAt!=="string"||data.generatedAt!==data.to||!Number.isFinite(Date.parse(data.generatedAt)))throw Error("Μη έγκυρα στοιχεία προμηθευτών.");
  if(data.supplierBasis!=="APPROVED_DOCUMENT_FREQUENCY_PROXY"||data.reviewRequired!==true||data.automaticTransmission!==false||typeof data.complete!=="boolean"||!evidence||evidence.complete!==data.complete||evidence.physicalDeliveryFrequencyVerified!==false||evidence.from!==data.from||evidence.to!==data.to||!Number.isFinite(Date.parse(evidence.from))||!Number.isFinite(Date.parse(evidence.to))||Date.parse(evidence.from)>=Date.parse(evidence.to)||!data.options||!Number.isInteger(data.options.historyDays)||data.options.historyDays<7||data.options.historyDays>90||!Number.isInteger(data.options.coverageDays)||data.options.coverageDays<1||data.options.coverageDays>60||!Number.isInteger(data.options.leadDays)||data.options.leadDays<0||data.options.leadDays>30||evidence.historyDays!==data.options?.historyDays||evidence.limit!==20000||!Number.isSafeInteger(evidence.observedDocumentProductSupplierCount)||evidence.observedDocumentProductSupplierCount<0||evidence.observedDocumentProductSupplierCount>20001||data.complete!==(evidence.observedDocumentProductSupplierCount<=evidence.limit)||!Array.isArray(data.groups)||!Array.isArray(data.unassigned))throw Error("Μη έγκυρα στοιχεία προμηθευτών.");
  const ids=new Map(),membership=new Set();
  let observedCandidateDocuments=0;
  for(const row of data.rows){
    validateCurrentStockShortfall(row);
    if(!row||!validIdentity(row.productId)||ids.has(row.productId)||row.primarySupplierId!==null||row.reviewRequired!==true||row.supplierBasis!==data.supplierBasis||!Array.isArray(row.supplierCandidates)||!supplierReasons[row.supplierReviewReason])throw Error("Μη έγκυρα στοιχεία προμηθευτών.");
    ids.set(row.productId,row);
    const candidates=row.supplierCandidates;
    const seen=new Set();
    for(const candidate of candidates){if(!candidate||!validIdentity(candidate.supplierId)||!validIdentity(candidate.supplierName)||seen.has(candidate.supplierId)||!Number.isSafeInteger(candidate.documentCount)||candidate.documentCount<1||candidate.documentCount>20000||!Array.isArray(candidate.documentIds)||candidate.documentIds.length!==candidate.documentCount||new Set(candidate.documentIds).size!==candidate.documentCount||candidate.documentIds.some(id=>!validIdentity(id)))throw Error("Μη έγκυρα στοιχεία προμηθευτών.");seen.add(candidate.supplierId);observedCandidateDocuments+=candidate.documentCount;if(!Number.isSafeInteger(observedCandidateDocuments)||observedCandidateDocuments>evidence.observedDocumentProductSupplierCount)throw Error("Μη έγκυρα στοιχεία προμηθευτών.");}
    const sorted=[...candidates].sort((a,b)=>b.documentCount-a.documentCount);
    const winner=data.complete&&sorted.length&&(!sorted[1]||sorted[0].documentCount>sorted[1].documentCount)?sorted[0].supplierId:null;
    const reason=!data.complete?"INCOMPLETE_EVIDENCE":!sorted.length?"NO_APPROVED_DOCUMENT_EVIDENCE":!winner?"DOCUMENT_FREQUENCY_TIE":"DOCUMENT_FREQUENCY_IS_NOT_DELIVERY_FREQUENCY";
    if(row.candidateSupplierId!==winner||row.supplierReviewReason!==reason||(!data.complete&&candidates.length))throw Error("Μη έγκυρα στοιχεία προμηθευτών.");
  }
  const groupIds=new Set();
  for(const group of data.groups){
    if(!group||!validIdentity(group.candidateSupplierId)||groupIds.has(group.candidateSupplierId)||group.primarySupplierId!==null||group.reviewRequired!==true||!validIdentity(group.supplierName)||!Array.isArray(group.rows)||!group.rows.length)throw Error("Μη έγκυρα στοιχεία προμηθευτών.");groupIds.add(group.candidateSupplierId);
    for(const member of group.rows){if(!member||!validIdentity(member.productId))throw Error("Μη έγκυρα στοιχεία προμηθευτών.");const row=ids.get(member.productId);if(!row||membership.has(row.productId)||row.candidateSupplierId!==group.candidateSupplierId||!row.supplierCandidates.some(c=>c.supplierId===group.candidateSupplierId&&c.supplierName===group.supplierName))throw Error("Μη έγκυρα στοιχεία προμηθευτών.");membership.add(row.productId);}
  }
  for(const member of data.unassigned){if(!member||!validIdentity(member.productId))throw Error("Μη έγκυρα στοιχεία προμηθευτών.");const row=ids.get(member.productId);if(!row||membership.has(row.productId)||row.candidateSupplierId!==null)throw Error("Μη έγκυρα στοιχεία προμηθευτών.");membership.add(row.productId);}
  if(membership.size!==ids.size)throw Error("Μη έγκυρα στοιχεία προμηθευτών.");
}
export default function OrderSuggestionsPanel({api,storeId}){
  const [options,setOptions]=useState({historyDays:30,coverageDays:7,leadDays:3}),[result,setResult]=useState(null),[loading,setLoading]=useState(false),[error,setError]=useState("");
  const [view,setView]=useState("flat"),[supplier,setSupplier]=useState("all"),[stockShortfall,setStockShortfall]=useState("ALL");
  const [query,setQuery]=useState(""),[page,setPage]=useState(0),[onlyNeeded,setOnlyNeeded]=useState(true);
  const appliedOptions=useRef({historyDays:30,coverageDays:7,leadDays:3});
  const request=useRef(0),contentRef=useRef(null),helpRef=useRef(null);
  const [pageSize,setPageSize]=useState(2);
  const load=async(event,nextView=view,nextOptions=options)=>{
    event?.preventDefault();const current=++request.current;setResult(null);setError("");setPage(0);setSupplier("all");setStockShortfall("ALL");
    if(!storeId){setLoading(false);return;}setLoading(true);
    try{
      const data=await api(`/api/commerce/order-suggestions${nextView==="supplier"?"/by-supplier":""}?${new URLSearchParams({storeId,...nextOptions})}`);
      if(!data||data.storeId!==storeId||!Array.isArray(data.rows))throw Error("Μη έγκυρη απάντηση προτάσεων.");
      if(nextView==="supplier")validateSupplierProposal(data);
      if(request.current===current){appliedOptions.current=data.options;setResult({...data,_view:nextView});}
    }catch(e){if(request.current===current)setError(e.message||"Δεν μπόρεσαν να φορτωθούν οι προτάσεις.");}
    finally{if(request.current===current)setLoading(false);}
  };
  useEffect(()=>{load();return()=>{request.current++;};},[storeId]);
  const applied=result?.storeId===storeId&&result?._view===view?result:null;
  const rows=useMemo(()=>(applied?.rows||[]).filter(row=>(!onlyNeeded||row.suggestedQuantity===null||row.suggestedQuantity>0)&&(view!=="supplier"||supplier==="all"||(supplier==="unassigned"?row.candidateSupplierId===null:row.candidateSupplierId===supplier))&&(view!=="supplier"||matchesCurrentStockShortfall(row,stockShortfall))&&searchText(`${row.name} ${row.sku}`).includes(searchText(query.trim()))),[applied,query,onlyNeeded,view,supplier,stockShortfall]);
  const pages=Math.max(1,Math.ceil(rows.length/pageSize)),currentPage=Math.min(page,pages-1),shown=rows.slice(currentPage*pageSize,currentPage*pageSize+pageSize);
  const canExport=view==="supplier"&&!!storeId&&!!applied&&!loading&&!error&&rows.length>0;
  const exportProposal=()=>{
    if(!canExport)return;
    try{
      const csv=buildSupplierProposalCsv({snapshot:applied,rows,filters:{query:query.trim(),supplier,onlyNeeded,stockShortfall}});
      const url=URL.createObjectURL(new Blob([csv],{type:"text/csv;charset=utf-8"}));
      const link=document.createElement("a");link.href=url;link.download=`supplier-proposal-${String(storeId).replace(/[^a-zA-Z0-9_-]/g,"_")}-${applied.generatedAt.replace(/[^0-9]/g,"")}.csv`;
      document.body.appendChild(link);try{link.click();}finally{link.remove();setTimeout(()=>URL.revokeObjectURL(url),0);}
    }catch(e){setError(e.message||"Δεν μπόρεσε να εξαχθεί η πρόταση.");}
  };
  useLayoutEffect(()=>{
    const content=contentRef.current;
    const fit=()=>{if(pageSize>1&&content?.clientHeight>0&&content.scrollHeight>content.clientHeight+1){setPageSize(1);setPage(0);}};
    fit();
    const observer=typeof ResizeObserver==="undefined"?null:new ResizeObserver(fit);
    if(content)observer?.observe(content);
    return()=>observer?.disconnect();
  },[result,query,onlyNeeded,stockShortfall,page,pageSize]);
  return <section className="order-suggestions" aria-label="Αυτόματες Προτάσεις Παραγγελίας">
    <header><h3>Αυτόματες Προτάσεις Παραγγελίας</h3><p>Ποσότητες για έλεγχο από τον ιδιοκτήτη, στις μονάδες αποθήκης.</p></header>
    <form onSubmit={load} className="order-suggestions-options">
      {[["historyDays","Ιστορικό πωλήσεων (ημέρες)",7,90],["coverageDays","Κάλυψη (ημέρες)",1,60],["leadDays","Παράδοση (ημέρες)",0,30]].map(([key,label,min,max])=><label key={key}>{label}<input type="number" min={min} max={max} step="1" required value={options[key]} onChange={e=>setOptions({...options,[key]:e.target.value})}/></label>)}
      <button disabled={loading||!storeId}>{loading?"Υπολογισμός…":"Υπολογισμός προτάσεων"}</button>
    </form>
    <div className="order-suggestions-view"><label>Προβολή<select aria-label="Προβολή προτάσεων" value={view} onChange={e=>{const next=e.target.value;setView(next);load(null,next,appliedOptions.current);}}><option value="flat">Όλα τα είδη</option><option value="supplier">Ανά προμηθευτή (πρόταση)</option></select></label>{view==="supplier"&&applied&&<label>Υποψήφιος προμηθευτής<select aria-label="Φίλτρο προμηθευτή" value={supplier} onChange={e=>{setSupplier(e.target.value);setPage(0);}}><option value="all">Όλοι οι υποψήφιοι / χωρίς ανάθεση</option>{applied.groups.map(group=><option key={group.candidateSupplierId} value={group.candidateSupplierId}>{group.supplierName} ({group.rows.length})</option>)}<option value="unassigned">Χωρίς προμηθευτή ({applied.unassigned.length})</option></select></label>}{view==="supplier"&&<label>Τρέχον καταγεγραμμένο έλλειμμα<select aria-label="Φίλτρο τρέχοντος ελλείμματος" value={stockShortfall} onChange={e=>{setStockShortfall(e.target.value);setPage(0);}}><option value="ALL">Όλα</option><option value="BELOW_MINIMUM">Κάτω από ελάχιστο</option><option value="DEMAND_REPLENISHMENT">Αναπλήρωση ζήτησης</option><option value="REVIEW_REQUIRED">Χρειάζεται έλεγχος</option></select></label>}</div>
    <div className="order-suggestions-filter"><label>Προϊόν ή κωδικός<input placeholder="Αναζήτηση προτάσεων" value={query} onChange={e=>{setQuery(e.target.value);setPage(0);}}/></label><label className="order-suggestions-check"><input type="checkbox" checked={onlyNeeded} onChange={e=>{setOnlyNeeded(e.target.checked);setPage(0);}}/>Μόνο ποσότητες για παραγγελία / έλεγχο</label></div>
    {view==="supplier"&&<button type="button" disabled={!canExport} onClick={exportProposal}>CSV πρότασης για έλεγχο (όλες οι φιλτραρισμένες σελίδες)</button>}
    <div ref={contentRef} className="order-suggestions-content" aria-busy={loading}>
      {error?<div role="alert">{error} Δοκίμασε ξανά με «Υπολογισμός προτάσεων».</div>:loading?<p role="status">Φόρτωση αποθέματος και πωλήσεων…</p>:!storeId?<p>Επίλεξε κατάστημα.</p>:!applied?null:<>
        <p className="order-suggestions-summary" role="status">{rows.length} είδη · ιστορικό {applied.options.historyDays} ημερών · κάλυψη {applied.options.coverageDays} + παράδοση {applied.options.leadDays} ημερών</p>
        {view==="supplier"&&<p className="order-suggestions-proxy" role="note">Πρόταση από συχνότητα εγκεκριμένων παραστατικών (PROXY), όχι επιβεβαιωμένες φυσικές παραδόσεις. {new Date(applied.supplierEvidence.from).toLocaleString("el-GR",{timeZone:"Europe/Athens",hour12:false})} – {new Date(applied.supplierEvidence.to).toLocaleString("el-GR",{timeZone:"Europe/Athens",hour12:false})} (ώρα Ελλάδας) · {applied.supplierEvidence.historyDays} ημέρες. Δεν ορίζεται κύριος προμηθευτής· απαιτείται ανθρώπινος έλεγχος. {!applied.complete&&"Ελλιπής πηγή: όλες οι προτάσεις χωρίς ανάθεση."}</p>}
        {view==="supplier"&&<p role="note">Το έλλειμμα συγκρίνει το καταγεγραμμένο απόθεμα με το ελάχιστο, όχι επιβεβαιωμένο φυσικό απόθεμα. Η πρόταση μπορεί να αφορά ιστορική ζήτηση και παραμένει χωριστή ποσότητα για έλεγχο.</p>}
        {!rows.length?<p>Δεν υπάρχουν προτάσεις με αυτά τα φίλτρα.</p>:<div className="order-suggestions-table"><table><thead><tr><th>Προϊόν / μονάδα</th><th>Απόθεμα / ελάχιστο</th><th>Καθαρή κίνηση / ημέρα</th><th>Πρόταση</th><th>Αιτιολογία</th></tr></thead><tbody>{shown.map(row=><tr key={row.productId}><td><b>{row.name}</b><small>{row.sku||"—"} · {row.unitLabel}</small></td><td>{n(row.currentStock)} / {n(row.minStock)}{view==="supplier"&&<div className="order-suggestions-shortfall"><b>{shortfallLabels[row.currentStockShortfall.status]}</b><small>{shortfallQuantity(row.currentStockShortfall.quantity)} · {row.unitLabel}</small>{row.currentStockShortfall.reviewReasons.map(reason=><small key={reason}>{shortfallReasons[reason]}</small>)}</div>}</td><td>{n(row.netQuantity)} / {n(row.dailyDemand)}<small>Πωλήσεις {n(row.soldQuantity)} · επιστροφές/ακυρώσεις {n(row.returnedQuantity)}</small></td><td className="order-suggestions-quantity">{n(row.suggestedQuantity)}<small>{row.unitLabel}</small></td><td>{view==="supplier"&&<div className="order-suggestions-supplier"><b>{row.candidateSupplierId?applied.groups.find(group=>group.candidateSupplierId===row.candidateSupplierId)?.supplierName:"Χωρίς προμηθευτή"}</b><small>{supplierReasons[row.supplierReviewReason]}</small>{row.supplierCandidates.map(candidate=><small key={candidate.supplierId}>{candidate.supplierName}: {candidate.documentCount} εγκεκριμένα παραστατικά</small>)}</div>}{row.reason}{row.warnings.map(warning=><small className="order-suggestions-warning" key={warning}>{warning}</small>)}</td></tr>)}</tbody></table></div>}
        <nav aria-label="Σελίδες προτάσεων"><button type="button" disabled={currentPage===0} onClick={()=>setPage(currentPage-1)}>Προηγούμενα</button><span>{currentPage+1} / {pages}</span><button type="button" disabled={currentPage+1>=pages} onClick={()=>setPage(currentPage+1)}>Επόμενα</button></nav>
      </>}
    </div>
    <footer><span>Πρόταση για έλεγχο · έλεγξε απόθεμα, συσκευασίες και εκκρεμείς παραγγελίες. Δεν υποβάλλεται παραγγελία.</span><button type="button" onClick={()=>helpRef.current.showModal()}>Πώς υπολογίζεται</button></footer>
    <dialog ref={helpRef} className="order-suggestions-help" aria-labelledby="order-suggestions-help-title"><h3 id="order-suggestions-help-title">Πώς υπολογίζεται η πρόταση</h3><p>Στόχος = το μεγαλύτερο από ελάχιστο απόθεμα και καθαρή ημερήσια κίνηση × (κάλυψη + παράδοση). Πρόταση = στόχος − απόθεμα, με στρογγυλοποίηση προς τα πάνω. Κίνηση από γραμμές ολοκληρωμένων πωλήσεων, σε κυλιόμενες ημέρες· οι αναλώσεις υλικών συνταγών δεν προβλέπονται εδώ. Έλεγξε εκκρεμείς παραγγελίες, διαθεσιμότητα και συσκευασίες· δεν έχουν αφαιρεθεί από την πρόταση. Δεν υποβάλλεται παραγγελία.</p><button type="button" autoFocus onClick={()=>helpRef.current.close()}>Κλείσιμο βοήθειας</button></dialog>
  </section>;
}

