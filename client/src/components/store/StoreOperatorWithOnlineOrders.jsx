import React,{useEffect,useState} from "react";
import StoreOperatorApp from "./StoreOperatorApp.jsx";
import StoreOnlineOrders from "./StoreOnlineOrdersV2.jsx";

const readSession=()=>{try{return JSON.parse(sessionStorage.getItem("storeOperatorSession")||"null")}catch{return null}};

export default function StoreOperatorWithOnlineOrders({api,storeId}){
 const [session,setSession]=useState(()=>readSession());
 useEffect(()=>{let last=sessionStorage.getItem("storeOperatorSession")||"";const timer=window.setInterval(()=>{const nextRaw=sessionStorage.getItem("storeOperatorSession")||"";if(nextRaw===last)return;last=nextRaw;setSession(readSession())},500);return()=>window.clearInterval(timer)},[]);
 const operatorApi=async(path,options={})=>{const token=sessionStorage.getItem("storeOperatorToken");const response=await fetch(path,{...options,headers:{"Content-Type":"application/json",...(token?{Authorization:`Bearer ${token}`}:{}) ,...(options.headers||{})}});const text=await response.text();let data={};if(text){try{data=JSON.parse(text)}catch{data={error:"Ο server επέστρεψε μη αναμενόμενη απάντηση."}}}if(!response.ok){const error=new Error(data.error||`Σφάλμα ${response.status}`);error.status=response.status;error.data=data;throw error}return data};
 const active=session?.store?.id?session:null;
 return <><StoreOperatorApp api={api} storeId={storeId}/>{active&&<StoreOnlineOrders api={operatorApi} store={active.store}/>}</>;
}
