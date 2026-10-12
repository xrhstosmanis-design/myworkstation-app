import React,{useEffect,useState} from "react";
import {Download,Share2,X} from "lucide-react";
import {mobileChatUrl} from "./chat-mobile-install.mjs";
export default function ChatInstallControls({storeId}){
 const [prompt,setPrompt]=useState(null),[open,setOpen]=useState(false),[copied,setCopied]=useState(false);
 const standalone=()=>matchMedia("(display-mode: standalone)").matches||navigator.standalone===true;
 const [installed,setInstalled]=useState(standalone);
 useEffect(()=>{const before=e=>{e.preventDefault();setPrompt(e)},done=()=>{setInstalled(true);setPrompt(null)};window.addEventListener("beforeinstallprompt",before);window.addEventListener("appinstalled",done);return()=>{window.removeEventListener("beforeinstallprompt",before);window.removeEventListener("appinstalled",done)}},[]);
 const install=async()=>{if(!prompt){setOpen(true);return}await prompt.prompt();const result=await prompt.userChoice;if(result.outcome==="accepted")setInstalled(true);setPrompt(null)};
 const url=location.origin+mobileChatUrl(storeId);
 const share=async()=>{try{if(navigator.share)await navigator.share({title:"MyWorkStation Chat",url});else{await navigator.clipboard.writeText(url);setCopied(true)}}catch(error){if(error.name!=="AbortError")setOpen(true)}};
 return <><div className="chat-mobile-actions">{!installed&&<button type="button" onClick={install}><Download/>Εγκατάσταση στο κινητό</button>}<button type="button" onClick={share}><Share2/>{copied?"Ο σύνδεσμος αντιγράφηκε":"Σύνδεσμος εφαρμογής"}</button></div>{open&&<div className="chat-install-overlay" role="dialog" aria-modal="true" aria-label="Εγκατάσταση MyWorkStation Chat"><section><button className="chat-install-close" type="button" onClick={()=>setOpen(false)} aria-label="Κλείσιμο"><X/></button><h2>MyWorkStation Chat</h2><p>Εγκατάσταση στην αρχική οθόνη, μία εφαρμογή για όλα τα καταστήματά σου.</p><h3>Android · Chrome</h3><p>Μενού ⋮ → «Εγκατάσταση εφαρμογής» ή «Προσθήκη στην αρχική οθόνη».</p><h3>iPhone · Safari</h3><p>Κοινοποίηση → «Προσθήκη στην αρχική οθόνη». Άνοιξε μετά το εικονίδιο «MW Chat» και πάτησε «Ενεργοποίηση ειδοποιήσεων». Απαιτείται iOS 16.4 ή νεότερο.</p><p>Η εφαρμογή δεν χρειάζεται να μένει ανοιχτή για Push. Οι ειδοποιήσεις ακολουθούν τις άδειες και τις ρυθμίσεις του κινητού.</p><input aria-label="Σύνδεσμος αυτού του καταστήματος" readOnly value={url} onFocus={e=>e.target.select()}/><button type="button" onClick={()=>setOpen(false)}>Κατάλαβα</button></section></div>}</>;
}
