import React,{useEffect,useRef,useState} from 'react';
import './pos-permanent-price.css';
const euro=value=>Number(value).toLocaleString('el-GR',{style:'currency',currency:'EUR'});
export default function PosPermanentPrice({api,store,product,newPrice,reason,enabled,onBusy,onSaved}){
  const [baseline,setBaseline]=useState(null),[error,setError]=useState(''),[busy,setBusy]=useState(false);
  const active=useRef(false),locked=useRef(false),attempt=useRef(null),callbacks=useRef({onBusy,onSaved});
  callbacks.current={onBusy,onSaved};
  const productId=product.productId||product.id,barcode=product.scannedBarcode||'';
  const path=`/api/store-pos/stores/${encodeURIComponent(store.id)}/products/${encodeURIComponent(productId)}/permanent-price`;
  useEffect(()=>{active.current=true;let cancelled=false;
    api(`${path}${barcode?`?barcode=${encodeURIComponent(barcode)}`:''}`).then(result=>{if(!cancelled){if(result.storeId!==store.id||result.productId!==productId)throw new Error('Δεν αντιστοιχεί το προϊόν ή το κατάστημα.');setBaseline(result)}}).catch(e=>{if(!cancelled)setError(e.message)});
    return()=>{cancelled=true;active.current=false;callbacks.current.onBusy(false)};
  },[api,path,barcode,store.id,productId]);
  const valid=typeof newPrice==='number'&&Number.isFinite(newPrice)&&newPrice>=0&&newPrice<=999999&&Math.abs(newPrice*100-Math.round(newPrice*100))<0.000001;
  const save=async()=>{
    if(locked.current||!enabled||!baseline||!valid||newPrice===baseline.salePrice)return;
    locked.current=true;setBusy(true);callbacks.current.onBusy(true);setError('');
    const values={newPrice,expectedPrice:baseline.salePrice,reason,barcode,confirm:true},fingerprint=JSON.stringify(values);
    if(attempt.current?.fingerprint!==fingerprint)attempt.current={fingerprint,requestId:crypto.randomUUID()};
    try{
      const result=await api(path,{method:'POST',body:JSON.stringify({...values,requestId:attempt.current.requestId})});
      if(!active.current)return;
      if(result.storeId!==store.id||result.productId!==productId||result.salePrice!==newPrice)throw new Error('Μη αναμενόμενη επιβεβαίωση αλλαγής τιμής.');
      callbacks.current.onSaved(result);
    }catch(e){if(active.current)setError(e.message)}finally{locked.current=false;if(active.current){setBusy(false);callbacks.current.onBusy(false)}}
  };
  return <div className="pos-permanent-price" role="region" aria-label="Μόνιμη αλλαγή τιμής">
    {baseline&&<p><b>{baseline.productName}</b> · {product.sku||'Χωρίς SKU'}<br/>{baseline.storeName}: {euro(baseline.salePrice)} → {valid?euro(newPrice):'—'}<br/>Η νέα τιμή ισχύει και για τις επόμενες πωλήσεις του καταστήματος. Καταγράφεται στα συμβάντα.</p>}
    {!baseline&&!error&&<p>Έλεγχος τιμής και δικαιωμάτων…</p>}
    {error&&<p role="alert">{error}</p>}
    <button type="button" className="pos-primary-inline" disabled={!baseline||!valid||newPrice===baseline.salePrice||!enabled||busy} onClick={save}>{busy?'Αποθήκευση…':'Αποθήκευση μόνιμης τιμής'}</button>
  </div>;
}
