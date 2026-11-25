import {useEffect,useRef,useState} from 'react';
import {printNetlinkVoucher} from './netlink-voucher-print.mjs';
import {netlinkIntentIdsFromItems} from '../../../../shared/netlink-checkout-items.mjs';
export const netlinkIntentFromItems=items=>netlinkIntentIdsFromItems(items)[0]||null;
export function useNetlinkPaidCheckout({api,storeId,storeName,getCheckoutId,onReady,onError,onMessage}){
 const token=useRef(null);if(token.current?.api!==api||token.current?.storeId!==storeId)token.current={api,storeId};
 const alive=useRef(true),locks=useRef(new Set()),printed=useRef(new Set());const [buying,setBuying]=useState(false),[voucher,setVoucher]=useState(null);
 useEffect(()=>{alive.current=true;setVoucher(null);return()=>{alive.current=false}},[storeId,api]);
 const renderToken=token.current;
 const current=()=>()=>alive.current&&token.current===renderToken;
 async function receipt(id,{autoPrint=false}={}){const valid=current();const result=await api(`/api/netlink/issuance-intents/${encodeURIComponent(id)}/receipt`,{method:'POST',body:JSON.stringify({storeId})});if(!valid())return;setVoucher(result);onMessage?.('Η κάρτα εκδόθηκε. Η επανεκτύπωση χρησιμοποιεί την ίδια κάρτα, χωρίς νέα χρέωση.');if(autoPrint&&!printed.current.has(storeId+':'+id)){printed.current.add(storeId+':'+id);if(!await printNetlinkVoucher(window,result,storeName)&&valid())onMessage?.('Η κάρτα εκδόθηκε. Πάτησε «Εκτύπωση κάρτας» στο παράθυρο που άνοιξε.')}}
 async function complete(itemsOrId){
  const batchValid=current();if(!batchValid())return;
  if(Array.isArray(itemsOrId)){for(const id of netlinkIntentIdsFromItems(itemsOrId)){if(!batchValid())break;await complete(id)}return}
  const id=itemsOrId;if(!id)return;const key=storeId+':'+id;if(locks.current.has(key))return;locks.current.add(key);const valid=current();
  try{const result=await api(`/api/netlink/issuance-intents/${encodeURIComponent(id)}/issue`,{method:'POST',body:JSON.stringify({storeId})});if(!valid())return;if(result.status==='COMPLETED')await receipt(id,{autoPrint:result.idempotentReplay!==true});else onError?.('Η έκδοση της κάρτας εκκρεμεί για έλεγχο Netlink. Μην κάνεις δεύτερη πληρωμή ή νέα αγορά κάρτας.');}
  catch{if(valid())onError?.('Η έκδοση Netlink δεν επιβεβαιώθηκε. Έλεγξε την εκκρεμή κάρτα από το Netlink, χωρίς δεύτερη πληρωμή.');}finally{locks.current.delete(key)}
 }
 return {buying,voucher,closeVoucher:()=>setVoucher(null),printVoucher:async()=>{if(voucher&&!await printNetlinkVoucher(window,voucher,storeName))onError?.('Δεν άνοιξε η εκτύπωση. Επίτρεψε τα αναδυόμενα παράθυρα και επίλεξε τον θερμικό εκτυπωτή.')},
  async selectCard(productId){if(locks.current.has('buy'))return;locks.current.add('buy');const valid=current();setBuying(true);try{const intent=await api('/api/netlink/issuance-intents',{method:'POST',body:JSON.stringify({storeId,productId,requestId:crypto.randomUUID(),checkoutId:getCheckoutId()})});if(valid())onReady(intent);}catch(e){if(valid())onError?.(e.message||'Δεν προστέθηκε η κάρτα.')}finally{locks.current.delete('buy');if(valid())setBuying(false)}},
  async beforePayment(method,items,total,clientTransactionId){
   const ids=netlinkIntentIdsFromItems(items);if(!ids.length)return true;
   const groups=new Set(items.filter(row=>ids.includes(row.netlinkIntentId)).map(row=>row.netlinkCheckoutId));
   if(groups.size!==1||!groups.has(clientTransactionId))throw Error('Οι κάρτες δεν συμφωνούν με την τρέχουσα συναλλαγή.');
   if(!['CASH','CARD'].includes(method))throw Error('Το καλάθι με κάρτες Netlink πληρώνεται με μετρητά ή κάρτα.');
   if(method==='CASH'){
    if(!window.confirm(`Εισέπραξες το συνολικό ποσό ${Number(total).toLocaleString('el-GR',{style:'currency',currency:'EUR'})} για όλα τα προϊόντα, τις κάρτες και τις παροχές;`))return false;
    await api(`/api/netlink/issuance-checkouts/${encodeURIComponent(clientTransactionId)}/cash-received`,{method:'POST',body:JSON.stringify({storeId,received:true,amount:Number(total),requestIds:ids})});
   }return true;
  },
  complete,
  async recover(intent){if(intent.status==='COMPLETED'){try{await receipt(intent.requestId)}catch{onError?.('Δεν φορτώθηκε η ήδη εκδοθείσα κάρτα. Δεν έγινε νέα αγορά.')}}else if(intent.paid&&intent.status==='READY_FOR_PAYMENT')await complete(intent.requestId)}
 };
}
