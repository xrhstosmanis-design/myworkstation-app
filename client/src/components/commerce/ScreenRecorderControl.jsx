import {greeceDateTimeInput} from "../../../../shared/greece-time.mjs";
import React,{useEffect,useRef,useState} from "react";
import {CircleStop,Download,MonitorUp,Play,Video,X} from "lucide-react";
import "./screen-recorder.css";

const pad=value=>String(value).padStart(2,"0");
const durationLabel=seconds=>`${pad(Math.floor(seconds/60))}:${pad(seconds%60)}`;
const recordingName=()=>{
  const stamp=greeceDateTimeInput(new Date(),true).replace(/[:T]/g,"-");
  return `myworkstation-screen-${stamp}.mp4`;
};
const supportedMimeType=()=>["video/mp4;codecs=avc1.42001E","video/mp4;codecs=avc1","video/mp4"].find(type=>window.MediaRecorder?.isTypeSupported?.(type))||"";

export default function ScreenRecorderControl({contextLabel="MYWORKSTATION · POS",startLabel="Εγγραφή οθόνης"}){
  const recorderRef=useRef(null),streamRef=useRef(null),chunksRef=useRef([]),timerRef=useRef(null),previewRef=useRef(null),mountedRef=useRef(false),startingRef=useRef(false);
  const [recording,setRecording]=useState(false),[seconds,setSeconds]=useState(0),[preview,setPreview]=useState(null),[error,setError]=useState("");

  const stopTracks=()=>{streamRef.current?.getTracks().forEach(track=>track.stop());streamRef.current=null};
  const stop=()=>{if(recorderRef.current?.state&&recorderRef.current.state!=="inactive")recorderRef.current.stop();else stopTracks()};

  useEffect(()=>{
    mountedRef.current=true;
    return ()=>{mountedRef.current=false;clearInterval(timerRef.current);const recorder=recorderRef.current;if(recorder){recorder.onstop=null;recorder.ondataavailable=null;recorder.onerror=null;if(recorder.state!=="inactive")recorder.stop()}stopTracks();chunksRef.current=[];if(previewRef.current?.url)URL.revokeObjectURL(previewRef.current.url)};
  },[]);

  const start=async()=>{
    if(startingRef.current||recorderRef.current?.state==="recording")return;
    setError("");
    if(!navigator.mediaDevices?.getDisplayMedia||!window.MediaRecorder){setError("Η εγγραφή οθόνης δεν υποστηρίζεται από αυτόν τον browser.");return}
    const mimeType=supportedMimeType();
    if(!mimeType){setError("Ο browser δεν υποστηρίζει εγγραφή MP4. Άνοιξε το MyWorkstation σε ενημερωμένο Chrome ή Edge.");return}
    startingRef.current=true;
    try{
      const stream=await navigator.mediaDevices.getDisplayMedia({video:{frameRate:{ideal:30,max:30}},audio:false});
      if(!mountedRef.current){stream.getTracks().forEach(track=>track.stop());return}
      streamRef.current=stream;
      const recorder=new MediaRecorder(stream,{mimeType,videoBitsPerSecond:3500000});
      chunksRef.current=[];streamRef.current=stream;recorderRef.current=recorder;
      recorder.ondataavailable=event=>{if(event.data?.size)chunksRef.current.push(event.data)};
      recorder.onerror=()=>setError("Παρουσιάστηκε πρόβλημα κατά την εγγραφή.");
      recorder.onstop=()=>{
        clearInterval(timerRef.current);stopTracks();setRecording(false);
        const actualType=recorder.mimeType||mimeType;
        if(actualType.split(";")[0].trim().toLowerCase()!=="video/mp4"){chunksRef.current=[];setError("Δεν δημιουργήθηκε βίντεο MP4. Δοκίμασε ενημερωμένο Chrome ή Edge.");return}
        const blob=new Blob(chunksRef.current,{type:actualType});
        chunksRef.current=[];
        if(!blob.size){setError("Δεν δημιουργήθηκε αρχείο βίντεο.");return}
        const file={blob,url:URL.createObjectURL(blob),name:recordingName()};
        if(previewRef.current?.url)URL.revokeObjectURL(previewRef.current.url);
        previewRef.current=file;setPreview(file);
      };
      stream.getVideoTracks()[0]?.addEventListener("ended",stop,{once:true});
      recorder.start(1000);setSeconds(0);setRecording(true);
      clearInterval(timerRef.current);timerRef.current=setInterval(()=>setSeconds(value=>value+1),1000);
    }catch(err){
      clearInterval(timerRef.current);stopTracks();recorderRef.current=null;chunksRef.current=[];setRecording(false);
      if(err?.name!=="NotAllowedError")setError(err?.message||"Δεν ξεκίνησε η εγγραφή οθόνης.");
    }finally{startingRef.current=false}
  };

  const download=()=>{
    if(!preview)return;
    const link=document.createElement("a");link.href=preview.url;link.download=preview.name;document.body.appendChild(link);link.click();link.remove();
  };
  const closePreview=()=>{if(previewRef.current?.url)URL.revokeObjectURL(previewRef.current.url);previewRef.current=null;setPreview(null)};

  return <div className="mws-screen-recorder">
    {recording?<button type="button" className="recording" onClick={stop}><CircleStop/> Διακοπή <b>{durationLabel(seconds)}</b></button>:<button type="button" onClick={start}><Video/> {startLabel}</button>}
    {error&&<div className="recorder-error">{error}</div>}
    {preview&&<div className="recorder-preview" onMouseDown={event=>event.target===event.currentTarget&&closePreview()}><section>
      <header><div><small>{contextLabel}</small><h3>Η εγγραφή είναι έτοιμη</h3></div><button type="button" onClick={closePreview}><X/></button></header>
      <video src={preview.url} controls playsInline/>
      <div className="recorder-preview-actions"><button type="button" onClick={download}><Download/> Αποθήκευση MP4 στο PC</button><button type="button" className="publish" disabled title="Θα ενεργοποιηθεί μόλις συνδεθεί ο χώρος αποθήκευσης βίντεο του site"><MonitorUp/> Ανέβασμα στο site</button></div>
      <p><Play/> Έλεγξε πρώτα το βίντεο. Το ανέβασμα θα ενεργοποιηθεί με τον ασφαλή χώρο αποθήκευσης του myworkstation.gr.</p>
    </section></div>}
  </div>;
}
