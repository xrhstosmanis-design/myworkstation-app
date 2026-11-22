import React,{useEffect,useRef,useState} from 'react';

export default function FtextLateCashRecovery({base,terminalPos,requestId,request,onRecovered,rejection=false}){
 const [files,setFiles]=useState([]),[printed,setPrinted]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const title=rejection?'Αποδέσμευση απορριφθείσας πρώτης γραμμής':'Ανάκτηση εκδομένης απόδειξης μετρητών';
 const scope=base+'|'+terminalPos+'|'+requestId+'|'+rejection,scopeRef=useRef(scope);scopeRef.current=scope;
 useEffect(()=>()=>{scopeRef.current=null;},[]);
 const submit=async e=>{
  e.preventDefault();if(busy||!printed)return;const selected=scope;setBusy(true);setError('');
  try{
   const prefix='mws-cash-'+requestId,selectedFiles={};
   if(files.length!==3)throw Error('Επίλεξε τα τρία αρχικά αρχεία: intent.json, report.json και res.');
   for(const file of files){
    const suffix=file.name.startsWith(prefix)?file.name.slice(prefix.length):'',key=/^\.intent(?:\(\d+\))?\.json$/.test(suffix)?'intentBase64':/^\.report(?:\(\d+\))?\.json$/.test(suffix)?'reportBase64':/^(?:\(\d+\))?\.res$/.test(suffix)?'rawResultBase64':null;
    if(!key||selectedFiles[key]||!file.size||file.size>(key==='rawResultBase64'?65536:4096))throw Error('Τα αρχεία πρέπει να ανήκουν στην ίδια εμφανιζόμενη εντολή.');
    const bytes=new Uint8Array(await file.arrayBuffer());selectedFiles[key]=btoa(Array.from(bytes,b=>String.fromCharCode(b)).join(''));
   }
   if(scopeRef.current!==selected)return;
   const result=await request(`${base}/${encodeURIComponent(terminalPos)}/requests/${encodeURIComponent(requestId)}/${rejection?'rejected-cash-line':'late-cash-receipt'}`,{method:'POST',body:JSON.stringify({...selectedFiles,...(rejection?{noReceipt:true}:{}),reason:rejection?'Ο Super Admin επιβεβαίωσε ότι δεν εκδόθηκε απόδειξη και ανέβασε τα τρία αρχικά αρχεία για έλεγχο πρώτης γραμμής OVER LIMIT.':'Ο Super Admin επιβεβαίωσε την ήδη εκδομένη απόδειξη και ανέβασε τα τρία αρχικά αρχεία.'})});
   if(scopeRef.current===selected)onRecovered(result);
  }catch(e){if(scopeRef.current===selected)setError(e.message);}finally{if(scopeRef.current===selected)setBusy(false);}
 };
 return <form onSubmit={submit} style={{display:'grid',gap:12,marginTop:16}} aria-label={title}>
  <h4>{title}</h4>
  <p>Εντολή {requestId}. Επίλεξε τα αρχικά αρχεία intent.json, report.json και res από τον φάκελο FTEXT του συγκεκριμένου POS.</p>
  <input aria-label="Αρχικά αρχεία ανάκτησης FTEXT" type="file" multiple accept=".json,.res" disabled={busy} onChange={e=>setFiles(Array.from(e.target.files||[]))}/>
  <label><input type="checkbox" checked={printed} disabled={busy} onChange={e=>setPrinted(e.target.checked)}/> {rejection?'Επιβεβαίωσα ότι δεν εκδόθηκε απόδειξη. Επιτρέπεται μόνο επαληθευμένη απόρριψη της πρώτης και μοναδικής γραμμής με OVER LIMIT.':'Επιβεβαίωσα ότι η συγκεκριμένη απόδειξη έχει ήδη εκδοθεί.'}</label>
  <button disabled={busy||!printed||files.length!==3}>{busy?'Έλεγχος…':rejection?'Αποδέσμευση απορριφθείσας προσπάθειας':'Ολοκλήρωση υπάρχουσας πώλησης'}</button>
  {error&&<p role="alert">{error}</p>}
 </form>;
}
