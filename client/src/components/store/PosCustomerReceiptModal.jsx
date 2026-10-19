import {capturedLifecycleGeneration,originalLifecycleHeaders} from "../../utils/store-lifecycle-origin.js";
import React,{useRef,useState} from "react";
import "./pos-customer-account.css";
const euro=v=>Number(v||0).toLocaleString("el-GR",{style:"currency",currency:"EUR"});
export function pendingCustomerReceipt(scope,storeId,customerId){try{return Boolean(JSON.parse(sessionStorage.getItem(`mws-customer-receipt:${scope}:${storeId}:${customerId}`)||"null")?.idempotencyKey)}catch{return false}}

export default function PosCustomerReceiptModal({api,store,customer,access,receiptScope,onClose,onPaid}){
  const storageKey=`mws-customer-receipt:${receiptScope}:${store.id}:${customer.id}`;
  const [pending]=useState(()=>{try{const value=JSON.parse(sessionStorage.getItem(storageKey)||"null");return value?.customerId===customer.id&&value.idempotencyKey?value:null}catch{return null}});
  const openingBalance=pending?.expectedBalance??Number(customer.balance||0);
  const [amount,setAmount]=useState(Number(pending?.amount??openingBalance).toFixed(2)),[method,setMethod]=useState(pending?.method||(access?.cash===false?"CARD":"CASH")),[reference,setReference]=useState(pending?.cardReference||""),[received,setReceived]=useState(Boolean(pending)),[busy,setBusy]=useState(false),[error,setError]=useState("");
  const submission=useRef(pending),lock=useRef(false);
  const methodAllowed=access?.[method==="CASH"?"cash":"cards"]!==false;
  const value=Number(amount.replace(",",".")),valid=Number.isFinite(value)&&value>0&&value<=openingBalance&&Math.abs(value*100-Math.round(value*100))<1e-6;
  const send=async event=>{
    event.preventDefault();if(lock.current)return;
    if(!methodAllowed||!valid||!received||(method==="CARD"&&!reference.trim()))return setError("Έλεγξε το ποσό και επιβεβαίωσε την πραγματική είσπραξη.");
    const payload={customerId:customer.id,amount:value,expectedBalance:openingBalance,method,received:true,cardReference:reference.trim()};
    // Freeze both the body and key after the first attempt: a lost response is retried safely.
    if(!submission.current){const next={...payload,idempotencyKey:crypto.randomUUID(),lifecycleGeneration:capturedLifecycleGeneration(store.id)};try{sessionStorage.setItem(storageKey,JSON.stringify(next));submission.current=next}catch{return setError("Δεν μπορεί να αποθηκευτεί η ασφαλής αναφορά είσπραξης. Δεν έγινε υποβολή.")}}
    lock.current=true;setBusy(true);setError("");
    try{const result=await api(`/api/store-pos/stores/${store.id}/customer-balance-payment`,{method:"POST",headers:originalLifecycleHeaders(store.id,submission.current?.lifecycleGeneration??"0"),body:JSON.stringify(submission.current)});sessionStorage.removeItem(storageKey);onPaid(result);onClose()}
    catch(err){setError(`${err.message} Τα ίδια στοιχεία διατηρούνται για ασφαλή επανάληψη.`)}
    finally{lock.current=false;setBusy(false)}
  };
  const frozen=busy||Boolean(submission.current);
  const recover=async()=>{if(lock.current||!submission.current)return;lock.current=true;setBusy(true);setError("");try{const result=await api(`/api/store-pos/stores/${store.id}/customer-receipt-recovery`,{method:"POST",headers:originalLifecycleHeaders(store.id,submission.current?.lifecycleGeneration??"0"),body:JSON.stringify(submission.current)});sessionStorage.removeItem(storageKey);onPaid(result);onClose()}catch(err){setError(err.message)}finally{lock.current=false;setBusy(false)}};
  return <div className="pos-standard-modal pos-customer-receipt"><section role="dialog" aria-modal="true" aria-label="Είσπραξη οφειλής πελάτη"><header><div><small>{store.name}</small><h2>Είσπραξη οφειλής</h2></div><button type="button" disabled={busy} onClick={onClose} aria-label="Κλείσιμο είσπραξης">×</button></header><form onSubmit={send}>
    <strong>{customer.name}</strong><p>Οφειλή πριν την είσπραξη: <b>{euro(openingBalance)}</b></p>
    <label>Ποσό είσπραξης<input autoFocus inputMode="decimal" value={amount} disabled={frozen} onChange={e=>setAmount(e.target.value)}/></label>
    <div className="pos-receipt-methods">{[["CASH","Μετρητά","cash"],["CARD","Κάρτα","cards"]].map(([id,label,right])=><button key={id} type="button" aria-pressed={method===id} disabled={frozen||access?.[right]===false} onClick={()=>{setMethod(id);setReceived(false)}}>{label}</button>)}</div>
    {method==="CARD"&&<><p>Ολοκλήρωσε την πληρωμή στο τερματικό κάρτας. Εδώ καταγράφεις την ήδη εγκεκριμένη είσπραξη.</p><label>Αναφορά έγκρισης τερματικού<input value={reference} disabled={frozen} maxLength={80} onChange={e=>setReference(e.target.value)}/></label></>}
    <label className="pos-receipt-confirm"><input type="checkbox" checked={received} disabled={frozen} onChange={e=>setReceived(e.target.checked)}/>{method==="CARD"?"Η πληρωμή κάρτας εγκρίθηκε στο τερματικό":"Παρέλαβα τα μετρητά"}</label>
    <p>Υπόλοιπο μετά: <b>{valid?euro(openingBalance-value):"—"}</b></p>
    {error&&<p role="alert">{error}</p>}
    <button className="pos-primary-action" disabled={busy||!methodAllowed||!valid||!received||(method==="CARD"&&!reference.trim())}>{busy?"Καταχώριση…":submission.current?"Ασφαλής επανάληψη ίδιας είσπραξης":"Καταχώριση είσπραξης"}</button>
    {submission.current&&<small>Αν η απάντηση χάθηκε, επανάλαβε εδώ. Μην καταχωρίσεις δεύτερη είσπραξη και μην ξαναχρεώσεις την κάρτα.</small>}
    {submission.current&&<button type="button" disabled={busy} onClick={recover}>Έλεγχος κατάστασης / αποδέσμευση υποβολής</button>}
  </form></section></div>;
}
