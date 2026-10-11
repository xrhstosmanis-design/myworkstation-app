import {useEffect,useRef,useState} from "react";
import QRCode from "qrcode";

export default function useMobileDocumentPhotos({api,storeId,count,onFiles,setMessage}){
  const [qr,setQr]=useState(""),[pending,setPending]=useState(false),session=useRef({generation:0,timer:null}),latest=useRef({onFiles,setMessage});latest.current={onFiles,setMessage};
  const cancel=()=>{session.current.generation++;clearInterval(session.current.timer);session.current.timer=null;setQr("");setPending(false)};
  useEffect(()=>{cancel();return()=>{session.current.generation++;clearInterval(session.current.timer)}},[storeId]);
  const createQr=async()=>{
    cancel();if(count>=5)return latest.current.setMessage?.("⚠️ Έχουν ήδη επιλεγεί 5 φωτογραφίες.");
    const generation=session.current.generation,active=()=>generation===session.current.generation;setPending(true);
    try{
      const result=await api("/api/commerce/mobile-invoice-upload-sessions",{method:"POST",body:JSON.stringify({storeId,maxFiles:5-count})});
      if(!active())return;const image=await QRCode.toDataURL(result.url);if(!active())return;setQr(image);
      let polling=false;const expires=Date.now()+600000;
      session.current.timer=setInterval(async()=>{
        if(polling||!active())return;
        if(Date.now()>=expires){cancel();latest.current.setMessage?.("⚠️ Το QR έληξε. Δημιούργησε νέο QR.");return}
        polling=true;let consuming=false;
        try{
          const resultFiles=await api(`/api/commerce/mobile-invoice-upload-sessions/${result.id}`);if(!active())return;
          const uploaded=Array.isArray(resultFiles?.files)?resultFiles.files:resultFiles?.dataUrl?[resultFiles]:[];
          if(!uploaded.length)return;
          consuming=true;
          clearInterval(session.current.timer);session.current.timer=null;
          const files=[];for(const item of uploaded){const blob=await fetch(item.dataUrl).then(response=>response.blob());files.push(new File([blob],item.filename||"timologio.jpg",{type:item.mimeType||blob.type}))}
          if(!active())return;cancel();await latest.current.onFiles(files);
        }catch(error){if(active()&&(consuming||error?.status===404||Date.now()>=expires)){cancel();latest.current.setMessage?.(`❌ ${error?.message||"Δεν παραλήφθηκαν οι φωτογραφίες. Δημιούργησε νέο QR."}`)}}
        finally{polling=false}
      },2000);
    }catch(error){if(active()){cancel();latest.current.setMessage?.(`❌ ${error?.message||"Δεν δημιουργήθηκε QR."}`)}}
  };
  return {qr,pending,createQr,cancel};
}
