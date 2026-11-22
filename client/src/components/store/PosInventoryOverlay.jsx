import React,{useEffect,useMemo,useRef,useState} from 'react';
import InventoryArchivePanel from '../commerce/InventoryArchivePanel.jsx';
import {createPosInventoryClient} from './pos-inventory-client.js';
import './pos-inventory-overlay.css';
export default function PosInventoryOverlay({api,store,operator,onClose,onOrders}){
 const close=useRef(onClose);close.current=onClose;
 const [capabilities,setCapabilities]=useState(null),[error,setError]=useState('');
 const client=useMemo(()=>createPosInventoryClient({api,storeId:store.id,actorId:operator.operatorId||operator.id,sessionToken:sessionStorage.getItem('storeOperatorToken'),currentToken:()=>sessionStorage.getItem('storeOperatorToken'),onAccessLost:failure=>close.current(failure.message)}),[api,store.id,operator]);
 useEffect(()=>{
  let alive=true;
  const refresh=()=>client.request('/access').then(result=>{if(alive)setCapabilities(result.capabilities)}).catch(failure=>{if(alive)setError(failure.message)});
  refresh();const timer=setInterval(refresh,15000);
  return()=>{alive=false;clearInterval(timer);client.dispose()};
 },[client]);
 return <div className="pos-inventory-overlay" role="dialog" aria-modal="true" aria-label="Αποθήκη από POS"><section><header><div><b>Αποθήκη από POS</b><small>{store.name} · {operator.fullName} · Το στοκ είναι μόνο για προβολή</small></div><button type="button" onClick={()=>onClose()}>Κλείσιμο ×</button></header>{error&&<p role="alert">{error}</p>}{capabilities?<InventoryArchivePanel api={client.api} storeId={store.id} stores={[store]} onClose={()=>onClose()} operatorCapabilities={capabilities} onOrders={onOrders}/>:<p>Έλεγχος δικαιωμάτων…</p>}</section></div>;
}
