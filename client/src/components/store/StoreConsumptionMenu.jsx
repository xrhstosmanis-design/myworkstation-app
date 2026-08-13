import React,{useState} from "react";
import {Store,X} from "lucide-react";
import "./store-consumption-menu.css";

const euro=value=>Number(value||0).toLocaleString("el-GR",{style:"currency",currency:"EUR"});

export default function StoreConsumptionMenu({api,store,cart,onClose,onDone,setError,setMessage}){
 const [busy,setBusy]=useState(false),[kind,setKind]=useState(null);
 const rows=(cart||[]).filter(row=>!row.exchangeReturn);
 const total=rows.reduce((sum,row)=>sum+Number(row.salePrice||0)*Number(row.quantity||0),0);
 const submit=async selected=>{if(!rows.length)return setError?.("Χτύπησε πρώτα τουλάχιστον ένα προϊόν.");setBusy(true);try{const result=await api(`/api/store-pos/stores/${store.id}/consumption`,{method:"POST",body:JSON.stringify({kind:selected,items:rows.map(row=>({productId:row.id,quantity:row.quantity}))})});setMessage?.(`${selected==="WASTE"?"Η ΦΥΡΑ":"Η ΙΔΙΑ ΚΑΤΑΝΑΛΩΣΗ"} ${euro(result.total)} καταχωρίστηκε χωρίς απόδειξη και αφαιρέθηκε από stock.`);onDone?.();onClose?.()}catch(error){setError?.(error.message)}finally{setBusy(false)}};
 return <div className="store-consumption-overlay" onMouseDown={e=>e.target===e.currentTarget&&onClose?.()}><section className="store-consumption-menu"><header><div><small>ΚΑΤΑΣΤΗΜΑ</small><h3>{store.name}</h3></div><button onClick={onClose}><X/></button></header><div className="store-consumption-summary"><Store/><div><b>{rows.length?`${rows.reduce((s,r)=>s+Number(r.quantity||0),0)} τεμ.`:"Δεν υπάρχουν προϊόντα"}</b><span>Αξία προϊόντων {euro(total)}</span></div></div><div className="store-consumption-actions"><button disabled={busy||!rows.length} onClick={()=>submit("WASTE")}><b>ΦΥΡΑ</b><span>Μειώνει stock · χωρίς απόδειξη · μετρά στον τζίρο μετρητών</span></button><button disabled={busy||!rows.length} onClick={()=>submit("SELF_CONSUMPTION")}><b>ΙΔΙΑ ΚΑΤΑΝΑΛΩΣΗ</b><span>Μειώνει stock · χωρίς απόδειξη · δεν μετρά στον τζίρο</span></button></div></section></div>;
}
