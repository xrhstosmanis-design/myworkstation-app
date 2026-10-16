import {useEffect,useState} from "react";

export function useBarcodePendingCount(api,storeId,enabled,refreshKey){
  const [state,setState]=useState(null);
  useEffect(()=>{
    if(!enabled||!storeId)return;
    let active=true,loading=false;
    const refresh=async()=>{
      if(loading||document.visibilityState==="hidden")return;
      loading=true;
      try{const result=await api(`/api/store-pos/stores/${storeId}/barcode-registration?countOnly=true`);if(active)setState({storeId,count:Number.isSafeInteger(result.missingCount)?result.missingCount:null})}
      catch{if(active)setState({storeId,count:null})}finally{loading=false}
    };
    refresh();const timer=setInterval(refresh,60000);
    window.addEventListener("focus",refresh);document.addEventListener("visibilitychange",refresh);
    return()=>{active=false;clearInterval(timer);window.removeEventListener("focus",refresh);document.removeEventListener("visibilitychange",refresh)};
  },[api,storeId,enabled,refreshKey]);
  return enabled&&state?.storeId===storeId?state.count:null;
}
