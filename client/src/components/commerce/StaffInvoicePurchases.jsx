import React,{useEffect,useRef} from 'react';
import {mountPosPurchaseOrders} from './installPurchaseOrdersSuite.js';
import './purchase-orders-suite.css';
export default function StaffInvoicePurchases({api,store,capabilities}){
 const host=useRef(null);
 useEffect(()=>mountPosPurchaseOrders(host.current,{request:api,store,staffCapabilities:capabilities}),[api,store.id,capabilities]);
 return <section aria-label="Αγορές και πρόχειρα τιμολογίων" ref={host}/>;
}
