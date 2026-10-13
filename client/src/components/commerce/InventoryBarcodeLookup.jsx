import React,{useEffect,useRef,useState} from 'react';

export default function InventoryBarcodeLookup({api,storeId,barcode,onApply}){
 const [busy,setBusy]=useState(false),[result,setResult]=useState(null),[error,setError]=useState('');
 const generation=useRef(0),scope=useRef({storeId,barcode});scope.current={storeId,barcode};
 useEffect(()=>{generation.current++;setBusy(false);setResult(null);setError('');return()=>{generation.current++}},[storeId,barcode]);
 const lookup=async()=>{
  const code=String(barcode||'').trim(),selectedStore=storeId,token=++generation.current;
  if(!selectedStore||!/^\d{6,18}$/.test(code)){setError('Βάλε barcode 6–18 ψηφίων και επίλεξε κατάστημα.');return;}
  setBusy(true);setResult(null);setError('');
  try{const data=await api(`/api/owner-products/smart-entry/barcode/${encodeURIComponent(code)}?storeId=${encodeURIComponent(selectedStore)}`);if(token===generation.current&&scope.current.storeId===selectedStore&&String(scope.current.barcode||'').trim()===code)setResult(data)}
  catch(e){if(token===generation.current)setError(e.message||'Η αναζήτηση δεν ολοκληρώθηκε.')}
  finally{if(token===generation.current)setBusy(false)}
 };
 return <div className="ia-online-lookup"><button type="button" onClick={lookup} disabled={busy||!storeId}>{busy?'Αναζήτηση…':'Αναζήτηση online'}</button>{error&&<div role="alert">{error}</div>}{result&&<div role="status">{!result.found?'Δεν βρέθηκαν στοιχεία. Συμπλήρωσε την καρτέλα χειροκίνητα.':result.source==='MYWORKSTATION'?`Το barcode υπάρχει ήδη στο MyWorkStation: ${result.product?.name||''}. Άνοιξε το υπάρχον είδος για να αποφύγεις διπλή εγγραφή.`:<><b>{result.product?.name||'Χωρίς περιγραφή'}</b><span> · {result.product?.brandName||''} · {result.source==='MASTER_CATALOG'?'Master Catalog':'Open Food Facts'}</span><p>Έλεγξε την ταύτιση. Τιμές, ΦΠΑ και απόθεμα παραμένουν όπως τα συμπλήρωσες.</p><button type="button" disabled={!result.product?.name} onClick={()=>{onApply(result.product);setResult(null)}}>Χρήση διαθέσιμων στοιχείων</button></>}</div>}</div>;
}
