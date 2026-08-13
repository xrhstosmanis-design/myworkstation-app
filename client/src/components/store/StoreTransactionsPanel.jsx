import React,{useEffect,useState} from "react";
import {ArrowRightLeft,Camera,CreditCard,Eye,RefreshCw,ReceiptText,RotateCcw,ShoppingCart,Truck,WalletCards} from "lucide-react";
import "./store-transactions.css";

const money=value=>Number(value||0).toLocaleString("el-GR",{style:"currency",currency:"EUR"});
const when=value=>value?new Date(value).toLocaleString("el-GR",{day:"2-digit",month:"2-digit",hour:"2-digit",minute:"2-digit"}):"—";
const methodLabel=method=>method==="CASH"?"ΜΕΤΡΗΤΑ":method==="CARD"?"ΚΑΡΤΑ":method==="IRIS"?"IRIS":String(method||"ΠΛΗΡΩΜΗ");
const types=[
  {id:"SALE_CASH",label:"Πώληση μετρητών",icon:ShoppingCart},
  {id:"SALE_CARD",label:"Πώληση με κάρτα",icon:CreditCard},
  {id:"SUPPLIER_PAYMENT",label:"Πληρωμή προμηθευτή",icon:Truck},
  {id:"OTHER_EXPENSE",label:"Λοιπά έξοδα",icon:ReceiptText},
  {id:"PERCENTAGES",label:"Ποσοστά",icon:ArrowRightLeft}
];
const typeInfo=id=>types.find(item=>item.id===id)||types[0];
const photoRequired=type=>type==="SUPPLIER_PAYMENT"||type==="OTHER_EXPENSE";
const isLinkedPosRow=row=>/POS πώληση|ΑΛΛΑΓΗ ΕΙΔΟΥΣ/i.test(String(row?.description||""));

async function preparePhoto(file){
  if(!file)return null;
  if(!["image/jpeg","image/png","image/webp"].includes(file.type))throw new Error("Επίλεξε φωτογραφία JPEG, PNG ή WEBP.");
  const source=await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=()=>reject(new Error("Δεν διαβάστηκε η φωτογραφία."));reader.readAsDataURL(file)});
  const image=await new Promise((resolve,reject)=>{const img=new Image();img.onload=()=>resolve(img);img.onerror=()=>reject(new Error("Η φωτογραφία δεν είναι έγκυρη."));img.src=source});
  const scale=Math.min(1,1600/Math.max(image.width,image.height));
  const canvas=document.createElement("canvas");canvas.width=Math.round(image.width*scale);canvas.height=Math.round(image.height*scale);
  canvas.getContext("2d").drawImage(image,0,0,canvas.width,canvas.height);
  return {dataUrl:canvas.toDataURL("image/jpeg",.78),filename:(file.name||"parastatiko.jpg").replace(/\.[^.]+$/,".jpg")};
}

