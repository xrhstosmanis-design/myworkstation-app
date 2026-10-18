import React,{useEffect,useRef,useState} from "react";
import QRCode from "qrcode";
import "./native-chat-download.css";

export const nativeChatDownloadUrl=origin=>new URL("/downloads/chat-android/",origin).href;

export default function NativeChatDownload(){
 const dialog=useRef(null),[qr,setQr]=useState(""),[error,setError]=useState("");
 const url=nativeChatDownloadUrl(window.location.origin);
 useEffect(()=>{let active=true;QRCode.toDataURL(url,{width:280,margin:4,errorCorrectionLevel:"M"}).then(image=>{if(active)setQr(image)}).catch(()=>{if(active)setError("Άνοιξε τον σύνδεσμο λήψης παρακάτω.")});return()=>{active=false}},[url]);
 return <><button type="button" className="native-chat-download-button" onClick={()=>dialog.current?.showModal()}>Android · Λήψη / QR</button><dialog className="native-chat-download-dialog" ref={dialog} aria-labelledby="native-chat-download-title" onClick={e=>{if(e.target===dialog.current)dialog.current.close()}}><section><button type="button" className="native-chat-download-close" aria-label="Κλείσιμο λήψης Android" onClick={()=>dialog.current.close()}>×</button><small>MYWORKSTATION CHAT</small><h2 id="native-chat-download-title">Το Chat στο κινητό σου</h2><p>Σκάναρε το QR με την κάμερα του Android και κατέβασε την εφαρμογή.</p>{qr?<img width="280" height="280" src={qr} alt="QR για τη λήψη της εφαρμογής MyWorkStation Chat Android"/>:<p role="status">{error||"Ετοιμάζεται το QR…"}</p>}<a href={url} target="_blank" rel="noopener noreferrer">Άνοιγμα σελίδας λήψης Android</a><p className="native-chat-download-note">Δοκιμαστική έκδοση · Android 8 ή νεότερο. Μετά την εγκατάσταση χρειάζεσαι τον προσωπικό σου λογαριασμό ή τον σύνδεσμο καταστήματος και το PIN σου. Το QR δεν περιέχει κωδικούς.</p><button type="button" onClick={()=>dialog.current.close()}>Κλείσιμο</button></section></dialog></>;
}
