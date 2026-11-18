import React,{useEffect,useRef,useState} from 'react';
import ProductionPrinterSettings from './ProductionPrinterSettings.jsx';
export default function ProductionPrinterStatusPanel({api,companyId,store,onClose}){
 const [result,setResult]=useState(null),[loadedScope,setLoadedScope]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const sequence=useRef(0),currentScope=useRef(''),scope=JSON.stringify([companyId,store.id]);currentScope.current=scope;
 const data=loadedScope===scope?result:null;
 const load=async()=>{
  const current=++sequence.current,own=scope;setResult(null);setLoadedScope('');setError('');setBusy(true);
  try{
   const value=await api(`/api/production-printers/stores/${encodeURIComponent(store.id)}`);
   if(current!==sequence.current||own!==currentScope.current)return;
   if(value?.companyId!==companyId||value.storeId!==store.id||!Array.isArray(value.jobs))throw Error('Δεν επιβεβαιώθηκε το κατάστημα των εκτυπώσεων.');
   setResult(value);setLoadedScope(own);
  }catch(e){if(current===sequence.current&&own===currentScope.current)setError(e.message)}
  finally{if(current===sequence.current&&own===currentScope.current)setBusy(false)}
 };
 useEffect(()=>{load();return()=>{sequence.current++}},[api,companyId,store.id]);
 return <section className="commerce-box"><h2>Εκτυπώσεις · {store.name}</h2>{error&&<p role="alert">{error}</p>}{busy&&<p role="status">Φόρτωση εκτυπώσεων…</p>}{data?<ProductionPrinterSettings api={api} store={store} state={data} cart={[]} readOnly onRefresh={load} onClose={onClose}/>:<button type="button" disabled={busy} onClick={load}>Ανανέωση εκτυπώσεων</button>}</section>;
}
