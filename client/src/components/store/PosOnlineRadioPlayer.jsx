import React,{useEffect,useRef,useState} from "react";
import {createPortal} from "react-dom";
import {Pause,Play,Radio,Volume2 as TVolume2,X} from "lucide-react";

export default function PosOnlineRadioPlayer({api:sendRequest,store,onClose,persistentLauncher=false,companyId,readOnly=false}){
  const api=(path,options={})=>{if(readOnly&&String(options.method||"GET").toUpperCase()!=="GET")return Promise.reject(Error("Η πρόσβαση επιτρέπει μόνο προβολή."));return sendRequest(path,options)};
  const audio=useRef(null),[storedData,setData]=useState(null),[stationId,setStationId]=useState(""),[volume,setVolume]=useState(.7),[playing,setPlaying]=useState(false),[error,setError]=useState(""),[open,setOpen]=useState(!persistentLauncher);
  const sequence=useRef(0),currentScope=useRef(''),scope=JSON.stringify([companyId,store.id,readOnly]);currentScope.current=scope;
  const [loadedScope,setLoadedScope]=useState(''),[busy,setBusy]=useState(false);
  const data=loadedScope===scope?storedData:null;
  const load=async()=>{
    const current=++sequence.current,own=scope;setData(null);setLoadedScope('');setError('');setBusy(true);setPlaying(false);
    try{
      const value=await api(`/api/store-pos/stores/${encodeURIComponent(store.id)}/online-radio`);
      if(current!==sequence.current||own!==currentScope.current)return;
      if(readOnly&&(value?.companyId!==companyId||value.storeId!==store.id||!Array.isArray(value.stations)||value.stations.some(station=>typeof station.id!=='string'||typeof station.name!=='string'||station.streamUrl!==undefined)))throw Error('Δεν επιβεβαιώθηκε το κατάστημα του ραδιοφώνου.');
      setData(value);setLoadedScope(own);setStationId(value.state?.stationId||value.stations?.[0]?.id||'');setVolume(Number(value.state?.volume??.7));
    }catch(e){if(current===sequence.current&&own===currentScope.current)setError(e.message)}
    finally{if(current===sequence.current&&own===currentScope.current)setBusy(false)}
  };
  useEffect(()=>{load();return()=>{sequence.current++;audio.current?.pause()}},[store.id,companyId,readOnly,sendRequest]);
  const station=data?.stations?.find(row=>row.id===stationId);
  const persist=(nextStation=stationId,nextVolume=volume)=>readOnly?Promise.resolve():api(`/api/store-pos/stores/${store.id}/online-radio/state`,{method:"PUT",body:JSON.stringify({stationId:nextStation||null,volume:nextVolume})}).catch(()=>{});
  const toggle=async()=>{if(readOnly||!audio.current||!station)return;if(playing){audio.current.pause();setPlaying(false);return}setError("");try{await audio.current.play();setPlaying(true);persist()}catch{setError("Ο σταθμός δεν μπόρεσε να ξεκινήσει. Έλεγξε το stream του σταθμού.")}};
  const choose=id=>{if(readOnly)return;audio.current?.pause();setPlaying(false);setStationId(id);persist(id,volume)};
  const changeVolume=value=>{if(readOnly)return;const next=Number(value);setVolume(next);if(audio.current)audio.current.volume=next;persist(stationId,next)};
  const close=()=>{setOpen(false);onClose?.()};
  return <>{persistentLauncher&&data?.moduleActive&&data?.enabled&&<button type="button" className="store-chat-top-button" onClick={()=>setOpen(true)}>📻 Online Ράδιο{playing?" · Παίζει":""}</button>}{!readOnly&&station&&<audio data-pos-radio-background ref={audio} src={station.streamUrl} preload="none" volume={volume} onEnded={()=>setPlaying(false)} onError={()=>{setPlaying(false);setError("Το stream του σταθμού δεν είναι διαθέσιμο.")}}/>}{open&&createPortal(<div className="category-product-overlay pos-price-modal pos-online-radio-modal" onMouseDown={e=>e.target===e.currentTarget&&close()}><section style={{maxWidth:620}}><header><div><small>MYWORKSTATION POS</small><h2><Radio/> Online Ράδιο</h2><p>{readOnly?"Προβολή επιτρεπόμενων σταθμών και αποθηκευμένης κατάστασης.":"Η μουσική συνεχίζει στο background όσο χρησιμοποιείς το POS."}</p></div><button onClick={close}><X/></button></header><div className="pos-price-body">{readOnly&&<button type="button" disabled={busy} onClick={load}>Ανανέωση ραδιοφώνου</button>}{error&&<div className="store-pos-alert error" role="alert">{error}</div>}{data&&!data.moduleActive?<b>Το πληρωμένο module Online Ράδιο δεν είναι ενεργό για το κατάστημα.</b>:data&&!data.enabled?<b>Το Online Ράδιο είναι απενεργοποιημένο για το κατάστημα.</b>:<>{readOnly?<div><b>Επιτρεπόμενοι σταθμοί</b><ul aria-label="Επιτρεπόμενοι σταθμοί">{(data?.stations||[]).map(row=><li key={row.id} aria-current={row.id===data?.state?.stationId?"true":undefined}>{row.name}{row.id===data?.state?.stationId?" · Τρέχων αποθηκευμένος σταθμός":""}</li>)}</ul><p>{!data?.state?.stationId?"Δεν έχει αποθηκευτεί τρέχων σταθμός.":!(data?.stations||[]).some(row=>row.id===data.state.stationId)?"Ο αποθηκευμένος σταθμός δεν είναι πλέον διαθέσιμος.":""}</p></div>:<label>Επιτρεπόμενος σταθμός<select value={stationId} onChange={e=>choose(e.target.value)}>{(data?.stations||[]).map(row=><option key={row.id} value={row.id}>{row.name}</option>)}</select></label>}{!readOnly&&<button className="pos-primary-inline" disabled={!station} onClick={toggle}>{playing?<><Pause/> Pause</>:<><Play/> Play</>}</button>}<label><TVolume2/> Ένταση<input disabled={readOnly} type="range" min="0" max="1" step="0.05" value={volume} onChange={e=>changeVolume(e.target.value)}/></label>{data&&(data.stations||[]).length===0&&<small>Δεν έχουν οριστεί ακόμη επιτρεπόμενοι σταθμοί.</small>}</>}</div></section></div>,document.body)}</>;
}
