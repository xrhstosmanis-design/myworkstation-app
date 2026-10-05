import React,{useEffect,useRef,useState} from "react";
import {BrowserQRCodeReader} from "@zxing/browser";
import {BarcodeFormat,DecodeHintType} from "@zxing/library";
import {X} from "lucide-react";
import "./store-operator.css";

export default function WorkCardCamera({onScan,onClose}){
 const videoRef=useRef(null),callbacks=useRef({onScan,onClose});
 callbacks.current={onScan,onClose};
 const [error,setError]=useState("");
 useEffect(()=>{
  let alive=true,scanned=false,controls;const video=videoRef.current;
  const reader=new BrowserQRCodeReader(new Map([[DecodeHintType.POSSIBLE_FORMATS,[BarcodeFormat.QR_CODE]],[DecodeHintType.TRY_HARDER,true]]),{delayBetweenScanAttempts:60,delayBetweenScanSuccess:250});
  const start=async()=>{
   try{
    controls=await reader.decodeFromConstraints({video:{facingMode:"environment",width:{ideal:1280},height:{ideal:720}},audio:false},video,result=>{
     if(!alive||scanned||!result)return;
     const code=String(result.getText()||"").trim();if(!code)return;
     scanned=true;controls?.stop?.();callbacks.current.onScan(code);
    });
    if(!alive||scanned){controls.stop();return;}
    const track=video?.srcObject?.getVideoTracks?.()[0];
    if(track?.getCapabilities?.()?.focusMode?.includes("continuous"))track.applyConstraints({advanced:[{focusMode:"continuous"}]}).catch(()=>{});
   }catch(err){if(alive)setError(err?.name==="NotAllowedError"?"Δεν δόθηκε άδεια κάμερας. Επίτρεψε την κάμερα από τον browser και δοκίμασε ξανά.":"Η κάμερα δεν είναι διαθέσιμη. Κλείσε την κάμερα και δοκίμασε ξανά.");}
  };
  start();
  return()=>{alive=false;controls?.stop?.();video?.srcObject?.getTracks?.().forEach(track=>track.stop());};
 },[]);
 return <div className="operator-camera-overlay" role="dialog" aria-modal="true" aria-label="Σάρωση QR για κλείσιμο βάρδιας"><section className="operator-camera-modal"><header><div><small>MYWORKSTATION · ΚΛΕΙΣΙΜΟ ΒΑΡΔΙΑΣ</small><h2>Σάρωση QR χειριστή</h2></div><button type="button" onClick={onClose} aria-label="Κλείσιμο κάμερας"><X/></button></header><div className="operator-camera-view"><video ref={videoRef} autoPlay muted playsInline/><div className="operator-camera-target" aria-hidden="true"/></div><p>Δείξε το QR σου από το κινητό μέσα στο πλαίσιο. Μετά τη σάρωση πάτησε «Κλείσιμο και παράδοση».</p>{error&&<div className="operator-login-error" role="alert">{error}</div>}<button type="button" className="secondary" onClick={onClose}>Κλείσιμο κάμερας</button></section></div>;
}
