import {useEffect,useRef} from 'react';
// Polling never creates/resends a sale. Operator card mode also needs an explicit decision.
export default function useFtextCashCheckout({api,storeId,pending,onRequest,onCommitted,onCancelled,onError}){
 const callbacks=useRef({onRequest,onCommitted,onCancelled,onError});callbacks.current={onRequest,onCommitted,onCancelled,onError};
 const requestId=pending?.request?.kind==='FTEXT_CASH'?pending.request.id:null;
 const scope=storeId+'|'+requestId,scopeRef=useRef(scope);scopeRef.current=scope;
 useEffect(()=>{
  if(!requestId)return;let cancelled=false,running=false,done=false;
  const check=async()=>{if(running||done)return;running=true;try{
   const data=await api(`/api/store-pos/stores/${storeId}/ftext-cash/${encodeURIComponent(requestId)}`);if(cancelled||scopeRef.current!==scope)return;
   const row=data.request;if(row?.id!==requestId||row.storeId!==storeId||row.kind!=='FTEXT_CASH')throw new Error('Η απάντηση δεν αντιστοιχεί στην εντολή ftext.');
   callbacks.current.onRequest(row);
   if(row.status==='CANCELLED'){done=true;callbacks.current.onCancelled?.(row);}
   else if(row.status==='SALE_COMMITTED'){done=true;callbacks.current.onCommitted(row);}
   else if(row.status==='CONFIRMED'&&!row.operatorConfirmationRequired&&(!row.operatorOutcome||row.operatorOutcome==='YES')){await api(`/api/store-pos/stores/${storeId}/ftext-cash/${encodeURIComponent(requestId)}/finalize`,{method:'POST',body:'{}'});}
  }catch(error){if(!cancelled&&scopeRef.current===scope)callbacks.current.onError(error.message)}finally{running=false}};
  check();const timer=setInterval(check,1800);return()=>{cancelled=true;clearInterval(timer)};
 },[api,storeId,requestId]);
}
