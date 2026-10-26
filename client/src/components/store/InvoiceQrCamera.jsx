import {cameraConstraints} from "../../lib/camera-acquisition.js";
import DocumentCameraFocus from "./DocumentCameraFocus.jsx";
import React,{useEffect,useRef,useState} from "react";
import {createInvoiceQrReader} from "../../lib/invoice-qr-reader.js";
import {X} from "lucide-react";
import "./store-operator.css";

export default function InvoiceQrCamera({api,store,onRead,onClose}){
  const videoRef=useRef(null),callbacks=useRef({api,onRead,onClose});
  callbacks.current={api,onRead,onClose};
  const [track,setTrack]=useState(null);
  const [status,setStatus]=useState("Δείξε μόνο το QR του τιμολογίου μέσα στο πλαίσιο."),[error,setError]=useState("");
  useEffect(()=>{
    let alive=true,scanned=false,controls;const video=videoRef.current;
    const reader=createInvoiceQrReader();
    const scan=async result=>{
      if(!alive||scanned||!result)return;
      const value=String(result.getText()||"").trim();if(!value)return;
      scanned=true;setTrack(null);controls?.stop?.();video?.srcObject?.getTracks?.().forEach(track=>track.stop());
      setStatus("Το QR αναγνωρίστηκε. Λήψη πρωτότυπου PDF… Δεν γίνεται πληρωμή.");
      try{
        const data=await callbacks.current.api("/api/commerce/documents/qr-read",{method:"POST",timeoutMs:60000,body:JSON.stringify({storeId:store.id,url:value})});
        if(!alive)return;
        if(!/^data:application\/pdf;base64,/.test(data?.dataUrl||"")||!data?.header)throw new Error("Δεν παραλήφθηκε ασφαλές PDF τιμολογίου.");
        const bytes=Uint8Array.from(atob(data.dataUrl.split(",")[1]),char=>char.charCodeAt(0));
        callbacks.current.onRead({...data,file:new File([bytes],data.filename,{type:"application/pdf"})});
      }catch(cause){if(alive){setError(cause?.message||"Δεν διαβάστηκε το QR. Χρησιμοποίησε φωτογραφία ή PDF.");setStatus("Κλείσε τη σάρωση για φωτογράφιση ή νέα προσπάθεια.")}}
    };
    reader.decodeFromConstraints(cameraConstraints("qr"),video,scan).then(next=>{controls=next;if(!alive||scanned){controls.stop();return}setTrack(video?.srcObject?.getVideoTracks?.()[0]||null)}).catch(cause=>{if(alive)setError(cause?.name==="NotAllowedError"?"Δεν δόθηκε άδεια κάμερας. Επίτρεψε την κάμερα στον browser.":"Η κάμερα δεν είναι διαθέσιμη. Κλείσε τη σάρωση και δοκίμασε ξανά.")});
    return()=>{alive=false;controls?.stop?.();video?.srcObject?.getTracks?.().forEach(track=>track.stop())};
  },[store.id]);
  return <div className="operator-camera-overlay" role="dialog" aria-modal="true" aria-label="Σάρωση QR τιμολογίου"><section className="operator-camera-modal"><header><div><small>MYWORKSTATION · {store.name}</small><h2>Σάρωση QR τιμολογίου</h2></div><button type="button" onClick={onClose} aria-label="Κλείσιμο σάρωσης QR"><X/></button></header><div className="operator-camera-view"><video ref={videoRef} autoPlay muted playsInline/><div className="operator-camera-target" aria-hidden="true"/></div><DocumentCameraFocus track={track}/><p role="status">{status}</p><p>Τα στοιχεία και το ποσό χρειάζονται επιβεβαίωση. Το QR δεν αποτελεί αποδεικτικό εξόφλησης.</p>{error&&<div className="operator-login-error" role="alert">{error}</div>}<button type="button" className="secondary" onClick={onClose}>Επιστροφή στη φωτογράφιση / Κλείσιμο</button></section></div>;
}

