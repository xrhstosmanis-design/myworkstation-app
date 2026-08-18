import React,{useEffect,useMemo,useState} from "react";
import {Banknote,Building2,FileSpreadsheet,FileText,Landmark,ReceiptText,RefreshCw,Truck,UsersRound,WalletCards,X} from "lucide-react";
import BankPaymentImportPanel from "../commerce/BankPaymentImportPanel.jsx";

const categories=[
  {id:"INVOICE",label:"Πληρωμή Τιμολογίου",type:"SUPPLIER_PAYMENT",icon:FileText,document:true},
  {id:"CHECKS",label:"Επιταγές",type:"SUPPLIER_PAYMENT",icon:ReceiptText},
  {id:"SUPPLIER",label:"Πληρωμή Προμηθευτή",type:"SUPPLIER_PAYMENT",icon:Truck},
  {id:"PAYROLL",label:"Μισθοδοσία",type:"OTHER_EXPENSE",icon:UsersRound},
  {id:"OTHER",label:"Λοιπά Έξοδα",type:"OTHER_EXPENSE",icon:WalletCards},
  {id:"UTILITIES",label:"Λογαριασμοί ΔΕΚΟ",type:"OTHER_EXPENSE",icon:Landmark},
  {id:"RENT",label:"Ενοίκια",type:"OTHER_EXPENSE",icon:Building2},
  {id:"TRANSFER",label:"Μεταφορά Ποσού",type:"TRANSFER_AMOUNT",icon:Banknote}
];
const ownerRoles=new Set(["OWNER","ADMIN","MANAGER"]);
const n=value=>Number(String(value||"0").replace(",","."))||0;
const money=value=>Number(value||0).toLocaleString("el-GR",{style:"currency",currency:"EUR"});
const storedUser=()=>{try{return JSON.parse(localStorage.getItem("user")||"null")}catch{return null}};
const safeKey=()=>`owner-${Date.now()}-${Math.random().toString(36).slice(2,10)}`;

