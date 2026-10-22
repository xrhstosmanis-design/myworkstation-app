import {useEffect,useRef} from 'react';
// Ftext never follows the RBS DISPATCHED -> cash commit transition. A durable
// verified final receipt is required, and polling never creates a sale request.
export default function useFtextCashCheckout({api,storeId,pending,onRequest,onCommitted,onError}){
 const callbacks=useRef({onRequest,onCommitted,onError});callbacks.current={onRequest,onCommitted,onError};
 const requestId=pending?.request?.kind==='FTEXT_CASH'?pending.request.id:null;
 useEffect(()=>{
  if(!requestId)return;let cancelled=false,running=false,done=false;
  const check=async()=>{if(running||done)return;running=true;try{
   const data=await api(`/api/store-pos/stores/${storeId}/ftext-cash/${encodeURIComponent(requestId)}`);if(cancelled)return;
   const row=data.request;if(row?.id!==requestId||row.storeId!==storeId||row.kind!=='FTEXT_CASH')throw new Error('Η απάντηση δεν αντιστοιχεί στην εντολή ftext.');
   callbacks.current.onRequest(row);
   if(row.status==='SALE_COMMITTED'){done=true;callbacks.current.onCommitted(row);}
   else if(row.status==='CONFIRMED'){await api(`/api/store-pos/stores/${storeId}/ftext-cash/${encodeURIComponent(requestId)}/finalize`,{method:'POST',body:'{}'});}
  }catch(error){if(!cancelled)callbacks.current.onError(error.message)}finally{running=false}};
  check();const timer=setInterval(check,1800);return()=>{cancelled=true;clearInterval(timer)};
 },[api,storeId,requestId]);
}
