import React,{useEffect,useRef,useState} from "react";
import QRCode from "qrcode";
import "./native-chat-download.css";

export const nativeChatDownloadUrl=(origin,storeId)=>{
 const url=new URL("/downloads/chat-android/",origin);
 if(typeof storeId==="string"&&/^[A-Za-z0-9_-]{2,128}$/.test(storeId))url.searchParams.set("store",storeId);
 return url.href;
};
export default function NativeChatDownload({store=null}){
 const dialog=useRef(null),scope=useRef(""),[qr,setQr]=useState(""),[error,setError]=useState(""),[notice,setNotice]=useState("");
 const url=nativeChatDownloadUrl(window.location.origin,store?.id),scoped=new URL(url).searchParams.has("store");scope.current=url;
 useEffect(()=>{let active=true;dialog.current?.close();setQr("");setError("");setNotice("");QRCode.toDataURL(url,{width:280,margin:4,errorCorrectionLevel:"M"}).then(image=>{if(active)setQr(image)}).catch(()=>{if(active)setError("Άνοιξε τον σύνδεσμο παρακάτω.")});return()=>{active=false}},[url]);
 const copy=async()=>{const target=url;try{await navigator.clipboard.writeText(target);if(scope.current===target)setNotice("Ο σύνδεσμος αντιγράφηκε.")}catch{if(scope.current===target)setNotice("Επίλεξε και αντέγραψε τον σύνδεσμο από το πεδίο παρακάτω.")}};
 const share=async()=>{const target=url;if(!navigator.share)return copy();try{await navigator.share({title:"MyWorkStation Chat",text:"Εγκατάσταση και σύνδεση με το προσωπικό σου PIN",url:target});if(scope.current===target)setNotice("Η κοινοποίηση ολοκληρώθηκε.")}catch(e){if(scope.current===target&&e?.name!=="AbortError")setNotice("Δεν ολοκληρώθηκε η κοινοποίηση. Μπορείς να αντιγράψεις τον σύνδεσμο.")}};
 return <><button type="button" className="native-chat-download-button" onClick={()=>dialog.current?.showModal()}>{scoped?"Κοινοποίηση Chat / QR":"Android · Λήψη / QR"}</button><dialog className="native-chat-download-dialog" ref={dialog} aria-labelledby="native-chat-download-title" onClick={e=>{if(e.target===dialog.current)dialog.current.close()}}><section><button type="button" className="native-chat-download-close" aria-label="Κλείσιμο λήψης Android" onClick={()=>dialog.current.close()}>×</button><small>MYWORKSTATION CHAT</small><h2 id="native-chat-download-title">{scoped?"Chat καταστήματος":"Το Chat στο κινητό σου"}</h2>{scoped&&<strong>{store?.name||"Επιλεγμένο κατάστημα"}</strong>}<p>{scoped?"Στείλε τον σύνδεσμο ή σκάναρε το QR. Μετά την εγκατάσταση, επέστρεψε στη σελίδα και πάτησε «Άνοιγμα Chat».":"Σκάναρε το QR με την κάμερα του Android και κατέβασε την εφαρμογή."}</p>{qr?<img width="280" height="280" src={qr} alt="QR για τη λήψη της εφαρμογής MyWorkStation Chat Android"/>:<p role="status">{error||"Ετοιμάζεται το QR…"}</p>}<a href={url} target="_blank" rel="noopener noreferrer">Άνοιγμα σελίδας λήψης Android</a>{scoped&&<><input aria-label="Σύνδεσμος Chat καταστήματος" readOnly value={url}/><button type="button" onClick={copy}>Αντιγραφή συνδέσμου</button><button type="button" onClick={share}>Κοινοποίηση συνδέσμου</button></>}<p role="status">{notice}</p><p className="native-chat-download-note">Android 8 ή νεότερο. Ο σύνδεσμος δεν περιέχει PIN ή κωδικούς και δεν παρέχει δικαιώματα. Χρειάζεται προσωπική σύνδεση. Για άνοιγμα χωρίς αντιγραφή συνδέσμου απαιτείται η νέα έκδοση της εφαρμογής.</p><button type="button" onClick={()=>dialog.current.close()}>Κλείσιμο</button></section></dialog></>;
}