export default function OwnerPaymentQuickActions({api,store,onChanged}){
  const [ledger,setLedger]=useState(null),[active,setActive]=useState(null),[busy,setBusy]=useState(false),[error,setError]=useState(""),[message,setMessage]=useState(""),[bankOpen,setBankOpen]=useState(false);
  const [form,setForm]=useState({amount:"",supplierId:"",purchaseDocumentId:"",description:"",paymentSource:"EXTERNAL"});
  const user=storedUser();
  const allowed=ownerRoles.has(user?.role);
  const suppliers=ledger?.suppliers||[];
  const documents=ledger?.purchaseDocuments||[];
  const selectedDocument=useMemo(()=>documents.find(row=>row.id===form.purchaseDocumentId)||null,[documents,form.purchaseDocumentId]);
  const requiresShift=active?.type==="TRANSFER_AMOUNT"||form.paymentSource==="CASH_SHIFT";

  const load=async()=>{if(!allowed)return;setError("");try{setLedger(await api(`/api/transactions/stores/${store.id}/overview`))}catch(e){setError(e.message)}};
  useEffect(()=>{load()},[store.id,allowed]);
  useEffect(()=>{if(selectedDocument?.supplierId)setForm(current=>({...current,supplierId:selectedDocument.supplierId}))},[selectedDocument?.id]);
  if(!allowed)return null;

  const open=category=>{setActive(category);setError("");setMessage("");setForm({amount:"",supplierId:"",purchaseDocumentId:"",description:category.label,paymentSource:"EXTERNAL"})};
  const close=()=>{if(!busy)setActive(null)};
  const submit=async event=>{
    event.preventDefault();
    const amount=n(form.amount);
    if(amount<=0)return setError("Βάλε ποσό μεγαλύτερο από 0.");
    if(active.type==="SUPPLIER_PAYMENT"&&!form.supplierId)return setError("Επίλεξε προμηθευτή.");
    if(active.document&&!form.purchaseDocumentId)return setError("Επίλεξε παραστατικό από την υπάρχουσα ροή παραστατικών / AI Reader.");
    if(requiresShift&&!ledger?.openSession)return setError("Δεν υπάρχει ενεργή βάρδια για αυτή την κίνηση.");
    setBusy(true);setError("");setMessage("");
    try{
      const body=active.type==="TRANSFER_AMOUNT"
        ?{type:"TRANSFER_AMOUNT",amount,description:form.description||active.label,subtractFromShift:false}
        :{
            type:active.type,
            amount,
            supplierId:active.type==="SUPPLIER_PAYMENT"?form.supplierId:null,
            description:form.description||active.label,
            evidenceMode:active.document?"DOCUMENT":"NO_DOCUMENT",
            purchaseDocumentId:active.document?form.purchaseDocumentId:null,
            paymentSource:form.paymentSource,
            idempotencyKey:safeKey()
          };
      await api(`/api/transactions/stores/${store.id}`,{method:"POST",body:JSON.stringify(body)});
      setMessage(`${active.label}: καταχωρίστηκε ${money(amount)} στο BackOffice.`);
      await load();onChanged?.();
      setTimeout(()=>setActive(null),650);
    }catch(e){setError(e.message)}finally{setBusy(false)}
  };

  const tileStyle={minHeight:88,textAlign:"left",border:"1px solid #dce5ef",background:"linear-gradient(180deg,#fff,#f8fbff)",borderRadius:15,padding:14,cursor:"pointer",display:"flex",alignItems:"center",gap:12};
  return <section style={{background:"#fff",border:"1px solid #dce5ef",borderRadius:18,padding:18,marginBottom:18,boxShadow:"0 8px 30px rgba(15,42,75,.05)"}}>
    <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",gap:16,marginBottom:14}}>
      <div><h3 style={{margin:0,fontSize:18}}>Πληρωμές Ιδιοκτήτη / Διαχειριστή</h3><p style={{margin:"5px 0 0",color:"#6b7b91",fontSize:13}}>Όλες οι κατηγορίες καταχωρίζονται στην υπάρχουσα ενιαία βάση και στο BackOffice.</p></div>
      <button type="button" onClick={load} style={{border:"1px solid #d9e3ef",background:"#f8fbff",borderRadius:10,padding:"9px 12px",display:"flex",gap:7,alignItems:"center",fontWeight:700}}><RefreshCw size={16}/>Ανανέωση</button>
    </div>
    {error&&!active&&<div style={{padding:10,borderRadius:10,background:"#fff0f0",color:"#b42318",marginBottom:12}}>{error}</div>}
    <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(205px,1fr))",gap:12}}>
      {categories.map(category=>{const Icon=category.icon;return <button key={category.id} type="button" onClick={()=>open(category)} style={tileStyle}><span style={{width:44,height:44,borderRadius:13,display:"grid",placeItems:"center",background:"#eaf2ff",color:"#1769e0"}}><Icon size={22}/></span><span><b style={{display:"block",fontSize:14,color:"#12233d"}}>{category.label}</b><small style={{color:"#718096"}}>{category.type==="TRANSFER_AMOUNT"?"Ξεχωριστή μεταφορά · όχι έξοδο βάρδιας":category.type==="SUPPLIER_PAYMENT"?"Προμηθευτές / παραστατικά":"Κατηγορία εξόδου"}</small></span></button>})}
      <button type="button" onClick={()=>setBankOpen(true)} style={{...tileStyle,border:"2px solid #0f766e",background:"linear-gradient(180deg,#f0fdfa,#ecfdf5)"}}><span style={{width:44,height:44,borderRadius:13,display:"grid",placeItems:"center",background:"#d1fae5",color:"#047857"}}><FileSpreadsheet size={22}/></span><span><b style={{display:"block",fontSize:14,color:"#064e3b"}}>Εισαγωγή αρχείου τράπεζας</b><small style={{color:"#47766d"}}>Excel / CSV · matching προμηθευτή / τιμολογίου</small></span></button>
    </div>
    {bankOpen&&<div onMouseDown={e=>e.target===e.currentTarget&&setBankOpen(false)} style={{position:"fixed",inset:0,zIndex:5900,background:"rgba(10,24,43,.52)",display:"grid",placeItems:"center",padding:20}}><div style={{width:"min(1500px,97vw)",maxHeight:"92vh",overflow:"auto",background:"#f8fafc",borderRadius:20,boxShadow:"0 28px 90px rgba(0,0,0,.28)"}}><header style={{position:"sticky",top:0,zIndex:2,padding:"16px 20px",display:"flex",justifyContent:"space-between",alignItems:"center",background:"#123b5d",color:"white"}}><div><b style={{fontSize:19}}>Εισαγωγή αρχείου τράπεζας</b><small style={{display:"block",opacity:.82,marginTop:3}}>{store.name} · προεπισκόπηση πριν από οποιαδήποτε πληρωμή</small></div><button type="button" onClick={()=>setBankOpen(false)} style={{border:0,background:"transparent",color:"white",cursor:"pointer"}}><X size={26}/></button></header><div style={{padding:18}}><BankPaymentImportPanel api={api} fixedStore={store}/></div></div></div>}
    {active&&<div onMouseDown={e=>e.target===e.currentTarget&&close()} style={{position:"fixed",inset:0,zIndex:5000,background:"rgba(10,24,43,.48)",display:"grid",placeItems:"center",padding:20}}><form onSubmit={submit} style={{width:"min(640px,96vw)",background:"white",borderRadius:20,boxShadow:"0 24px 80px rgba(0,0,0,.24)",overflow:"hidden"}}>
      <header style={{padding:"18px 20px",display:"flex",alignItems:"center",justifyContent:"space-between",borderBottom:"1px solid #e4ebf3"}}><div><small style={{color:"#6b7b91"}}>MYWORKSTATION · {store.name}</small><h2 style={{margin:"4px 0 0"}}>{active.label}</h2></div><button type="button" onClick={close} style={{border:0,background:"transparent",cursor:"pointer"}}><X/></button></header>
      <div style={{padding:20,display:"grid",gap:14}}>
        {requiresShift&&!ledger?.openSession&&<div style={{padding:11,borderRadius:11,background:"#fff7e6",color:"#8a5a00"}}>Δεν υπάρχει ενεργή βάρδια στο κατάστημα για αυτή την κίνηση. Οι εξωτερικές πληρωμές μπορούν να καταχωριστούν κανονικά χωρίς βάρδια.</div>}
        {active.type==="SUPPLIER_PAYMENT"&&<label style={{display:"grid",gap:6,fontWeight:700}}>Προμηθευτής<select value={form.supplierId} onChange={e=>setForm({...form,supplierId:e.target.value})} style={{padding:12,border:"1px solid #ccd8e6",borderRadius:10}}><option value="">Επίλεξε προμηθευτή</option>{suppliers.map(row=><option key={row.id} value={row.id}>{row.name}</option>)}</select></label>}
        {active.document&&<label style={{display:"grid",gap:6,fontWeight:700}}>Παραστατικό<select value={form.purchaseDocumentId} onChange={e=>setForm({...form,purchaseDocumentId:e.target.value})} style={{padding:12,border:"1px solid #ccd8e6",borderRadius:10}}><option value="">Επίλεξε παραστατικό</option>{documents.map(row=><option key={row.id} value={row.id}>{row.supplierName||"Προμηθευτής"} · {row.documentNumber||row.id.slice(0,8)} · {money(row.totalGross)}</option>)}</select></label>}
        <label style={{display:"grid",gap:6,fontWeight:700}}>Ποσό<input inputMode="decimal" value={form.amount} onChange={e=>setForm({...form,amount:e.target.value})} placeholder="0,00" style={{padding:12,border:"1px solid #ccd8e6",borderRadius:10,fontSize:18,fontWeight:800}}/></label>
        {active.type!=="TRANSFER_AMOUNT"&&<label style={{display:"grid",gap:6,fontWeight:700}}>Πηγή πληρωμής<select value={form.paymentSource} onChange={e=>setForm({...form,paymentSource:e.target.value})} style={{padding:12,border:"1px solid #ccd8e6",borderRadius:10}}><option value="EXTERNAL">Εξωτερική πληρωμή / τράπεζα</option><option value="CASH_SHIFT">Από μετρητά ενεργής βάρδιας</option></select></label>}
        <label style={{display:"grid",gap:6,fontWeight:700}}>Αιτιολογία / Σχόλιο<input value={form.description} onChange={e=>setForm({...form,description:e.target.value})} style={{padding:12,border:"1px solid #ccd8e6",borderRadius:10}}/></label>
        {error&&<div style={{padding:10,borderRadius:10,background:"#fff0f0",color:"#b42318"}}>{error}</div>}
        {message&&<div style={{padding:10,borderRadius:10,background:"#eaf8ef",color:"#08783e"}}>{message}</div>}
      </div>
      <footer style={{padding:"14px 20px",display:"flex",justifyContent:"flex-end",gap:10,borderTop:"1px solid #e4ebf3"}}><button type="button" onClick={close} style={{padding:"11px 16px",border:"1px solid #ccd8e6",background:"white",borderRadius:10,fontWeight:700}}>Άκυρο</button><button disabled={busy||(requiresShift&&!ledger?.openSession)} style={{padding:"11px 18px",border:0,background:"#1769e0",color:"white",borderRadius:10,fontWeight:800}}>{busy?"Καταχώριση…":"Καταχώριση"}</button></footer>
    </form></div>}
  </section>;
}
