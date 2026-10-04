import React,{useEffect,useRef,useState} from "react";
const money=v=>Number(v).toLocaleString("el-GR",{style:"currency",currency:"EUR"});
const number=v=>Number(String(v).replace(",","."));
const control={padding:12,minHeight:48,border:"1px solid #ccd8e6",borderRadius:8,fontSize:16};
const button={...control,fontWeight:700,cursor:"pointer"};
export default function ExpenseDocumentModal({api,store,onClose,onApproved}){
 const [fields,setFields]=useState({issuer:"",documentNumber:"",documentDate:new Intl.DateTimeFormat("en-CA",{timeZone:"Europe/Athens",year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date()),description:"",totalNet:"",totalVat:"",totalGross:""});
 const [rows,setRows]=useState([]),[busy,setBusy]=useState(false),[error,setError]=useState(""),[review,setReview]=useState(null);
 const attempt=useRef(null);
 const load=async()=>setRows(await api(`/api/transactions/stores/${store.id}/expense-documents`));
 useEffect(()=>{load().catch(e=>setError(e.message))},[store.id]);
 const save=async e=>{
  e.preventDefault();if(busy)return;setError("");
  const payload={...fields,totalNet:number(fields.totalNet),totalVat:number(fields.totalVat),totalGross:number(fields.totalGross)};
  if(!fields.totalVat.trim()||[payload.totalNet,payload.totalVat,payload.totalGross].some(v=>!Number.isFinite(v))||payload.totalNet<=0||payload.totalVat<0||Math.round(payload.totalNet*100)+Math.round(payload.totalVat*100)!==Math.round(payload.totalGross*100)){setError("Συμπλήρωσε καθαρή αξία, ΦΠΑ (0 αν είναι μηδενικός) και σύνολο που συμφωνούν.");return}
  attempt.current??={...payload,idempotencyKey:`expense-document-${crypto.randomUUID()}`};setBusy(true);
  try{const doc=await api(`/api/transactions/stores/${store.id}/expense-documents`,{method:"POST",body:JSON.stringify(attempt.current)});setReview(doc);await load()}catch(e){setError(e.message)}finally{setBusy(false)}
 };
 const approve=async()=>{
  if(!review||busy)return;setBusy(true);setError("");
  try{const doc=await api(`/api/transactions/stores/${store.id}/expense-documents/${review.id}/approve`,{method:"POST",body:"{}"});await onApproved(doc);onClose()}catch(e){setError(e.message)}finally{setBusy(false)}
 };
 return <div style={{position:"fixed",inset:0,zIndex:5100,background:"rgba(10,24,43,.58)",display:"grid",placeItems:"center",padding:16}}><section role="dialog" aria-modal="true" aria-label="Παραστατικό υπηρεσίας / εξόδου" style={{width:"min(880px,96vw)",maxHeight:"92dvh",display:"flex",flexDirection:"column",background:"white",borderRadius:12,overflow:"hidden",boxShadow:"0 24px 80px #0004"}}>
  <header style={{padding:20,background:"#143b5d",color:"white",display:"flex",justifyContent:"space-between",gap:12}}><div><h2 style={{margin:0,fontSize:22}}>Παραστατικό υπηρεσίας / εξόδου</h2><p style={{margin:"6px 0 0",color:"#d7e5f2"}}>{store.name}</p></div><button disabled={busy} onClick={onClose} aria-label="Κλείσιμο παραστατικού εξόδου" style={{...button,color:"white",background:"transparent"}}>×</button></header>
  <div style={{padding:20,overflow:"auto",minHeight:0}}><p>Καταχώρισε τα ποσά από το παραστατικό. Η υπηρεσία δεν προσθέτει προϊόν ή απόθεμα. Η έγκριση δεν καταχωρίζει πληρωμή ούτε αποστέλλει στο myDATA.</p>
  {error&&<p role="alert" style={{padding:12,background:"#fff0f0",color:"#b42318"}}>{error}</p>}
  {review?<div><h3>Έλεγχος πριν την έγκριση</h3><p>{review.documentNumber} · {String(review.documentDate).slice(0,10)}</p><p>{review.description}</p><dl>{[["Καθαρή αξία",review.totalNet],["ΦΠΑ",review.totalVat],["Σύνολο",review.totalGross]].map(([label,value])=><div key={label} style={{display:"flex",justifyContent:"space-between",padding:10,borderBottom:"1px solid #e4ebf3"}}><dt>{label}</dt><dd style={{margin:0,fontWeight:700}}>{money(value)}</dd></div>)}</dl><p>Επιβεβαίωσε ότι τα στοιχεία συμφωνούν με το πρωτότυπο. Η έγκριση δεν πιστοποιεί φορολογική έκπτωση ΦΠΑ.</p></div>:<>
  <form id="expense-document-form" onSubmit={save} style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(min(280px,100%),1fr))",gap:16}}>{[["issuer","Εκδότης / προμηθευτής"],["documentNumber","Αριθμός παραστατικού"],["documentDate","Ημερομηνία έκδοσης"],["description","Υπηρεσία / περιγραφή"],["totalNet","Καθαρή αξία"],["totalVat","Ποσό ΦΠΑ"],["totalGross","Σύνολο παραστατικού"]].map(([name,label])=><label key={name} style={{display:"grid",gap:8,minWidth:0,fontWeight:700}}>{label}<input required disabled={busy} type={name==="documentDate"?"date":"text"} inputMode={name.startsWith("total")?"decimal":undefined} maxLength={name==="issuer"?100:name==="description"?140:name==="documentNumber"?80:undefined} value={fields[name]} onChange={e=>{setFields(f=>({...f,[name]:e.target.value}));attempt.current=null}} style={{...control,width:"100%",boxSizing:"border-box"}}/></label>)}</form>
  <h3>Υπάρχοντα παραστατικά εξόδων</h3>{!rows.length?<p>Δεν υπάρχουν ακόμη χειροκίνητα παραστατικά εξόδων.</p>:rows.map(row=><button key={row.id} disabled={busy} onClick={()=>setReview(row)} style={{...button,display:"block",width:"100%",marginBottom:8,textAlign:"left",background:"#f6f9fc"}}>{row.documentNumber} · {money(row.totalGross)} · {row.status==="APPROVED"?"Εγκεκριμένο":"Πρόχειρο"}<small style={{display:"block",marginTop:6}}>{row.description}</small></button>)}
  </>}</div>
  <footer style={{padding:16,display:"flex",justifyContent:"flex-end",gap:12,flexWrap:"wrap",background:"#f6f9fc",borderTop:"1px solid #e4ebf3"}}><button disabled={busy} onClick={review?()=>{setReview(null);setError("")}:onClose} style={{...button,background:"white"}}>{review?"Πίσω στη λίστα":"Άκυρο"}</button>{review?<button disabled={busy} onClick={approve} style={{...button,background:"#0f7b5b",color:"white"}}>{busy?"Αποθήκευση…":review.status==="APPROVED"?"Χρήση εγκεκριμένου παραστατικού":"Έγκριση παραστατικού εξόδου"}</button>:<button form="expense-document-form" type="submit" disabled={busy} style={{...button,background:"#0f7b5b",color:"white"}}>{busy?"Αποθήκευση…":"Αποθήκευση πρόχειρου"}</button>}</footer>
 </section></div>;
}
