import React,{useEffect,useMemo,useState} from "react";
import {BadgeCheck,ContactRound,Copy,ExternalLink,KeyRound,RefreshCw,Save,ScanLine,Search,ShieldCheck} from "lucide-react";
import "./operator-access.css";

const when=value=>value?new Date(value).toLocaleString("el-GR"):"Ποτέ";

export default function OperatorAccessPanel({api,store}){
  const [data,setData]=useState(null);
  const [drafts,setDrafts]=useState({});
  const [loading,setLoading]=useState(true);
  const [busy,setBusy]=useState("");
  const [error,setError]=useState("");
  const [message,setMessage]=useState("");

  const load=async()=>{
    setLoading(true);setError("");
    try{
      const [result,searchAccess]=await Promise.all([
        api(`/api/operators/stores/${store.id}`),
        api(`/api/store-pos/stores/${store.id}/operator-search-permissions`).catch(()=>({rows:[]}))
      ]);
      const accessByEmployee=new Map((searchAccess.rows||[]).map(row=>[row.employeeId,Boolean(row.onlineProductSearch)]));
      setData(result);
      setDrafts(Object.fromEntries(result.operators.map(row=>[row.employeeId,{
        role:row.role||"EMPLOYEE",active:Boolean(row.active),pin:"",cardCode:"",clearPin:false,clearCard:false,onlineProductSearch:accessByEmployee.get(row.employeeId)||false
      }])));
    }catch(err){setError(err.message)}finally{setLoading(false)}
  };
  useEffect(()=>{load()},[store.id]);

  const storeUrl=useMemo(()=>data?`${window.location.origin}${data.store.operatorUrl}`:"",[data]);
  const update=(employeeId,key,value)=>setDrafts(all=>({...all,[employeeId]:{...all[employeeId],[key]:value}}));

  const save=async row=>{
    const draft=drafts[row.employeeId];
    setBusy(row.employeeId);setError("");setMessage("");
    try{
      await api(`/api/operators/stores/${store.id}/employees/${row.employeeId}`,{method:"PUT",body:JSON.stringify(draft)});
      await api(`/api/store-pos/stores/${store.id}/operator-search-permissions/${row.employeeId}`,{method:"PUT",body:JSON.stringify({onlineProductSearch:Boolean(draft.onlineProductSearch)})});
      setMessage(`Η πρόσβαση του/της ${row.fullName} αποθηκεύτηκε στο BackOffice.`);
      await load();
    }catch(err){setError(err.message)}finally{setBusy("")}
  };

  const copyUrl=async()=>{try{await navigator.clipboard.writeText(storeUrl);setMessage("Ο σύνδεσμος Store Mode αντιγράφηκε.")}catch{setMessage(storeUrl)}};

  return <article className="cloud-panel operator-panel">
    <div className="cloud-panel-head operator-heading"><div><h3><ContactRound/>Προσωπική είσοδος εργαζομένων</h3><p>PIN ή κάρτα ανά εργαζόμενο, δικαιώματα POS και ονομαστικό audit.</p></div><button onClick={load} disabled={loading||Boolean(busy)}><RefreshCw/>Ανανέωση</button></div>
    {error&&<div className="cloud-alert cloud-error">{error}</div>}
    {message&&<div className="cloud-alert cloud-success">{message}</div>}
    {loading?<div className="cloud-loading">Φόρτωση προσβάσεων καταστήματος…</div>:<>
      <div className="operator-store-link"><div><small>STORE MODE — {store.name}</small><strong>{storeUrl}</strong><span>Αυτός είναι ο σύνδεσμος που θα ανοίγει η συντόμευση στον υπολογιστή του καταστήματος.</span></div><button onClick={copyUrl}><Copy/>Αντιγραφή</button><a href={storeUrl} target="_blank" rel="noreferrer"><ExternalLink/>Δοκιμή</a></div>
      <div className="operator-safety"><ShieldCheck/><div><b>Δικαιώματα από BackOffice</b><span>Η Online αναζήτηση προϊόντων ενεργοποιείται ξεχωριστά ανά χειριστή και κάθε χρήση της καταγράφεται στα συμβάντα.</span></div></div>
      <div className="operator-list">{data.operators.map(row=>{const draft=drafts[row.employeeId]||{role:"EMPLOYEE",active:false,pin:"",cardCode:"",clearPin:false,clearCard:false,onlineProductSearch:false};return <div className={`operator-row ${!row.employeeActive?"operator-disabled":""}`} key={row.employeeId}>
        <div className="operator-person"><div className="operator-avatar">{row.fullName.slice(0,1).toUpperCase()}</div><div><b>{row.fullName}</b><span>{row.position||"Εργαζόμενος"}</span><small>Τελευταία είσοδος: {when(row.lastLoginAt)}</small></div></div>
        <label>Ρόλος<select value={draft.role} onChange={e=>update(row.employeeId,"role",e.target.value)}><option value="EMPLOYEE">Εργαζόμενος</option><option value="MANAGER">Υπεύθυνος</option></select></label>
        <label><span><KeyRound/>Νέο PIN</span><input type="password" inputMode="numeric" maxLength="8" placeholder={row.hasPin?"PIN ενεργό":"4–8 ψηφία"} value={draft.pin} onChange={e=>update(row.employeeId,"pin",e.target.value.replace(/\D/g,""))}/></label>
        <label><span><ScanLine/>Κάρτα / barcode</span><input placeholder={row.hasCard?`Ενεργή ••••${row.cardCodeLast4||""}`:"Σκάναρε ή γράψε κωδικό"} value={draft.cardCode} onChange={e=>update(row.employeeId,"cardCode",e.target.value)}/></label>
        <div className="operator-flags"><label className="operator-check"><input type="checkbox" checked={draft.active} disabled={!row.employeeActive} onChange={e=>update(row.employeeId,"active",e.target.checked)}/>Ενεργή πρόσβαση</label><label className="operator-check"><input type="checkbox" checked={Boolean(draft.onlineProductSearch)} disabled={!row.employeeActive||!row.active} onChange={e=>update(row.employeeId,"onlineProductSearch",e.target.checked)}/><Search/>Online αναζήτηση προϊόντων</label><div className="operator-statuses">{row.hasPin&&<span><BadgeCheck/>PIN</span>}{row.hasCard&&<span><BadgeCheck/>Κάρτα</span>}</div></div>
        <button className="operator-save" onClick={()=>save(row)} disabled={busy===row.employeeId||!row.employeeActive}><Save/>{busy===row.employeeId?"Αποθήκευση…":"Αποθήκευση"}</button>
      </div>})}</div>
    </>}
  </article>;
}
