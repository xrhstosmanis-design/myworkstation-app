import React,{useEffect,useRef,useState} from 'react';

const decodePhoto=async(file,options)=>(await import('../../lib/product-barcode-photo.js')).readBarcodePhoto(file,options);
export default function InventoryBarcodeLookup({api,storeId,barcode,onApply,onBarcode,readPhoto=decodePhoto}){
 const [busy,setBusy]=useState(false),[result,setResult]=useState(null),[error,setError]=useState('');
 const [reading,setReading]=useState(false),[choices,setChoices]=useState([]),[photoMessage,setPhotoMessage]=useState('');
 const fileInput=useRef(null),photoController=useRef(null),pendingLookup=useRef(null),apiRef=useRef(api);apiRef.current=api;
 const generation=useRef(0),scope=useRef({storeId,barcode});scope.current={storeId,barcode};
 useEffect(()=>{generation.current++;photoController.current?.abort();setReading(false);setBusy(false);setResult(null);setError('');setChoices([]);
  const pending=pendingLookup.current;pendingLookup.current=null;
  if(pending?.storeId===storeId&&pending.code===String(barcode||'').trim())lookup();else setPhotoMessage('');
  return()=>{generation.current++;photoController.current?.abort()}
 },[storeId,barcode]);
 const lookup=async()=>{
  const code=String(barcode||'').trim(),selectedStore=storeId,token=++generation.current;
  if(!selectedStore||!/^\d{6,18}$/.test(code)){setError('Βάλε barcode 6–18 ψηφίων και επίλεξε κατάστημα.');return;}
  setBusy(true);setResult(null);setError('');setChoices([]);
  try{const data=await apiRef.current(`/api/owner-products/smart-entry/barcode/${encodeURIComponent(code)}?storeId=${encodeURIComponent(selectedStore)}`);if(token===generation.current&&scope.current.storeId===selectedStore&&String(scope.current.barcode||'').trim()===code)setResult(data)}
  catch(e){if(token===generation.current)setError(e.message||'Η αναζήτηση δεν ολοκληρώθηκε.')}
  finally{if(token===generation.current)setBusy(false)}
 };
 const usePhotoCode=(code,token,origin=scope.current)=>{
  if(token!==generation.current||origin.storeId!==scope.current.storeId||origin.barcode!==scope.current.barcode||!/^\d{6,18}$/.test(code))return;
  setReading(false);setChoices([]);setPhotoMessage(`Διαβάστηκε barcode: ${code}`);
  if(code===String(scope.current.barcode||'').trim())lookup();else{pendingLookup.current={code,storeId:scope.current.storeId};onBarcode(code)}
 };
 const choosePhoto=async event=>{
  const file=event.target.files?.[0];event.target.value='';if(!file||!storeId||!onBarcode)return;
  photoController.current?.abort();const controller=new AbortController();photoController.current=controller;
  const token=++generation.current,origin={...scope.current};pendingLookup.current=null;setReading(true);setBusy(false);setResult(null);setError('');setChoices([]);setPhotoMessage('');
  try{const codes=[...new Set(await readPhoto(file,{signal:controller.signal}))].filter(x=>/^\d{6,18}$/.test(x));
   if(token!==generation.current||origin.storeId!==scope.current.storeId||origin.barcode!==scope.current.barcode)return;
   if(codes.length===1)usePhotoCode(codes[0],token,origin);else if(codes.length>1){setChoices(codes.map(code=>({code,token,origin})));setPhotoMessage('Βρέθηκαν πολλοί κωδικοί. Επίλεξε αυτόν του προϊόντος.')}else setError('Δεν διαβάστηκε barcode. Διάλεξε καθαρή, κοντινή φωτογραφία ή γράψε τον κωδικό.');
  }catch(e){if(token===generation.current&&e.name!=='AbortError')setError(e.message||'Δεν διαβάστηκε η φωτογραφία.')}
  finally{if(token===generation.current)setReading(false)}
 };
 return <div className="ia-online-lookup"><div className="ia-barcode-actions"><button type="button" onClick={lookup} disabled={busy||reading||!storeId}>{busy?'Αναζήτηση…':'Αναζήτηση online'}</button>{onBarcode&&<><button type="button" onClick={()=>fileInput.current?.click()} disabled={!storeId}>{reading?'Ανάγνωση φωτογραφίας…':'Φωτογραφία barcode'}</button><input ref={fileInput} type="file" accept="image/jpeg,image/png,image/webp" hidden aria-label="Φωτογραφία για ανάγνωση barcode" onChange={choosePhoto}/></>}</div>{photoMessage&&<div role="status">{photoMessage}</div>}{choices.length>0&&<div className="ia-barcode-choices">{choices.map(({code,token,origin})=><button type="button" key={code} onClick={()=>usePhotoCode(code,token,origin)}>{code}</button>)}</div>}{error&&<div role="alert">{error}</div>}{result&&<div role="status">{!result.found?'Δεν βρέθηκαν στοιχεία. Συμπλήρωσε την καρτέλα χειροκίνητα.':result.source==='MYWORKSTATION'?`Το barcode υπάρχει ήδη στο MyWorkStation: ${result.product?.name||''}. Άνοιξε το υπάρχον είδος για να αποφύγεις διπλή εγγραφή.`:<><b>{result.product?.name||'Χωρίς περιγραφή'}</b><span> · {result.product?.brandName||''} · {result.source==='MASTER_CATALOG'?'Master Catalog':'Open Food Facts'}</span><p>Έλεγξε την ταύτιση. Τιμές, ΦΠΑ και απόθεμα παραμένουν όπως τα συμπλήρωσες.</p><button type="button" disabled={!result.product?.name} onClick={()=>{onApply(result.product);setResult(null)}}>Χρήση διαθέσιμων στοιχείων</button></>}</div>}</div>;
}
