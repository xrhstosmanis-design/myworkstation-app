import React,{useState} from "react";
import {Store,X} from "lucide-react";
import "./store-consumption-menu.css";

const euro=value=>Number(value||0).toLocaleString("el-GR",{style:"currency",currency:"EUR"});
const labels={WASTE:"Η ΦΥΡΑ",SELF_CONSUMPTION:"Η ΙΔΙΑ ΚΑΤΑΝΑΛΩΣΗ",PRODUCT_DESTRUCTION:"Η ΚΑΤΑΣΤΡΟΦΗ ΠΡΟΪΟΝΤΩΝ"};

export default function StoreConsumptionMenu({api,store,cart,onClose,onDone,setError,setMessage}){
 const [busy,setBusy]=useState(false),[kind,setKind]=useState(null),[reason,setReason]=useState("");
 const rows=(cart||[]).filter(row=>!row.exchangeReturn);
 const total=rows.reduce((sum,row)=>sum+Number(row.salePrice||0)*Number(row.quantity||0),0);
 const submit=async selected=>{
  if(!rows.length)return setError?.("Χτύπησε πρώτα τουλάχιστον ένα προϊόν.");
  if(selected==="PRODUCT_DESTRUCTION"&&!reason.trim())return setError?.("Γράψε αιτιολογία για την καταστροφή προϊόντων.");
  setBusy(true);
  try{
   const result=await api(`/api/store-pos/stores/${store.id}/consumption`,{method:"POST",body:JSON.stringify({kind:selected,note:selected==="PRODUCT_DESTRUCTION"?reason.trim():null,items:rows.map(row=>({productId:row.id,quantity:row.quantity}))})});
   const suffix=result.countsTurnover?"μετρά στον τζίρο μετρητών":"δεν μετρά στον τζίρο";
   setMessage?.(`${labels[selected]} ${euro(result.total)} καταχωρίστηκε χωρίς απόδειξη, αφαιρέθηκε από stock και ${suffix}.`);
   onDone?.();onClose?.();
  }catch(error){setError?.(error.message)}finally{setBusy(false)}
 };
 return <div className="store-consumption-overlay" onMouseDown={e=>e.target===e.currentTarget&&onClose?.()}><section className="store-consumption-menu"><header><div><small>ΚΑΤΑΣΤΗΜΑ</small><h3>{store.name}</h3></div><button onClick={onClose}><X/></button></header><div className="store-consumption-summary"><Store/><div><b>{rows.length?`${rows.reduce((s,r)=>s+Number(r.quantity||0),0)} τεμ.`:"Δεν υπάρχουν προϊόντα"}</b><span>Αξία προϊόντων {euro(total)}</span></div></div><div className="store-consumption-actions"><button disabled={busy||!rows.length} onClick={()=>{setKind("WASTE");submit("WASTE")}}><b>ΦΥΡΑ</b><span>Μειώνει stock · χωρίς απόδειξη · μετρά στον τζίρο μετρητών</span></button><button disabled={busy||!rows.length} onClick={()=>{setKind("SELF_CONSUMPTION");submit("SELF_CONSUMPTION")}}><b>ΙΔΙΑ ΚΑΤΑΝΑΛΩΣΗ</b><span>Μειώνει stock · χωρίς απόδειξη · δεν μετρά στον τζίρο</span></button><button className={kind==="PRODUCT_DESTRUCTION"?"active":""} disabled={busy||!rows.length} onClick={()=>setKind("PRODUCT_DESTRUCTION")}><b>ΚΑΤΑΣΤΡΟΦΗ ΠΡΟΪΟΝΤΩΝ</b><span>Μειώνει stock · χωρίς απόδειξη · δεν μετρά στον τζίρο · καταγράφεται με αιτιολογία</span></button></div>{kind==="PRODUCT_DESTRUCTION"&&<div className="store-consumption-reason"><label>Αιτιολογία καταστροφής<input autoFocus value={reason} onChange={e=>setReason(e.target.value)} maxLength={500} placeholder="π.χ. ληγμένο, σπασμένο, αλλοιωμένο προϊόν"/></label><button type="button" disabled={busy||!reason.trim()} onClick={()=>submit("PRODUCT_DESTRUCTION")}>{busy?"Καταχώριση…":"Καταχώριση καταστροφής"}</button></div>}</section></div>;
}
