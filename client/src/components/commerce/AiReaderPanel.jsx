import React,{useEffect,useState} from "react";
import {FileSearch,RefreshCw,Upload} from "lucide-react";
import "./ai-reader.css";

const readFile=file=>new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=()=>reject(new Error("Δεν ήταν δυνατή η ανάγνωση του αρχείου."));reader.readAsDataURL(file)});

function collectLines(data){
  const found=[];
  const visit=node=>{if(!node)return;if(Array.isArray(node)){node.forEach(visit);return}if(node.text&&node.words&&node.text.trim())found.push({text:node.text.trim(),confidence:Math.max(0,Math.min(100,Math.round(Number(node.confidence)||0)))});for(const key of ["blocks","paragraphs","lines"])visit(node[key])};
  visit(data.blocks);
  if(found.length)return found;
  return String(data.text||"").split(/\r?\n/).map(text=>text.trim()).filter(Boolean).map(text=>({text,confidence:Math.round(Number(data.confidence)||0)}));
}

async function imageForOcr(file){
  if(file.type!=="application/pdf")return file;
  const pdfjs=await import("pdfjs-dist/legacy/build/pdf.mjs");
  pdfjs.GlobalWorkerOptions.workerSrc=new URL("pdfjs-dist/legacy/build/pdf.worker.min.mjs",import.meta.url).toString();
  const pdf=await pdfjs.getDocument({data:await file.arrayBuffer()}).promise;
  const page=await pdf.getPage(1);const viewport=page.getViewport({scale:2});
  const canvas=document.createElement("canvas");canvas.width=viewport.width;canvas.height=viewport.height;
  await page.render({canvasContext:canvas.getContext("2d"),viewport}).promise;
  return canvas.toDataURL("image/png",.92);
}

export default function AiReaderPanel({api,storeId,status,onStatus}){
  const [file,setFile]=useState(null),[jobs,setJobs]=useState([]),[working,setWorking]=useState(false),[progress,setProgress]=useState(0),[error,setError]=useState("");
  const load=async()=>{if(!storeId)return;setJobs(await api(`/api/commerce/ai-reader/jobs?storeId=${encodeURIComponent(storeId)}`))};
  useEffect(()=>{load().catch(e=>setError(e.message))},[storeId]);
  const run=async()=>{
    if(!file||!storeId)return;setWorking(true);setError("");setProgress(1);
    try{
      const {createWorker}=await import("tesseract.js");
      const worker=await createWorker("ell+eng",1,{logger:m=>{if(m.status==="recognizing text")setProgress(Math.max(1,Math.round((m.progress||0)*100)))}});
      let result;try{result=await worker.recognize(await imageForOcr(file))}finally{await worker.terminate()}
      const lines=collectLines(result.data);const confidence=Math.round(Number(result.data.confidence)||0);
      await api("/api/commerce/ai-reader/jobs",{method:"POST",body:JSON.stringify({storeId,filename:file.name,mimeType:file.type,dataUrl:await readFile(file),localConfidence:confidence,result:{rawText:result.data.text||"",lines,pageCount:file.type==="application/pdf"?1:null,pdfNote:file.type==="application/pdf"?"Αναγνώστηκε η πρώτη σελίδα του PDF.":null}})});
      setFile(null);setProgress(100);await Promise.all([load(),onStatus?.()]);
    }catch(e){setError(e.message||"Η τοπική αναγνώριση απέτυχε.")}finally{setWorking(false)}
  };
  const recheck=async id=>{try{await api(`/api/commerce/ai-reader/jobs/${id}/ai-recheck`,{method:"POST",body:"{}"})}catch(e){setError(e.message)}};
  return <section className="ai-reader-layout"><div className="commerce-box"><h3>1ο στάδιο — Τοπική ανάγνωση χωρίς AI</h3><p>Φωτογράφισε ή επίλεξε εικόνα/PDF. Διατηρούνται όλες οι γραμμές, ακόμη και όσες έχουν χαμηλή βεβαιότητα.</p><label className="ai-reader-upload"><Upload/><span>{file?.name||"Επιλογή παραστατικού"}</span><input type="file" accept="image/jpeg,image/png,image/webp,application/pdf" capture="environment" onChange={e=>setFile(e.target.files?.[0]||null)}/></label><button className="commerce-primary" disabled={!file||working||!storeId} onClick={run}><FileSearch/>{working?`Ανάγνωση ${progress}%`:"Έναρξη τοπικού OCR"}</button>{error&&<div className="commerce-error">{error}</div>}<div className="commerce-notice"><b>Κανόνας ασφαλείας:</b> Καμία αυτόματη κλήση AI. Πάνω από {status.localConfidenceThreshold}% το αποτέλεσμα παραμένει τοπικό. Κάτω από το όριο, ο χρήστης αποφασίζει αν θα ζητήσει επανέλεγχο.</div></div><div className="commerce-box"><div className="ai-reader-title"><h3>Πρόχειρες αναγνώσεις</h3><button onClick={()=>load().catch(e=>setError(e.message))}><RefreshCw/>Ανανέωση</button></div>{!jobs.length&&<p>Δεν υπάρχει ακόμη πρόχειρη ανάγνωση.</p>}<div className="ai-reader-jobs">{jobs.map(job=><article key={job.id}><header><b>{job.filename}</b><span className={Number(job.localConfidence)>=65?"good":"low"}>{Math.round(Number(job.localConfidence)||0)}% confidence</span></header>{job.result?.pdfNote&&<small>{job.result.pdfNote}</small>}<div className="ai-reader-lines">{(job.result?.lines||[]).map((line,index)=><div key={index}><span>{line.text||"Μη αναγνωρίσιμο"}</span><em className={Number(line.confidence)>=65?"good":"low"}>{Math.round(Number(line.confidence)||0)}%</em></div>)}</div><button className="ai-recheck" onClick={()=>recheck(job.id)}>Επανέλεγχος με AI (χειροκίνητα)</button></article>)}</div></div></section>
}
