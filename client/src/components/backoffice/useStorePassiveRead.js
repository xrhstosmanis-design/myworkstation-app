import {useEffect,useRef,useState} from 'react';
export default function useStorePassiveRead({api,companyId,storeId,authorityKey,path,enabled,validate,context={}}){
 const [state,setState]=useState(null),[error,setError]=useState(null),[reload,setReload]=useState(0),sequence=useRef(0),key=JSON.stringify([companyId,storeId,authorityKey,path,context]),scope=useRef(key);scope.current=key;
 useEffect(()=>{const serial=++sequence.current,controller=new AbortController();setState(null);setError(null);if(!enabled||!path||!companyId||!storeId)return;
 api(path,{signal:controller.signal,headers:{'x-backoffice-store-id':storeId}}).then(value=>{if(serial!==sequence.current||scope.current!==key)return;if(!validate(value,{companyId,storeId,...context}))throw Error('Δεν επιβεβαιώθηκε η προβολή του επιλεγμένου καταστήματος.');setState({key,api,value})}).catch(failure=>{if(serial===sequence.current&&scope.current===key){setState(null);setError({key,api,message:failure.message||'Η προβολή δεν είναι διαθέσιμη.'})}});return()=>{sequence.current++;controller.abort()};
 },[api,key,enabled,reload]);
 return{data:enabled&&state?.key===key&&state.api===api?state.value:null,error:error?.key===key&&error.api===api?error.message:'',refresh(){sequence.current++;setState(null);setError(null);setReload(value=>value+1)}};
}
