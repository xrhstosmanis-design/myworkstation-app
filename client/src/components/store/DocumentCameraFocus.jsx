import React,{useEffect,useRef,useState} from "react";
import {applyDocumentCameraFocus,documentCameraFocusOptions} from "../../lib/document-camera-focus.js";
import "./document-camera-focus.css";

export default function DocumentCameraFocus({track,videoRef}){
  const options=documentCameraFocusOptions(track),scope=useRef(null);
  const [busy,setBusy]=useState(false),[distance,setDistance]=useState(options.distance),[message,setMessage]=useState("");
  const [frame,setFrame]=useState(""),[torch,setTorch]=useState(false);
  let hasTorch=false;try{hasTorch=track?.getCapabilities?.()?.torch===true}catch{}
  useEffect(()=>{
    if(!videoRef)return;
    const update=()=>{const video=videoRef.current;setFrame(video?.readyState>=2&&video.videoWidth?`${video.videoWidth} × ${video.videoHeight} · Βάλε ολόκληρο το έγγραφο στο πλάνο, χωρίς σκιές ή αντανακλάσεις.`:"Περίμενε να εμφανιστεί η εικόνα πριν φωτογραφίσεις.")};
    update();const timer=setInterval(update,1200);return()=>clearInterval(timer);
  },[track,videoRef]);
  const toggleTorch=async()=>{const current=scope.current;if(!current?.alive||current.pending)return;current.pending=true;setBusy(true);try{await track.applyConstraints({advanced:[{torch:!torch}]});if(current.alive)setTorch(!torch)}catch{if(current.alive)setMessage("Η κάμερα δεν δέχτηκε τη ρύθμιση φωτισμού.")}finally{current.pending=false;if(current.alive)setBusy(false)}};
  useEffect(()=>{
    const current={alive:true,pending:false};scope.current=current;
    setDistance(documentCameraFocusOptions(track).distance);setMessage("");setBusy(false);setTorch(false);
    if(documentCameraFocusOptions(track).automatic){
      current.pending=true;setBusy(true);
      applyDocumentCameraFocus(track).then(ok=>{if(current.alive){setMessage(ok?"Ζητήθηκε αυτόματη εστίαση. Κράτησε το QR ή το παραστατικό σταθερό.":"Η κάμερα δεν δέχτηκε αυτόματη εστίαση. Δοκίμασε διαφορετική απόσταση.");setBusy(false);current.pending=false}});
    }
    return()=>{current.alive=false};
  },[track]);
  const focus=async value=>{
    const current=scope.current;if(!current?.alive||current.pending)return;
    current.pending=true;setBusy(true);if(value!==null)setDistance(value);
    const ok=await applyDocumentCameraFocus(track,value,{refocus:value===null});
    if(!current.alive)return;
    current.pending=false;setBusy(false);setMessage(ok?(value===null?"Ζητήθηκε νέα εστίαση. Κράτησε την εικόνα σταθερή.":"Ζητήθηκε νέα απόσταση εστίασης. Έλεγξε την ευκρίνεια στην εικόνα."):"Η κάμερα δεν δέχτηκε τη ρύθμιση. Δοκίμασε διαφορετική απόσταση.");
  };
  if(!track)return null;
  return <div className="document-camera-focus">
    {hasTorch&&<button type="button" disabled={busy} onClick={toggleTorch}>{torch?"Σβήσιμο φωτισμού":"Φωτισμός κάμερας"}</button>}
    {options.automatic&&<button type="button" disabled={busy} onClick={()=>focus(null)}>{busy?"Εστίαση…":"Επανεστίαση κάμερας"}</button>}
    {options.manual&&<label>Χειροκίνητη εστίαση<input aria-label="Απόσταση εστίασης κάμερας" type="range" min={options.manual.min} max={options.manual.max} step={options.manual.step} value={distance??options.distance} disabled={busy} onChange={e=>focus(Number(e.target.value))}/></label>}
    <p role="status">{!options.automatic&&!options.manual?"Η κάμερα δεν προσφέρει έλεγχο εστίασης στον browser. Μετακίνησε το παραστατικό λίγο πιο μακριά και κράτησέ το σταθερό, χωρίς αντανακλάσεις.":message}</p>
    {frame&&<p>{frame}</p>}
  </div>;
}

