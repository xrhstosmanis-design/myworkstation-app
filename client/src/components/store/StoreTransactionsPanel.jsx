import React,{useEffect,useState} from "react";
import {ArrowRightLeft,CreditCard,RefreshCw,ReceiptText,ShoppingCart,Truck,WalletCards} from "lucide-react";
import "./store-transactions.css";

const money=value=>Number(value||0).toLocaleString("el-GR",{style:"currency",currency:"EUR"});
const when=value=>value?new Date(value).toLocaleString("el-GR",{day:"2-digit",month:"2-digit",hour:"2-digit",minute:"2-digit"}):"—";
const types=[
  {id:"SALE_CASH",label:"Πώληση μετρητών",icon:ShoppingCart},
  {id:"SALE_CARD",label:"Πώληση με κάρτα",icon:CreditCard},
  {id:"SUPPLIER_PAYMENT",label:"Πληρωμή προμηθευτή",icon:Truck},
  {id:"OTHER_EXPENSE",label:"Λοιπά έξοδα",icon:ReceiptText},
  {id:"CASH_TRANSFER",label:"Μεταφορά ποσού",icon:ArrowRightLeft}
];
const typeInfo=id=>types.find(item=>item.id===id)||types[0];

export default function StoreTransactionsPanel({api,store,onChanged}){
  const [data,setData]=useState(null);
  const [type,setType]=useState("SALE_CASH");
  const [amount,setAmount]=useState("");
  const [description,setDescription]=useState("");
  const [supplierName,setSupplierName]=useState("");
  const [loading,setLoading]=useState(true);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState("");
  const [message,setMessage]=useState("");

  const load=async()=>{
    setLoading(true);setError("");
    try{setData(await api(`/api/transactions/stores/${store.id}/overview`))}
    catch(err){setError(err.message)}finally{setLoading(false)}
  };
  useEffect(()=>{load()},[store.id]);

  const save=async event=>{
    event.preventDefault();setBusy(true);setError("");setMessage("");
    try{
      await api(`/api/transactions/stores/${store.id}`,{method:"POST",body:JSON.stringify({type,amount:Number(amount),description,supplierName})});
      setAmount("");setDescription("");setSupplierName("");setMessage("Η συναλλαγή καταχωρίστηκε στη βάρδια.");
      await load();onChanged?.();
    }catch(err){setError(err.message)}finally{setBusy(false)}
  };

  const summary=data?.summary||{};
  return <article className="cloud-panel ledger-module">
    <div className="cloud-panel-head ledger-heading"><div><h3><WalletCards/>Συναλλαγές Βάρδιας</h3><p>Πωλήσεις, πληρωμές, έξοδα και μεταφορές με προσωπικό audit.</p></div><button onClick={load} disabled={loading||busy}><RefreshCw/>Ανανέωση</button></div>
    <div className="ledger-non-fiscal"><b>ΜΗ ΦΟΡΟΛΟΓΙΚΗ ΚΑΤΑΓΡΑΦΗ</b><span>Η απόδειξη συνεχίζει να εκδίδεται από το υπάρχον Kiosk Manager και την ταμειακή.</span></div>
    {error&&<div className="cloud-alert cloud-error">{error}</div>}
    {message&&<div className="cloud-alert cloud-success">{message}</div>}
    {loading?<div className="cloud-loading">Φόρτωση συναλλαγών…</div>:<>
      <div className="ledger-metrics"><article><span>Μετρητά</span><strong>{money(summary.cashSales)}</strong></article><article><span>Κάρτες</span><strong>{money(summary.cardSales)}</strong></article><article><span>Έξοδα</span><strong>{money(summary.expensesTotal)}</strong></article><article><span>Μεταφορές</span><strong>{money(summary.cashTransfers)}</strong></article></div>
      {!data?.openSession?<div className="ledger-no-shift"><b>Δεν υπάρχει ανοιχτή βάρδια.</b><span>Άνοιξε πρώτα τη βάρδια στον Έλεγχο Ταμείου.</span></div>:<form className="ledger-form" onSubmit={save}>
        <div className="ledger-session"><span>Ενεργή βάρδια</span><b>{data.openSession.shiftLabel}</b><small>{when(data.openSession.openedAt)} · {data.openSession.openedByName||"Χρήστης"}</small></div>
        <div className="ledger-types">{types.map(item=>{const Icon=item.icon;return <button type="button" className={type===item.id?"active":""} onClick={()=>setType(item.id)} key={item.id}><Icon/><span>{item.label}</span></button>})}</div>
        <label>Ποσό<input type="number" min="0.01" step="0.01" value={amount} onChange={e=>setAmount(e.target.value)} required/></label>
        {type==="SUPPLIER_PAYMENT"&&<label>Προμηθευτής<input value={supplierName} onChange={e=>setSupplierName(e.target.value)} required/></label>}
        <label>Περιγραφή<input value={description} onChange={e=>setDescription(e.target.value)} placeholder="Προαιρετική αιτιολογία"/></label>
        <button className="ledger-submit" disabled={busy||!amount}>{busy?"Καταχώριση…":"Καταχώριση"}</button>
      </form>}
      <div className="ledger-list">{(data?.recent||[]).length===0?<div className="cloud-empty">Δεν υπάρχουν ακόμη συναλλαγές.</div>:data.recent.map(row=>{const info=typeInfo(row.type);const Icon=info.icon;return <div className={`ledger-row ${row.reversedAt?"reversed":""}`} key={row.id}><Icon/><div><b>{info.label}</b><span>{row.supplierName||row.description||"Χωρίς περιγραφή"}</span><small>{when(row.occurredAt)} · {row.actorName}</small></div><strong>{money(row.amount)}</strong><em>{row.reversedAt?"ΑΚΥΡΩΜΕΝΗ":"ΕΝΕΡΓΗ"}</em></div>})}</div>
    </>}
  </article>;
}
