import React,{useEffect,useState} from "react";
import {RefreshCw,WalletCards} from "lucide-react";
import "./cash-control.css";

const n=v=>Number(v||0);
const money=v=>n(v).toLocaleString("el-GR",{style:"currency",currency:"EUR"});

export default function CashBasicSummaryPanel({api,store}){
 const [data,setData]=useState(null),[loading,setLoading]=useState(true),[error,setError]=useState("");
 const load=async()=>{setLoading(true);setError("");try{setData(await api(`/api/cash/stores/${store.id}/overview`))}catch(e){setError(e.message)}finally{setLoading(false)}};
 useEffect(()=>{load()},[store.id]);
 const last=(data?.recent||[]).find(row=>row.status==="CLOSED");
 return <article className="cloud-panel cash-module"><div className="cloud-panel-head cash-heading"><div><h3><WalletCards/>Βάρδιες & Ταμεία</h3><p>Βασική προβολή ποσών. Ο αναλυτικός Έλεγχος Ταμείου απαιτεί ενεργό module.</p></div><button className="cash-refresh" onClick={load} disabled={loading}><RefreshCw/>Ανανέωση</button></div>{error&&<div className="cloud-alert cloud-error">{error}</div>}{loading?<div className="cloud-loading">Φόρτωση ποσών…</div>:<div className="cash-metrics"><article><span>Κατάσταση</span><strong className={data?.openSession?"cash-open":"cash-closed"}>{data?.openSession?"ΑΝΟΙΧΤΗ":"ΚΛΕΙΣΤΗ"}</strong></article><article><span>Λειτουργικό ποσό</span><strong>{money(data?.openSession?.openingOperational??data?.suggestedOpening?.operational)}</strong></article><article><span>Χρηματοκιβώτιο</span><strong>{money(data?.openSession?.openingSafe??data?.suggestedOpening?.safe)}</strong></article><article><span>Τελευταία μετρητά</span><strong>{last?money(last.cashSales):"—"}</strong></article><article><span>Τελευταίες κάρτες</span><strong>{last?money(last.cardSales):"—"}</strong></article><article><span>Τελευταίο EFTPOS</span><strong>{last?money(last.eftposTotal):"—"}</strong></article></div>}</article>;
}
