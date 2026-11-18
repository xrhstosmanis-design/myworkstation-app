import {useEffect,useRef,useState} from 'react';
export default function useCompanyConfigurationRead({api,companyId,authorityKey,path,enabled,validate,context={}}){
 const [state,setState]=useState(null),[error,setError]=useState(null),[reload,setReload]=useState(0),sequence=useRef(0);
 const key=JSON.stringify([companyId,authorityKey,path,context]),scope=useRef(key);scope.current=key;
 useEffect(()=>{const n=++sequence.current,c=new AbortController();setState(null);setError(null);if(!enabled||!path||!companyId)return;
 api(path,{signal:c.signal,headers:{'x-backoffice-company-id':companyId}}).then(value=>{if(n!==sequence.current||scope.current!==key)return;if(!validate(value,{companyId,...context}))throw Error('Δεν επιβεβαιώθηκε η εταιρική ρύθμιση ή η επιλεγμένη οντότητα.');setState({key,api,value})}).catch(e=>{if(n===sequence.current&&scope.current===key){setState(null);setError({key,api,message:e.message||'Η εταιρική ρύθμιση δεν είναι διαθέσιμη.'})}});return()=>{sequence.current++;c.abort()};
 },[api,key,enabled,reload]);
 return{data:enabled&&state?.key===key&&state.api===api?state.value:null,error:error?.key===key&&error.api===api?error.message:'',refresh(){sequence.current++;setState(null);setError(null);setReload(v=>v+1)}};
}
