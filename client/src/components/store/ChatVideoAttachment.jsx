import React,{useEffect,useRef,useState} from 'react';
import ChatVideoPreview from './ChatVideoPreview.jsx';
const MAX=12*1024*1024;

/** Video-only receiver: no inherited image/PDF fetch state crosses store/session changes. */
export default function ChatVideoAttachment({storeId,messageId,sessionKey,getToken}){
  const [url,setUrl]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState('');
  const state=useRef({epoch:0,url:'',controller:null,active:true});
  const close=()=>{const s=state.current;s.epoch++;s.controller?.abort();s.controller=null;if(s.url)URL.revokeObjectURL(s.url);s.url='';setUrl('');setBusy(false)};
  useEffect(()=>{
    state.current.active=true;close();setError('');
    const hidden=()=>{if(document.hidden)close()},stop=()=>close();
    document.addEventListener('visibilitychange',hidden);window.addEventListener('pagehide',stop);window.addEventListener('storage',stop);
    return()=>{state.current.active=false;const s=state.current;s.epoch++;s.controller?.abort();if(s.url)URL.revokeObjectURL(s.url);s.url='';document.removeEventListener('visibilitychange',hidden);window.removeEventListener('pagehide',stop);window.removeEventListener('storage',stop)};
  },[storeId,messageId,sessionKey]);
  const open=async()=>{
    if(url||busy){close();return;}if(document.hidden||!sessionKey||getToken()!==sessionKey)return;
    const s=state.current,generation=++s.epoch,controller=new AbortController();s.controller=controller;setBusy(true);setError('');let reader;
    try{
      const response=await fetch(`/api/store-chat/stores/${encodeURIComponent(storeId)}/messages/${encodeURIComponent(messageId)}/attachment`,{headers:{Authorization:`Bearer ${sessionKey}`},cache:'no-store',signal:controller.signal,redirect:'error'});
      if(!response.ok||response.headers.get('Content-Type')?.split(';')[0]!=='video/mp4'||Number(response.headers.get('Content-Length'))>MAX)throw Error('Δεν φορτώθηκε το βίντεο. Έλεγξε σύνδεση και δικαιώματα.');
      if(!response.body)throw Error('Η προβολή βίντεο δεν υποστηρίζεται σε αυτόν τον browser.');
      reader=response.body.getReader();const chunks=[];let size=0;
      while(true){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>MAX)throw Error('Το βίντεο ξεπερνά τα 12 MB.');chunks.push(value);}
      if(!size)throw Error('Το βίντεο είναι κενό.');
      if(!s.active||s.epoch!==generation||document.hidden||getToken()!==sessionKey)return;
      s.url=URL.createObjectURL(new Blob(chunks,{type:'video/mp4'}));setUrl(s.url);
    }catch(e){if(s.active&&s.epoch===generation&&e.name!=='AbortError')setError(e.message||'Δεν άνοιξε το βίντεο.');}
    finally{try{await reader?.cancel()}catch{}if(s.active&&s.epoch===generation){s.controller=null;setBusy(false);}}
  };
  return <div><button type="button" onClick={e=>{e.stopPropagation();open()}}>{busy?'Ακύρωση φόρτωσης':url?'Κλείσιμο βίντεο':'▶ Προβολή βίντεο'}</button>{error&&<small role="alert">{error}</small>}{url&&<ChatVideoPreview url={url} onClose={close}/>}</div>;
}
