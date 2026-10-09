import React,{useEffect,useRef,useState} from "react";
import "./video-package-download.css";

export default function VideoPackageDownload({downloadUrl}){
 const [busy,setBusy]=useState(false),[error,setError]=useState(""),[done,setDone]=useState(false);
 const current=useRef(null);
 useEffect(()=>{
  const scope={url:downloadUrl,controller:null};current.current=scope;
  setBusy(false);setError("");setDone(false);
  return()=>{scope.controller?.abort();if(current.current===scope)current.current=null};
 },[downloadUrl]);
 const download=async()=>{
  const scope=current.current;if(!scope||scope.controller||!downloadUrl)return;
  const controller=new AbortController();scope.controller=controller;
  setBusy(true);setError("");setDone(false);
  try{
   const token=localStorage.getItem("token"),response=await fetch(scope.url,{headers:token?{Authorization:`Bearer ${token}`}:{},signal:controller.signal});
   if(!response.ok){const data=await response.json().catch(()=>({}));throw new Error(data.error||`Η λήψη απέτυχε (${response.status}).`)}
   if(!response.headers.get("content-type")?.toLowerCase().startsWith("application/zip"))throw new Error("Δεν επιστράφηκε έγκυρο πακέτο ελέγχου.");
   const blob=await response.blob();
   if(current.current!==scope||controller.signal.aborted)return;
   const url=URL.createObjectURL(blob),link=document.createElement("a");
   try{link.href=url;link.download="MyWorkStation_Hikvision_Precheck.zip";document.body.appendChild(link);link.click();setDone(true)}
   finally{link.remove();setTimeout(()=>URL.revokeObjectURL(url),1000)}
  }catch(e){if(current.current===scope&&!controller.signal.aborted)setError(e.message||"Η λήψη απέτυχε.")}
  finally{scope.controller=null;if(current.current===scope)setBusy(false)}
 };
 return <section className="video-package-download" aria-label="Έλεγχος Hikvision">
  <div className="video-package-heading"><div><h3>Έλεγχος Hikvision</h3><small>Windows · έκδοση 1.0.0</small></div><button type="button" onClick={download} disabled={busy||!downloadUrl}>{busy?"Λήψη…":"Λήψη ελέγχου Hikvision"}</button></div>
  <p>Στο PC του καταστήματος, αποσυμπίεσε το ZIP και άνοιξε το <b>Start-Hikvision-Precheck.cmd</b>. Συμπλήρωσε την τοπική IP και τα στοιχεία χρήστη του καταγραφικού. Η αναφορά αποθηκεύεται στην επιφάνεια εργασίας.</p>
  <small>Διαγνωστικός έλεγχος. Δεν εγκαθιστά τον Video Connector.</small>
  {error&&<p role="alert" className="video-package-error">{error}</p>}
  {done&&<p role="status">Το ZIP στάλθηκε στον browser για αποθήκευση. Έλεγξε τις λήψεις σου.</p>}
 </section>;
}
