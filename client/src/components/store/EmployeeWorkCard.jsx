import React,{useEffect,useState} from "react";
import QRCode from "qrcode";

export default function EmployeeWorkCard({api,session,onLogout}){
  const [data,setData]=useState(null),[qr,setQr]=useState(""),[error,setError]=useState("");
  useEffect(()=>{let alive=true;api("/api/operators/me/work-card").then(async result=>{if(!alive)return;setData(result);setQr(await QRCode.toDataURL(result.cardCode,{errorCorrectionLevel:"M",margin:2,width:360}))}).catch(err=>{if(alive)setError(err.message)});return()=>{alive=false}},[api]);
  return <main style={{minHeight:"100vh",background:"#eef3f7",display:"grid",placeItems:"center",padding:20}}>
    <section style={{width:"min(440px,100%)",background:"#fff",borderRadius:22,padding:24,boxShadow:"0 18px 55px #173a5522",textAlign:"center"}}>
      <small style={{fontWeight:900,letterSpacing:1.2,color:"#087f5b"}}>MYWORKSTATION · Η ΚΑΡΤΑ ΜΟΥ</small>
      <h1 style={{margin:"10px 0 4px"}}>{session.user.fullName}</h1><p style={{marginTop:0,color:"#49677d"}}>{session.store.name}</p>
      {error?<div style={{padding:16,borderRadius:12,background:"#fff1f2",color:"#9f1239",fontWeight:700}}>{error}</div>:qr?<><img src={qr} alt="QR κάρτας εργασίας" style={{width:"min(78vw,320px)",height:"auto",display:"block",margin:"18px auto"}}/><p style={{fontWeight:800}}>Δείξε αυτό το QR στο POS για προσέλευση ή αποχώρηση.</p><small style={{color:"#64748b"}}>Κάρτα •••• {data?.cardCodeLast4||"—"}</small></>:<p>Φόρτωση κάρτας…</p>}
      <button type="button" onClick={onLogout} style={{display:"block",width:"100%",marginTop:22,padding:13,border:0,borderRadius:12,fontWeight:800,cursor:"pointer"}}>Αποσύνδεση</button>
    </section>
  </main>;
}
