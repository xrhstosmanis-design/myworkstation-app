import React,{useEffect,useMemo,useState} from 'react';
import ProductionPrinterSettings from '../store/ProductionPrinterSettings.jsx';

// The parent keys this panel by company/store. No support login or POS session
// is created, and the operator's cart and shift are never touched.
export default function PlatformProductionPrinterManager({company,store,request,onClose}){
 const [state,setState]=useState(null),[error,setError]=useState('');
 const api=useMemo(()=>{
  const prefix=`/api/production-printers/stores/${encodeURIComponent(store.id)}`;
  const target=`/api/production-printers/companies/${encodeURIComponent(company.id)}/stores/${encodeURIComponent(store.id)}`;
  return (path,options)=>{
   if(path!==prefix&&!path.startsWith(prefix+'/'))return Promise.reject(Error('Λάθος κατάστημα εκτυπωτή.'));
   return request(target+path.slice(prefix.length),options);
  };
 },[company.id,store.id,request]);
 useEffect(()=>{let live=true;setState(null);setError('');api(`/api/production-printers/stores/${encodeURIComponent(store.id)}`).then(value=>{if(live)setState(value)}).catch(e=>{if(live)setError(e.message)});return()=>{live=false}},[api,store.id]);
 return <div className="platform-modal"><section className="platform-security-dialog"><h2>Εκτυπωτής παραγωγής · {store.name}</h2>{error&&<p role="alert">{error}</p>}{state?<ProductionPrinterSettings api={api} store={store} state={state} cart={[]} onSaved={setState} onClose={onClose}/>:<><p>{error?'Δεν φορτώθηκαν οι ρυθμίσεις.':'Φόρτωση ρυθμίσεων…'}</p><button onClick={onClose}>Κλείσιμο</button></>}</section></div>;
}