export default function StoreTransactionsPanel({api,store,onChanged}){
  const [data,setData]=useState(null),[sales,setSales]=useState([]);
  const [type,setType]=useState("SALE_CASH"),[amount,setAmount]=useState(""),[description,setDescription]=useState(""),[supplierName,setSupplierName]=useState(""),[supplierId,setSupplierId]=useState("");
  const [attachment,setAttachment]=useState(null),[attachmentName,setAttachmentName]=useState(""),[subtractFromShift,setSubtractFromShift]=useState(false);
  const [loading,setLoading]=useState(true),[busy,setBusy]=useState(false),[error,setError]=useState(""),[message,setMessage]=useState("");

  const load=async()=>{
    setLoading(true);setError("");
    try{
      const [overview,saleData]=await Promise.all([
        api(`/api/transactions/stores/${store.id}/overview`),
        api(`/api/store-pos/stores/${store.id}/sales/recent`).catch(()=>({rows:[]}))
      ]);
      setData(overview);setSales(saleData.rows||[]);
    }catch(err){setError(err.message)}finally{setLoading(false)}
  };
  useEffect(()=>{load()},[store.id]);

  const save=async event=>{
    event.preventDefault();setBusy(true);setError("");setMessage("");
    try{
      const saved=await api(`/api/transactions/stores/${store.id}`,{method:"POST",body:JSON.stringify({type,amount:Number(amount),description,supplierId,supplierName,attachment,subtractFromShift})});
      setAmount("");setDescription("");setSupplierId("");setSupplierName("");setAttachment(null);setAttachmentName("");setSubtractFromShift(false);
      setMessage(saved.emailNotification?.status==="FAILED"?"Η καταχώριση αποθηκεύτηκε, αλλά το email ειδοποίησης δεν στάλθηκε.":"Η συναλλαγή καταχωρίστηκε στη βάρδια.");
      await load();onChanged?.();
    }catch(err){setError(err.message)}finally{setBusy(false)}
  };
  const choosePhoto=async event=>{setError("");try{const ready=await preparePhoto(event.target.files?.[0]);setAttachment(ready);setAttachmentName(ready?.filename||"")}catch(err){setAttachment(null);setAttachmentName("");setError(err.message)}};
  const viewPhoto=async row=>{try{const result=await api(`/api/transactions/${row.id}/attachment`);const popup=window.open();if(popup)popup.document.write(`<title>Παραστατικό</title><img src="${result.dataUrl}" style="max-width:100%;height:auto;display:block;margin:auto">`)}catch(err){setError(err.message)}};
  const reverse=async row=>{const reason=window.prompt("Αιτία ακύρωσης της συναλλαγής:");if(!reason?.trim())return;setBusy(true);setError("");setMessage("");try{await api(`/api/transactions/${row.id}/reverse`,{method:"POST",body:JSON.stringify({reason:reason.trim()})});setMessage("Η συναλλαγή ακυρώθηκε και καταγράφηκε ονομαστικά.");await load();onChanged?.()}catch(err){setError(err.message)}finally{setBusy(false)}};

  const summary=data?.summary||{},otherRows=(data?.recent||[]).filter(row=>!isLinkedPosRow(row));
  return <article className="cloud-panel ledger-module">
    <div className="cloud-panel-head ledger-heading"><div><h3><WalletCards/>Συναλλαγές Βάρδιας</h3><p><b>Συναλλαγές καταστήματος</b> · Οι πληρωμές και συναλλαγές μου εμφανίζονται σύμφωνα με τα κεντρικά δικαιώματα του χειριστή στο BackOffice.</p><p>Κάθε πώληση εμφανίζεται μία φορά, με προϊόντα, χειριστή και ανάλυση πληρωμής.</p></div><button onClick={load} disabled={loading||busy}><RefreshCw/>Ανανέωση</button></div>
    <div className="ledger-non-fiscal"><b>ΜΗ ΦΟΡΟΛΟΓΙΚΗ ΚΑΤΑΓΡΑΦΗ</b><span>Η απόδειξη συνεχίζει να εκδίδεται από το υπάρχον Kiosk Manager και την ταμειακή.</span></div>
    {error&&<div className="cloud-alert cloud-error">{error}</div>}{message&&<div className="cloud-alert cloud-success">{message}</div>}
    {loading?<div className="cloud-loading">Φόρτωση συναλλαγών…</div>:<>
      <div className="ledger-metrics"><article><span>Μετρητά</span><strong>{money(summary.cashSales)}</strong></article><article><span>Κάρτες</span><strong>{money(summary.cardSales)}</strong></article><article><span>Έξοδα</span><strong>{money(summary.expensesTotal)}</strong></article><article><span>Ποσοστά</span><strong>{money(summary.percentages)}</strong></article></div>
      {!data?.openSession?<div className="ledger-no-shift"><b>Δεν υπάρχει ανοιχτή βάρδια.</b><span>Άνοιξε πρώτα τη βάρδια στον Έλεγχο Ταμείου.</span></div>:<form className="ledger-form" onSubmit={save}>
        <div className="ledger-session"><span>Ενεργή βάρδια</span><b>{data.openSession.shiftLabel}</b><small>{when(data.openSession.openedAt)} · {data.openSession.openedByName||"Χρήστης"}</small></div>
        <div className="ledger-types">{types.map(item=>{const Icon=item.icon;return <button type="button" className={type===item.id?"active":""} onClick={()=>{setType(item.id);setAttachment(null);setAttachmentName("");setSubtractFromShift(false)}} key={item.id}><Icon/><span>{item.label}</span></button>})}</div>
        <label>Ποσό<input type="number" min="0.01" step="0.01" value={amount} onChange={e=>setAmount(e.target.value)} required/></label>
        {type==="SUPPLIER_PAYMENT"&&<label>Προμηθευτής{(data?.suppliers||[]).length?<select value={supplierId} onChange={e=>{setSupplierId(e.target.value);setSupplierName(data.suppliers.find(row=>row.id===e.target.value)?.name||"")}} required><option value="">Επιλογή</option>{data.suppliers.map(row=><option key={row.id} value={row.id}>{row.name}{row.taxId?` · ${row.taxId}`:""}</option>)}</select>:<input value={supplierName} onChange={e=>setSupplierName(e.target.value)} required/>}</label>}
        <label>Περιγραφή<input value={description} onChange={e=>setDescription(e.target.value)} placeholder="Προαιρετική αιτιολογία"/></label>
        {photoRequired(type)&&<label className="ledger-photo"><span><Camera/>Φωτογραφία παραστατικού *</span><input type="file" accept="image/jpeg,image/png,image/webp" capture="environment" onChange={choosePhoto} required/><small>{attachmentName||"Λήψη από κάμερα ή επιλογή αρχείου"}</small></label>}
        {photoRequired(type)&&<label className="ledger-shift-deduction"><input type="checkbox" checked={subtractFromShift} onChange={e=>setSubtractFromShift(e.target.checked)}/><span><b>Αφαίρεση από τη βάρδια</b><small>Επίλεξέ το μόνο αν το ποσό πληρώθηκε από τα μετρητά αυτής της βάρδιας.</small></span></label>}
        <button className="ledger-submit" disabled={busy||!amount||(photoRequired(type)&&!attachment)}>{busy?"Καταχώριση…":"Καταχώριση"}</button>
      </form>}

      <div className="ledger-list-head"><h4>Πωλήσεις POS</h4><span>Προϊόντα + τρόπος πληρωμής + χειριστής</span></div>
      <div className="ledger-sale-list">{sales.length===0?<div className="cloud-empty">Δεν υπάρχουν ακόμη πωλήσεις POS.</div>:sales.map(sale=>{
        const payments=sale.payments||[],mixed=payments.length>1,paymentText=sale.paymentSummary||payments.map(p=>`${methodLabel(p.method)} ${money(p.amount)}`).join(" + ");
        return <article className={`ledger-sale-card ${sale.reversalState?"reversed":""}`} key={sale.id}>
          <div className="ledger-sale-top"><div><b>{sale.source==="EXCHANGE"?"Αλλαγή είδους":mixed?"Μικτή πληρωμή":payments[0]?.method==="CARD"?"Πώληση με κάρτα":"Πώληση"}</b><small>{when(sale.occurredAt||sale.createdAt)} · {sale.actorName||"Πωλητής"}{sale.customerName?` · ${sale.customerName}`:" · Πελάτης λιανικής"}</small></div><strong>{money(sale.total)}</strong></div>
          <div className="ledger-sale-products">{(sale.lines||[]).map(line=><div key={line.id}><span><b>{Math.abs(Number(line.quantity||0))}×</b> {line.description||"Προϊόν"}</span><span>{money(line.lineTotal)}</span></div>)}</div>
          <div className="ledger-sale-payments"><b>{paymentText}</b></div>
        </article>;
      })}</div>

      <div className="ledger-list-head"><h4>Λοιπές κινήσεις βάρδιας</h4><span>Έξοδα, πληρωμές προμηθευτών, φύρα και λοιπές καταχωρίσεις</span></div>
      <div className="ledger-list">{otherRows.length===0?<div className="cloud-empty">Δεν υπάρχουν άλλες κινήσεις.</div>:otherRows.map(row=>{const info=typeInfo(row.type);const Icon=info.icon;const waste=/ΦΥΡΑ/i.test(String(row.description||""));return <div className={`ledger-row ${row.reversedAt?"reversed":""}`} key={row.id}><Icon/><div><b>{waste?"Φύρα / Κατανάλωση προσωπικού":info.label}</b><span>{row.supplierName||row.description||"Χωρίς περιγραφή"}</span><small>{when(row.occurredAt)} · {row.actorName}{photoRequired(row.type)?` · ${row.subtractFromShift?"Αφαιρείται από τη βάρδια":"Δεν αφαιρείται από τη βάρδια"}`:""}</small>{row.hasAttachment&&<button className="ledger-attachment" onClick={()=>viewPhoto(row)}><Eye/>Προβολή φωτογραφίας</button>}{data?.access?.canReverse&&!row.reversedAt&&<button className="ledger-attachment" onClick={()=>reverse(row)} disabled={busy}><RotateCcw/>Ακύρωση με αιτιολογία</button>}</div><strong>{money(row.amount)}</strong><em>{row.reversedAt?"ΑΚΥΡΩΜΕΝΗ":"ΕΝΕΡΓΗ"}</em></div>})}</div>
    </>}
  </article>;
}