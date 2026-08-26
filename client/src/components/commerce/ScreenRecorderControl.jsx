import React,{useEffect,useRef,useState} from "react";
import {CircleStop,Download,MonitorUp,Play,Video,X} from "lucide-react";
import "./screen-recorder.css";

const pad=value=>String(value).padStart(2,"0");
const durationLabel=seconds=>`${pad(Math.floor(seconds/60))}:${pad(seconds%60)}`;
const recordingName=()=>{
  const now=new Date(),stamp=[now.getFullYear(),pad(now.getMonth()+1),pad(now.getDate()),pad(now.getHours()),pad(now.getMinutes()),pad(now.getSeconds())].join("-");
  return `myworkstation-screen-${stamp}.webm`;
};
const supportedMimeType=()=>["video/webm;codecs=vp9","video/webm;codecs=vp8","video/webm"].find(type=>window.MediaRecorder?.isTypeSupported?.(type))||"";

export default function ScreenRecorderControl({contextLabel="MYWORKSTATION · POS"}){
  const recorderRef=useRef(null),streamRef=useRef(null),chunksRef=useRef([]),timerRef=useRef(null);
  const [recording,setRecording]=useState(false),[seconds,setSeconds]=useState(0),[preview,setPreview]=useState(null),[error,setError]=useState("");

  const stopTracks=()=>{streamRef.current?.getTracks().forEach(track=>track.stop());streamRef.current=null};
  const stop=()=>{if(recorderRef.current?.state&&recorderRef.current.state!=="inactive")recorderRef.current.stop();else stopTracks()};

  useEffect(()=>()=>{clearInterval(timerRef.current);stopTracks();if(preview?.url)URL.revokeObjectURL(preview.url)},[]);

  const start=async()=>{
    setError("");
    if(!navigator.mediaDevices?.getDisplayMedia||!window.MediaRecorder){setError("Η εγγραφή οθόνης δεν υποστηρίζεται από αυτόν τον browser.");return}
    try{
      const stream=await navigator.mediaDevices.getDisplayMedia({video:{frameRate:{ideal:30,max:30}},audio:false});
      const mimeType=supportedMimeType(),recorder=new MediaRecorder(stream,mimeType?{mimeType,videoBitsPerSecond:3500000}:undefined);
      chunksRef.current=[];streamRef.current=stream;recorderRef.current=recorder;
      recorder.ondataavailable=event=>{if(event.data?.size)chunksRef.current.push(event.data)};
      recorder.onerror=()=>setError("Παρουσιάστηκε πρόβλημα κατά την εγγραφή.");
      recorder.onstop=()=>{
        clearInterval(timerRef.current);stopTracks();setRecording(false);
        const blob=new Blob(chunksRef.current,{type:recorder.mimeType||"video/webm"});
        chunksRef.current=[];
        if(!blob.size){setError("Δεν δημιουργήθηκε αρχείο βίντεο.");return}
        const file={blob,url:URL.createObjectURL(blob),name:recordingName()};
        setPreview(old=>{if(old?.url)URL.revokeObjectURL(old.url);return file});
      };
      stream.getVideoTracks()[0]?.addEventListener("ended",stop,{once:true});
      recorder.start(1000);setSeconds(0);setRecording(true);
      clearInterval(timerRef.current);timerRef.current=setInterval(()=>setSeconds(value=>value+1),1000);
    }catch(err){
      stopTracks();
      if(err?.name!=="NotAllowedError")setError(err?.message||"Δεν ξεκίνησε η εγγραφή οθόνης.");
    }
  };

  const download=()=>{
    if(!preview)return;
    const link=document.createElement("a");link.href=preview.url;link.download=preview.name;document.body.appendChild(link);link.click();link.remove();
  };
  const closePreview=()=>setPreview(old=>{if(old?.url)URL.revokeObjectURL(old.url);return null});

  return <div className="mws-screen-recorder">
    {recording?<button type="button" className="recording" onClick={stop}><CircleStop/> Διακοπή <b>{durationLabel(seconds)}</b></button>:<button type="button" onClick={start}><Video/> Εγγραφή οθόνης</button>}
    {error&&<div className="recorder-error">{error}</div>}
    {preview&&<div className="recorder-preview" onMouseDown={event=>event.target===event.currentTarget&&closePreview()}><section>
      <header><div><small>{contextLabel}</small><h3>Η εγγραφή είναι έτοιμη</h3></div><button type="button" onClick={closePreview}><X/></button></header>
      <video src={preview.url} controls playsInline/>
      <div className="recorder-preview-actions"><button type="button" onClick={download}><Download/> Αποθήκευση στο PC</button><button type="button" className="publish" disabled title="Θα ενεργοποιηθεί μόλις συνδεθεί ο χώρος αποθήκευσης βίντεο του site"><MonitorUp/> Ανέβασμα στο site</button></div>
      <p><Play/> Έλεγξε πρώτα το βίντεο. Το ανέβασμα θα ενεργοποιηθεί με τον ασφαλή χώρο αποθήκευσης του myworkstation.gr.</p>
    </section></div>}
  </div>;
}
