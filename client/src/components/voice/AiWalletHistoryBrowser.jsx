import React,{useEffect,useRef,useState} from 'react';
import AiWalletActivityHistory from './AiWalletActivityHistory.jsx';

export default function AiWalletHistoryBrowser({entries=[],stores=[],companyId,storeId=null,readKey,loadPage,disabled=false}){
  const context=JSON.stringify([companyId,storeId,readKey]),latest=useRef(context),sequence=useRef(0),request=useRef(null);
  latest.current=context;
  const [view,setView]=useState(null);
  const current=view?.context===context?view:null;
  useEffect(()=>{
    sequence.current++;request.current?.abort();request.current=null;setView(null);
    return()=>{sequence.current++;request.current?.abort();request.current=null;};
  },[context]);
  async function read(cursors=[null],index=0){
    if(disabled||request.current)return;
    const controller=new AbortController(),number=++sequence.current,captured=context;
    request.current=controller;
    // Clear the old page while authorization and the new page are checked.
    setView({context:captured,busy:true,cursors,index});
    try{
      const page=await loadPage(cursors[index],{signal:controller.signal});
      if(controller.signal.aborted||number!==sequence.current||latest.current!==captured)return;
      if(!page||page.runtimeEnabled!==true||page.companyId!==companyId||page.storeId!==storeId||!Array.isArray(page.entries)||page.entries.length>100||(page.nextCursor!==null&&(typeof page.nextCursor!=='string'||!page.nextCursor.length||page.nextCursor.length>4096)))throw new Error('Invalid history scope');
      setView({context:captured,busy:false,cursors,index,page});
    }catch(error){
      if(!controller.signal.aborted&&number===sequence.current&&latest.current===captured)setView({context:captured,busy:false,cursors,index,error:true});
    }finally{if(request.current===controller)request.current=null;}
  }
  function close(){sequence.current++;request.current?.abort();request.current=null;setView(null);}
  if(!current)return <>
    <button type="button" disabled={disabled||!companyId} onClick={()=>read()}>Πλήρες ιστορικό AI</button>
    <AiWalletActivityHistory entries={entries} stores={stores}/>
  </>;
  return <section aria-label="Πλήρες ιστορικό AI" aria-busy={current.busy}>
    <h4>Πλήρες ιστορικό AI — Σελίδα {current.index+1}</h4>
    <p>Οι κινήσεις εμφανίζονται από τη νεότερη στην παλαιότερη, έως 100 ανά σελίδα.</p>
    <button type="button" disabled={disabled||current.busy} onClick={()=>read(current.cursors,current.index)}>Ανανέωση σελίδας</button>
    <button type="button" disabled={disabled||current.busy||current.error} onClick={close}>Πρόσφατες κινήσεις</button>
    {current.busy&&<p role="status">Φόρτωση ιστορικού…</p>}
    {current.error&&<p role="alert">Το ιστορικό δεν είναι διαθέσιμο. Ανανέωσε τη σελίδα ιστορικού για νέο έλεγχο πρόσβασης.</p>}
    {current.page&&<>
      <AiWalletActivityHistory key={current.index+':'+current.cursors[current.index]} entries={current.page.entries} stores={stores} caption="Τα φίλτρα και τα σύνολα αφορούν μόνο αυτή τη σελίδα, όχι ολόκληρο το ιστορικό. Ώρες Ελλάδας."/>
      <button type="button" disabled={disabled||current.busy||current.index===0} onClick={()=>read(current.cursors,current.index-1)}>Προηγούμενη σελίδα</button>
      <button type="button" disabled={disabled||current.busy||!current.page.nextCursor} onClick={()=>read([...current.cursors.slice(0,current.index+1),current.page.nextCursor],current.index+1)}>Επόμενη σελίδα</button>
    </>}
  </section>;
}
