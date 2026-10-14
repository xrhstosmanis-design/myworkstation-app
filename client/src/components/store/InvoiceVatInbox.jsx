import React,{useEffect,useRef,useState} from "react";

export default function InvoiceVatInbox({api,store,suppliers=[],disabled=false,onSupplier,onRead}){
  const [vat,setVat]=useState(""),[number,setNumber]=useState(""),[date,setDate]=useState(""),[items,setItems]=useState([]),[candidate,setCandidate]=useState(null),[busy,setBusy]=useState(false),[message,setMessage]=useState("");
  const generation=useRef(0),pending=useRef(false),callbacks=useRef({api,onSupplier,onRead,suppliers});callbacks.current={api,onSupplier,onRead,suppliers};
  useEffect(()=>{generation.current++;pending.current=false;setVat("");setNumber("");setDate("");setItems([]);setCandidate(null);setBusy(false);setMessage("");return()=>{generation.current++}},[store.id]);
  useEffect(()=>{if(disabled){generation.current++;pending.current=false;setBusy(false)}},[disabled]);
  const changeVat=value=>{generation.current++;pending.current=false;setBusy(false);setVat(value.replace(/\D/g,"").slice(0,9));setItems([]);setCandidate(null);setMessage("")};
  const search=async(taxId,current)=>{
    const result=await callbacks.current.api("/api/commerce/documents/pos-inbox",{method:"POST",body:JSON.stringify({storeId:store.id,taxId,number,date})});
    if(current!==generation.current)return;
    setItems(result.items||[]);setMessage(result.message+(result.more?" Υπάρχουν περισσότερα· βάλε αριθμό ή ημερομηνία.":""));
  };
  const lookup=async()=>{
    if(pending.current||disabled)return;if(vat.length!==9){setMessage("Γράψε ΑΦΜ 9 ψηφίων.");return}
    const current=++generation.current;pending.current=true;setBusy(true);setItems([]);setCandidate(null);setMessage("Αναζήτηση προμηθευτή…");
    try{
      const known=callbacks.current.suppliers.filter(s=>String(s.taxId||"").replace(/\D/g,"")===vat);
      if(known.length>1)throw Error("Υπάρχουν πολλοί προμηθευτές με αυτό το ΑΦΜ. Επίλεξε τον σωστό από τη λίστα.");
      let supplier=known[0];
      if(!supplier){const data=await callbacks.current.api(`/api/commerce/vat-lookup?storeId=${encodeURIComponent(store.id)}&taxId=${vat}`);if(current!==generation.current)return;supplier=data.existingSupplier;if(!supplier){if(!data.valid||data.taxId!==vat||!data.name)throw Error("Δεν επιβεβαιώθηκαν τα επίσημα στοιχεία του προμηθευτή.");setCandidate({name:data.name,taxId:data.taxId});setMessage("Επιβεβαίωσε την επίσημη επωνυμία και πάτησε καταχώριση προμηθευτή.");return}}
      if(current!==generation.current)return;callbacks.current.onSupplier(supplier);await search(vat,current);
    }catch(error){if(current===generation.current)setMessage(error.message||"Δεν ολοκληρώθηκε η αναζήτηση. Μπορείς να χρησιμοποιήσεις φωτογραφίες.")}
    finally{if(current===generation.current){pending.current=false;setBusy(false)}}
  };
  const saveSupplier=async()=>{
    if(pending.current||!candidate)return;const current=++generation.current;pending.current=true;setBusy(true);
    try{const supplier=await callbacks.current.api("/api/commerce/suppliers",{method:"POST",body:JSON.stringify(candidate)});if(current!==generation.current)return;callbacks.current.onSupplier({...candidate,...supplier});setCandidate(null);await search(candidate.taxId,current)}catch(error){if(current===generation.current)setMessage(error.message)}finally{if(current===generation.current){pending.current=false;setBusy(false)}}
  };
  const read=async item=>{
    if(pending.current||disabled)return;const current=++generation.current;pending.current=true;setBusy(true);setMessage("Λήψη πρωτότυπου PDF και βασικών στοιχείων…");
    try{
      const data=await callbacks.current.api("/api/commerce/documents/pos-inbox",{method:"POST",timeoutMs:60000,body:JSON.stringify({storeId:store.id,taxId:vat,inboxId:item.inboxId})});
      if(current!==generation.current)return;
      if(data?.header?.supplierTaxId!==vat||data.inboxId!==item.inboxId||!/^data:application\/pdf;base64,/.test(data.dataUrl||""))throw Error("Δεν επιβεβαιώθηκε το πρωτότυπο του επιλεγμένου τιμολογίου.");
      const bytes=Uint8Array.from(atob(data.dataUrl.split(",")[1]),c=>c.charCodeAt(0));
      callbacks.current.onRead({...data,file:new File([bytes],data.filename,{type:"application/pdf"})});setMessage("Συμπληρώθηκαν ποσό και αριθμός. Έλεγξέ τα και συνέχισε την ίδια πληρωμή.");setItems([]);
    }catch(error){if(current===generation.current)setMessage(`${error.message} Μπορείς να χρησιμοποιήσεις φωτογραφίες.`)}finally{if(current===generation.current){pending.current=false;setBusy(false)}}
  };
  return <section aria-label="Αναζήτηση τιμολογίου με ΑΦΜ" className="pos-vat-inbox">
    <b>Τιμολόγιο από θυρίδα με ΑΦΜ</b>
    <div className="pos-vat-inbox-fields"><label>ΑΦΜ προμηθευτή<input aria-label="ΑΦΜ προμηθευτή" inputMode="numeric" value={vat} onChange={e=>changeVat(e.target.value)} disabled={disabled}/></label><label>Αριθμός τιμολογίου (προαιρετικό)<input value={number} onChange={e=>{generation.current++;pending.current=false;setBusy(false);setItems([]);setNumber(e.target.value)}} disabled={disabled}/></label><label>Ημερομηνία έκδοσης (προαιρετικό)<input type="date" value={date} onChange={e=>{generation.current++;pending.current=false;setBusy(false);setItems([]);setDate(e.target.value)}} disabled={disabled}/></label></div>
    <button type="button" disabled={disabled||busy} onClick={lookup}>{busy?"Αναζήτηση…":"Εύρεση προμηθευτή / τιμολογίου"}</button>
    {candidate&&<div><b>{candidate.name} · {candidate.taxId}</b><button type="button" disabled={disabled||busy} onClick={saveSupplier}>Επιβεβαίωση και καταχώριση προμηθευτή</button></div>}
    {message&&<p role="status">{message}</p>}
    {items.length>0&&<div className="pos-vat-inbox-results">{items.map(item=><button type="button" disabled={disabled||busy} key={item.inboxId} onClick={()=>read(item)}>{item.header.documentNumber} · {item.header.documentDate.split("-").reverse().join("/")} · {item.header.totalGross.toLocaleString("el-GR",{style:"currency",currency:"EUR"})} · Λήψη PDF</button>)}</div>}
    <small>Αν δεν υπάρχει διαθέσιμο τιμολόγιο ή PDF, χρησιμοποίησε τις φωτογραφίες παρακάτω.</small>
  </section>;
}
