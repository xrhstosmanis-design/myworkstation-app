import React,{useEffect,useMemo,useState} from "react";
import {AlertTriangle,CheckCircle2,RefreshCw,ShieldCheck} from "lucide-react";

const euro=value=>Number(value||0).toLocaleString("el-GR",{style:"currency",currency:"EUR"});
const user=()=>{try{return JSON.parse(localStorage.getItem("user")||"null")}catch{return null}};
const noteFor=status=>window.prompt(status==="CONFIRMED"?"Σημείωση επιβεβαίωσης":"Αιτιολογία απόκλισης");
export default function OwnerPendingApprovals({api,store,onChanged}){
 const [items,setItems]=useState([]),[busy,setBusy]=useState(""),[error,setError]=useState("");
 const owner=String(user()?.role||"").toUpperCase()==="OWNER";
 const load=async()=>{if(!owner)return;setBusy("load");setError("");try{
   const [suppliers,expenses,bank]=await Promise.all([
     api(`/api/transactions/supplier-settlements/review?storeId=${encodeURIComponent(store.id)}`),
     api(`/api/transactions/other-expenses/review?storeId=${encodeURIComponent(store.id)}`),
     api("/api/transactions/bank-ledger/review")
   ]);
   const supplierItems=(suppliers.items||[]).map(item=>({...item,kind:"SUPPLIER",label:`Προμηθευτής · ${item.supplierName||"—"}`));
   const expenseItems=(expenses.items||[]).map(item=>({...item,kind:"EXPENSE",label:`Λοιπό έξοδο · ${item.description||"—"}`));
   const linkedTransactions=new Set([...supplierItems,...expenseItems].map(item=>item.transactionId).filter(Boolean));
   setItems([...supplierItems,...expenseItems,...(bank.items||[]).filter(item=>item.storeId===store.id&&!linkedTransactions.has(item.sourceTransactionId)).map(item=>({...item,kind:"BANK",label:`Ταμείο Τράπεζας · ${item.type}`}))]);
 }catch(e){setError(e.message||"Δεν φορτώθηκαν οι εκκρεμείς επιβεβαιώσεις.")}finally{setBusy("")}};
 useEffect(()=>{load()},[store.id,owner]);
 const totals=useMemo(()=>items.reduce((sum,item)=>sum+Number(item.amount||0),0),[items]);
 if(!owner)return null;
 const review=async(item,status)=>{const note=noteFor(status);if(!note||note.trim().length<3)return;setBusy(item.kind+item.id);try{
   const path=item.kind==="SUPPLIER"?`/api/transactions/supplier-settlements/${item.id}/review`:item.kind==="EXPENSE"?`/api/transactions/other-expenses/${item.id}/review`:`/api/transactions/bank-ledger/${item.id}/review`;
   await api(path,{method:"POST",body:JSON.stringify({status,note:note.trim()})});
   setItems(rows=>rows.filter(row=>!(row.kind===item.kind&&row.id===item.id)));onChanged?.();
 }catch(e){setError(e.message||"Δεν ενημερώθηκε η επιβεβαίωση.")}finally{setBusy("")}};
 return <section style={{background:"#fff",border:"1px solid #dce5ef",borderRadius:18,padding:18,marginBottom:18,boxShadow:"0 8px 30px rgba(15,42,75,.05)"}}>
   <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",gap:12,marginBottom:12}}><div><h3 style={{margin:0,fontSize:18}}><ShieldCheck size={18} style={{verticalAlign:"-3px",marginRight:7}}/>Εκκρεμείς επιβεβαιώσεις ιδιοκτήτη</h3><small style={{color:"#63738b"}}>Μόνο για το {store.name} · σύνολο {euro(totals)}</small></div><button type="button" onClick={load} disabled={busy==="load"} style={{border:"1px solid #d9e3ef",background:"#f8fbff",borderRadius:10,padding:"9px 12px",fontWeight:800}}><RefreshCw size={16}/> Ανανέωση</button></div>
   {error&&<div style={{padding:10,borderRadius:10,background:"#fff0f0",color:"#b42318",marginBottom:10}}>{error}</div>}
   {items.length?<div style={{display:"grid",gap:8}}>{items.map(item=><article key={item.kind+item.id} style={{display:"grid",gridTemplateColumns:"1fr auto",gap:12,alignItems:"center",padding:11,border:"1px solid #e1e8f0",borderRadius:12}}><div><b>{item.label}</b><small style={{display:"block",color:"#63738b",marginTop:3}}>{euro(item.amount)}{item.proofAmount!=null&&Math.abs(Number(item.proofAmount)-Number(item.amount))>.005?` · Απόκλιση ${euro(Number(item.proofAmount)-Number(item.amount))}`:""} · {new Date(item.paidAt||item.occurredAt||item.createdAt).toLocaleDateString("el-GR")} · {item.attachmentFilename||"Χωρίς συνημμένο"}</small></div><div style={{display:"flex",gap:7}}><button type="button" disabled={Boolean(busy)} onClick={()=>review(item,"CONFIRMED")} style={{border:0,borderRadius:9,padding:"8px 10px",background:"#087f5b",color:"#fff",fontWeight:800}}><CheckCircle2 size={15}/> Επιβεβαίωση</button><button type="button" disabled={Boolean(busy)} onClick={()=>review(item,"DISCREPANCY")} style={{border:"1px solid #e3b2ae",borderRadius:9,padding:"8px 10px",background:"#fff7f6",color:"#a62b24",fontWeight:800}}><AlertTriangle size={15}/> Απόκλιση</button></div></article>)}</div>:<div style={{padding:14,textAlign:"center",color:"#63738b",border:"1px dashed #cbd8e5",borderRadius:12}}>Δεν υπάρχουν εκκρεμείς επιβεβαιώσεις για αυτό το κατάστημα.</div>}
 </section>;
}
