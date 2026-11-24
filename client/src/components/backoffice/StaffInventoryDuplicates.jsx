import React,{useEffect,useRef,useState} from 'react';
import InventoryDuplicateGroup from '../commerce/InventoryDuplicateGroup.jsx';

export default function StaffInventoryDuplicates({api,storeId,storeName}){
  const [result,setResult]=useState(null);
  const request=useRef(0);
  useEffect(()=>()=>{request.current++},[]);

  async function checkDuplicates(){
    const current=++request.current;
    setResult({loading:true});
    try{
      const {groups}=await api(`/api/inventory-archive/duplicates?storeId=${encodeURIComponent(storeId)}`);
      if(current===request.current)setResult({groups});
    }catch(error){
      if(current===request.current)setResult({error:error.message});
    }
  }

  return <section>
    <h2>Έλεγχος διπλοεγγραφών · {storeName}</h2>
    <p>Ο έλεγχος αφορά τα ενεργά είδη του καταστήματος. Η ίδια περιγραφή χρειάζεται επιβεβαίωση.</p>
    <button type="button" className="staff-module-primary" disabled={result?.loading} onClick={checkDuplicates}>Έλεγχος ειδών</button>
    {result?.loading&&<p role="status">Γίνεται έλεγχος…</p>}
    {result?.error&&<p role="alert">{result.error}</p>}
    {result?.groups?.length===0&&<p role="status">Δεν βρέθηκαν πιθανές διπλοεγγραφές.</p>}
    {result?.groups?.map(group=><InventoryDuplicateGroup key={`${group.kind}:${group.value}`} group={group}/>)}
  </section>;
}
