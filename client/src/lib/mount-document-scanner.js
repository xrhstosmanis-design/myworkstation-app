import React from "react";
import {createRoot} from "react-dom/client";
import DocumentScanButton from "../components/store/DocumentScanButton.jsx";

export function mountDocumentScanner(host,{getScope,getDisabled=()=>false,getMaxPages=()=>1,onFiles}){
  const root=createRoot(host);let signature="",disposed=false;
  const refresh=()=>{
    if(disposed)return;
    if(!host.isConnected){dispose();return}
    const scope=getScope(),disabled=getDisabled()||!scope,maxPages=getMaxPages();
    const next=JSON.stringify([scope,disabled,maxPages]);if(next===signature)return;signature=next;
    root.render(React.createElement(DocumentScanButton,{scopeKey:scope,disabled,maxPages,onFiles:files=>{if(host.isConnected&&getScope()===scope&&!getDisabled())return onFiles(files)}}));
  };
  const observer=new MutationObserver(refresh);
  const dispose=()=>{if(disposed)return;disposed=true;observer.disconnect();queueMicrotask(()=>root.unmount())};
  observer.observe(document.body,{childList:true,subtree:true,attributes:true,attributeFilter:["disabled","hidden"]});refresh();
  return {refresh,dispose};
}
