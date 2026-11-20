import React,{useEffect,useMemo,useRef,useState} from "react";
import {AlertTriangle,CheckCircle2,RefreshCw,ShieldCheck,Upload} from "lucide-react";

const euro=value=>Number(value||0).toLocaleString("el-GR",{style:"currency",currency:"EUR"});
const number=value=>Number(String(value||"0").replace(",","."))||0;
const read=file=>new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=reject;reader.readAsDataURL(file)});
const user=()=>{try{return JSON.parse(localStorage.getItem("user")||"null")}catch{return null}};
const noteFor=status=>window.prompt(status==="CONFIRMED"?"Σημείωση επιβεβαίωσης":"Αιτιολογία απόκλισης");
const supplierMethod={CASH_SHIFT:"Μετρητά ενεργής βάρδιας",CORPORATE_CARD:"Εταιρική κάρτα",BANK_TRANSFER:"Τραπεζική μεταφορά",EMPLOYEE_REIMBURSEMENT:"Πληρωμή υπαλλήλου προς επιστροφή"};
export default function OwnerPendingApprovals({api:sendRequest,store,onChanged,refreshToken,companyId,readOnly=false}){
 const api=(path,options={})=>{if(readOnly&&String(options.method||'GET').toUpperCase()!=='GET')return Promise.reject(Error('Η πρόσβαση επιτρέπει μόνο προβολή.'));return sendRequest(path,options)};
 const [storedItems,setItems]=useState([]),[proofAmounts,setProofAmounts]=useState({}),[busy,setBusy]=useState(""),[error,setError]=useState("");
 const owner=readOnly||String(user()?.role||"").toUpperCase()==="OWNER";
 const sequence=useRef(0),currentScope=useRef(''),scope=JSON.stringify([companyId,store.id,readOnly]);currentScope.current=scope;
 const [loadedScope,setLoadedScope]=useState('');
 const items=loadedScope===scope?storedItems:[];
 const load=async()=>{if(!owner)return;const current=++sequence.current,own=scope;setItems([]);setLoadedScope("");setBusy("load");setError("");try{
   const [suppliers,expenses,bank]=await Promise.all([
     api(`/api/transactions/supplier-settlements/review?storeId=${encodeURIComponent(store.id)}`,{cache:"no-store"}),
     api(`/api/transactions/other-expenses/review?storeId=${encodeURIComponent(store.id)}`,{cache:"no-store"}),
     api("/api/transactions/bank-ledger/review"+(readOnly?"?storeId="+encodeURIComponent(store.id):""),{cache:"no-store"})
   ]);
   if(current!==sequence.current||own!==currentScope.current)return;
   if(readOnly)for(const value of [suppliers,expenses,bank])if(value?.companyId!==companyId||value.storeId!==store.id||!Array.isArray(value.items)||value.items.some(item=>item.companyId!==companyId||item.storeId!==store.id))throw Error('Δεν επιβεβαιώθηκε το κατάστημα των εκκρεμών επιβεβαιώσεων.');
   const supplierItems=(suppliers.items||[]).map(item=>({...item,kind:"SUPPLIER",label:`Προμηθευτής · ${item.supplierName||"—"} · ${supplierMethod[item.paymentMethod]||item.paymentMethod||"Άγνωστος τρόπος"}`}));
   const expenseItems=(expenses.items||[]).map(item=>({...item,kind:"EXPENSE",label:`Λοιπό έξοδο · ${item.description||"—"}`}));
   const linkedTransactions=new Set([...supplierItems,...expenseItems].map(item=>item.transactionId).filter(Boolean));
   setItems([...supplierItems,...expenseItems,...(bank.items||[]).filter(item=>item.storeId===store.id&&!linkedTransactions.has(item.sourceTransactionId)).map(item=>({...item,kind:"BANK",label:`Ταμείο Τράπεζας · ${item.type}`}))]);
   setLoadedScope(own);
 }catch(e){if(current===sequence.current&&own===currentScope.current)setError(e.message||"Δεν φορτώθηκαν οι εκκρεμείς επιβεβαιώσεις.")}finally{if(current===sequence.current&&own===currentScope.current)setBusy("")}};
 useEffect(()=>{load();return()=>{sequence.current++}},[store.id,companyId,readOnly,owner,refreshToken,sendRequest]);
 const totals=useMemo(()=>items.reduce((sum,item)=>sum+Number(item.amount||0),0),[items]);
 if(!owner)return null;
 const review=async(item,status)=>{if(readOnly)return;const note=noteFor(status);if(!note||note.trim().length<3)return;setBusy(item.kind+item.id);try{
   const path=item.kind==="SUPPLIER"?`/api/transactions/supplier-settlements/${item.id}/review`:item.kind==="EXPENSE"?`/api/transactions/other-expenses/${item.id}/review`:`/api/transactions/bank-ledger/${item.id}/review`;
   await api(path,{method:"POST",body:JSON.stringify({status,note:note.trim()})});
   setItems(rows=>status==="DISCREPANCY"?rows.map(row=>row.kind===item.kind&&row.id===item.id?{...row,status}:row):rows.filter(row=>!(row.kind===item.kind&&row.id===item.id)));onChanged?.();
 }catch(e){setError(e.message||"Δεν ενημερώθηκε η επιβεβαίωση.")}finally{setBusy("")}};
 const cancelSupplier=async item=>{if(readOnly)return;const reason=window.prompt("Αιτιολογία ακύρωσης της εκκρεμούς πληρωμής προμηθευτή");if(!reason||reason.trim().length<3)return;setBusy(item.kind+item.id);setError("");try{
   await api(`/api/transactions/supplier-settlements/${item.id}/cancel`,{method:"POST",body:JSON.stringify({reason:reason.trim()})});
   setItems(rows=>rows.filter(row=>!(row.kind===item.kind&&row.id===item.id)));onChanged?.();
 }catch(e){setError(e.message||"Δεν ακυρώθηκε η πληρωμή.")}finally{setBusy("")}};
 const uploadProof=async(item,file)=>{if(readOnly||!file)return;setBusy(`proof-${item.id}`);setError("");try{
   const result=await api(`/api/transactions/bank-ledger/${item.id}/attachment`,{method:"POST",body:JSON.stringify({attachment:{dataUrl:await read(file),filename:file.name},proofAmount:number(proofAmounts[item.id])||Number(item.amount)})});
   if(result.status==="CONFIRMED")setItems(rows=>rows.filter(row=>row.id!==item.id));
   else setItems(rows=>rows.map(row=>row.id===item.id?{...row,status:result.status,proofAmount:result.proofAmount,attachmentFilename:file.name}:row));
   onChanged?.();
 }catch(e){setError(e.message||"Δεν ανέβηκε το αποδεικτικό.")}finally{setBusy("")}};
 return <section style={{background:"#fff",border:"1px solid #dce5ef",borderRadius:18,padding:18,marginBottom:18,boxShadow:"0 8px 30px rgba(15,42,75,.05)"}}>
   <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",gap:12,marginBottom:12}}><div><h3 style={{margin:0,fontSize:18}}><ShieldCheck size={18} style={{verticalAlign:"-3px",marginRight:7}}/>Εκκρεμείς επιβεβαιώσεις ιδιοκτήτη</h3><small style={{color:"#63738b"}}>Μόνο για το {store.name} · σύνολο {euro(totals)}</small></div><button type="button" onClick={load} disabled={busy==="load"} style={{border:"1px solid #d9e3ef",background:"#f8fbff",borderRadius:10,padding:"9px 12px",fontWeight:800}}><RefreshCw size={16}/> Ανανέωση</button></div>
   {error&&<div role="alert" style={{padding:10,borderRadius:10,background:"#fff0f0",color:"#b42318",marginBottom:10}}>{error}</div>}
   {items.length?<div style={{display:"grid",gap:8}}>{items.map(item=><article key={item.kind+item.id} style={{display:"grid",gridTemplateColumns:"1fr auto",gap:12,alignItems:"center",padding:11,border:"1px solid #e1e8f0",borderRadius:12}}><div><b>{item.label}</b><small style={{display:"block",color:"#63738b",marginTop:3}}>{euro(item.amount)}{item.proofAmount!=null&&Math.abs(Number(item.proofAmount)-Number(item.amount))>.005?` · Απόκλιση ${euro(Number(item.proofAmount)-Number(item.amount))}`:""} · {new Date(item.paidAt||item.occurredAt||item.createdAt).toLocaleDateString("el-GR",{timeZone:"Europe/Athens"})} · {item.attachmentFilename||"Χωρίς συνημμένο"}{item.status==="DISCREPANCY"?" · Σε απόκλιση":""}</small></div>{!readOnly&&<div style={{display:"flex",gap:7,alignItems:"center",flexWrap:"wrap",justifyContent:"flex-end"}}>{item.kind==="BANK"&&!item.attachmentFilename&&["PENDING_PROOF","PENDING_REVIEW"].includes(item.status)&&<><input inputMode="decimal" value={proofAmounts[item.id]??item.amount} onChange={e=>setProofAmounts(values=>({...values,[item.id]:e.target.value}))} aria-label={`Ποσό αποδεικτικού ${item.id}`} style={{width:88,padding:"7px"}}/><label style={{border:"1px solid #087f5b",borderRadius:9,padding:"7px 10px",color:"#087f5b",fontWeight:800,cursor:"pointer"}}><Upload size={15}/> Αποδεικτικό<input type="file" accept="image/jpeg,image/png,image/webp,application/pdf" disabled={Boolean(busy)} style={{display:"none"}} onChange={e=>uploadProof(item,e.target.files?.[0])}/></label></>}<button type="button" disabled={Boolean(busy)} onClick={()=>review(item,"CONFIRMED")} style={{border:0,borderRadius:9,padding:"8px 10px",background:"#087f5b",color:"#fff",fontWeight:800}}><CheckCircle2 size={15}/> Επιβεβαίωση</button><button type="button" disabled={Boolean(busy)||item.status==="DISCREPANCY"} onClick={()=>review(item,"DISCREPANCY")} style={{border:"1px solid #e3b2ae",borderRadius:9,padding:"8px 10px",background:"#fff7f6",color:"#a62b24",fontWeight:800}}><AlertTriangle size={15}/> Απόκλιση</button>{item.kind==="SUPPLIER"&&<button type="button" disabled={Boolean(busy)} onClick={()=>cancelSupplier(item)} style={{border:"1px solid #ba453d",borderRadius:9,padding:"8px 10px",background:"#fff",color:"#9c2722",fontWeight:800}}>Ακύρωση εκκρεμούς πληρωμής</button>}</div>}</article>)}</div>:<div style={{padding:14,textAlign:"center",color:"#63738b",border:"1px dashed #cbd8e5",borderRadius:12}}>Δεν υπάρχουν εκκρεμείς επιβεβαιώσεις για αυτό το κατάστημα.</div>}
 </section>;
}
