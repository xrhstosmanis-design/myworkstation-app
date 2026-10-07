import React,{useEffect,useState} from "react";
import StoreChatPanel from "./StoreChatPanel.jsx";
import {loadNotificationChatStore} from "./store-chat-notification-loader.mjs";

async function chatApi(path,options={}){
  const token=localStorage.getItem("token")||sessionStorage.getItem("storeOperatorToken")||"";
  const response=await fetch(path,{...options,cache:"no-store",headers:{"Content-Type":"application/json",...(token?{Authorization:`Bearer ${token}`}:{}),...(options.headers||{})}});
  const data=await response.json();
  if(!response.ok)throw new Error(data.error||"Δεν είναι διαθέσιμη η συνομιλία με την τρέχουσα σύνδεση.");
  return data;
}

export default function StoreChatNotificationPage({storeId}){
  const [store,setStore]=useState(null),[error,setError]=useState(""),[closed,setClosed]=useState(false);
  useEffect(()=>{
    let active=true;
    setStore(null);setError("");setClosed(false);
    loadNotificationChatStore(chatApi,storeId).then(value=>{if(active)setStore(value)}).catch(reason=>{if(active)setError(reason.message)});
    return()=>{active=false};
  },[storeId]);
  useEffect(()=>{
    if(!("serviceWorker" in navigator))return;
    const reopen=event=>{if(event.data?.type==="STORE_CHAT_OPEN"&&event.data.storeId===storeId)setClosed(false)};
    navigator.serviceWorker.addEventListener("message",reopen);
    return()=>navigator.serviceWorker.removeEventListener("message",reopen);
  },[storeId]);
  if(store&&!closed)return <StoreChatPanel key={store.id} api={chatApi} store={store} onClose={()=>setClosed(true)}/>;
  return <main className="login-shell"><section className="login-card"><h1>MyWorkStation · Chat</h1>{error?<><p role="alert">{error}</p><p>Συνδεθείτε από τη συνηθισμένη είσοδό σας και ανοίξτε ξανά την ειδοποίηση. Δεν απαιτείται είσοδος στο POS για λογαριασμό διαχείρισης.</p></>:<p>{closed?"Η συνομιλία έκλεισε.":"Φόρτωση συνομιλίας…"}</p>}{closed&&<button type="button" onClick={()=>setClosed(false)}>Άνοιγμα Chat</button>}</section></main>;
}
