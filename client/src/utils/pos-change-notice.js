import {useEffect,useRef,useState} from 'react';

export function changeDue(received,total){
  if(String(received??'').trim()===''||total===null||total===undefined)return null;
  const tender=Number(String(received).replace(',','.')),due=Number(total);
  if(!Number.isFinite(tender)||!Number.isFinite(due)||tender<0||due<0)return null;
  const tenderCents=Math.round(tender*100),dueCents=Math.round(due*100);
  if(!Number.isSafeInteger(tenderCents)||!Number.isSafeInteger(dueCents)||tenderCents<dueCents)return null;
  return (tenderCents-dueCents)/100;
}

export function usePosChangeNotice({storeId,received,total,hasCart,busy,pending}){
  const [notice,setNotice]=useState(null),tender=useRef(null);
  useEffect(()=>{tender.current=null;setNotice(null)},[storeId]);
  useEffect(()=>{
    if(busy||pending){setNotice(current=>current?.phase==='PREVIEW'?null:current);return}
    if(!hasCart||String(received).trim()===''){
      setNotice(current=>current?.phase==='PREVIEW'?null:current);return;
    }
    const amount=changeDue(received,total);
    setNotice(amount===null?null:{amount,storeId,phase:'PREVIEW'});
  },[storeId,received,total,hasCart,busy,pending]);
  useEffect(()=>{
    if(!notice)return;
    const timer=setTimeout(()=>setNotice(current=>current===notice?null:current),3000);
    return()=>clearTimeout(timer);
  },[notice]);
  const captureTender=(method,transactionId,recovered)=>{
    setNotice(null);
    if(recovered)return;
    tender.current=method==='CASH'?{received,storeId,transactionId}:null;
  };
  const completedChange=(method,total,transactionId,payments,exchange=false)=>{
    const saved=tender.current;
    if(exchange||method!=='CASH'||!saved||saved.storeId!==storeId||saved.transactionId!==transactionId||payments?.some(row=>row.method!=='CASH'))return null;
    return changeDue(saved.received,total);
  };
  const clearChange=()=>{tender.current=null;setNotice(null)};
  const showChange=amount=>{if(amount!==null)setNotice({amount,storeId,phase:'COMPLETE'})};
  return {notice:notice?.storeId===storeId?notice:null,captureTender,completedChange,clearChange,showChange};
}
