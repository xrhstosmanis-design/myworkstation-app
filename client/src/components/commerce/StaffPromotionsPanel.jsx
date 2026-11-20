import React,{useEffect,useRef,useState} from 'react';
import NativePromotionList from './NativePromotionList.jsx';
import NativePromotionAnalysis from './NativePromotionAnalysis.jsx';
import './owner-products.css';
import './staff-promotions.css';
export default function StaffPromotionsPanel({api,companyId,store}){
 const [result,setResult]=useState(null),[loadedScope,setLoadedScope]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const sequence=useRef(0),currentScope=useRef(''),scope=JSON.stringify([companyId,store.id]);currentScope.current=scope;
 const visible=loadedScope===scope?result:null;
 const load=async()=>{
  const current=++sequence.current,own=scope;setResult(null);setLoadedScope('');setError('');setBusy(true);
  try{
   const query=new URLSearchParams({storeId:store.id});
   const [list,analysis]=await Promise.all([api(`/api/price-catalog/promotions/scoped?${query}`),api(`/api/price-catalog/promotions/analysis?${query}`)]);
   if(current!==sequence.current||own!==currentScope.current)return;
   for(const value of [list,analysis])if(value?.companyId!==companyId||value.storeId!==store.id||!Array.isArray(value.items))throw Error('Δεν επιβεβαιώθηκε το κατάστημα των προσφορών.');
   if(list.items.some(row=>!Array.isArray(row.stores)||row.stores.some(s=>s.id!==store.id)))throw Error('Δεν επιβεβαιώθηκε το κατάστημα της προσφοράς.');
   setResult({list,analysis});setLoadedScope(own);
  }catch(e){if(current===sequence.current&&own===currentScope.current)setError(e.message)}
  finally{if(current===sequence.current&&own===currentScope.current)setBusy(false)}
 };
 useEffect(()=>{load();return()=>{sequence.current++}},[api,companyId,store.id]);
 return <section className="staff-promotions op-box"><div className="section-heading"><div><h2>Προσφορές · {store.name}</h2><p>Προσφορές και ανάλυση του επιλεγμένου καταστήματος.</p></div><button type="button" disabled={busy} onClick={load}>Ανανέωση προσφορών</button></div>{error&&<p role="alert">{error}</p>}{busy&&<p role="status">Φόρτωση προσφορών…</p>}{visible&&<><NativePromotionList items={visible.list.items} readOnly/>{!visible.list.items.length&&<p>Δεν υπάρχουν προσφορές στο επιλεγμένο κατάστημα.</p>}<NativePromotionAnalysis analysis={visible.analysis} showRows/></>}</section>;
}
