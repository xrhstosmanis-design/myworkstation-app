import React from "react";
import {createRoot} from "react-dom/client";
import PilotReportLauncherLive from "./components/cloud/PilotReportLauncherLive.jsx";
import StoreOperatorApp from "./components/store/StoreOperatorApp.jsx";
import PlatformAdminApp from "./components/platform/PlatformAdminApp.jsx";
import CommercialLicenseCenter from "./components/platform/CommercialLicenseCenter.jsx";
import MasterCatalogCenter from "./components/platform/MasterCatalogCenter.jsx";
import KatTestCenter from "./components/platform/KatTestCenter.jsx";
import CommerceLauncher from "./components/commerce/CommerceLauncher.jsx";
import CommercialPosApp from "./components/commerce/CommercialPosApp.jsx";
import {installModuleUiEnforcement} from "./module-ui-enforcement.js";
import {installOwnerPasswordChangeGate} from "./owner-password-change.js";
import "./components/platform/platform-security.css";
import "./components/platform/commercial-license.css";
import "./components/platform/platform-audit.css";
import "./styles.css";

const platformMatch=window.location.pathname.match(/^\/platform-admin\/?$/);
const katTestMatch=window.location.pathname.match(/^\/platform-admin\/kat-test\/?$/);
const posMatch=window.location.pathname.match(/^\/pos\/([^/]+)\/?$/);
const storeMatch=window.location.pathname.match(/^\/store\/([^/]+)\/?$/);

const storeApi=async(path,options={})=>{
  const token=localStorage.getItem("token");
  const response=await fetch(path,{
    ...options,
    headers:{"Content-Type":"application/json",...(token?{Authorization:`Bearer ${token}`}:{}) ,...(options.headers||{})}
  });
  const text=await response.text();
  let data={};
  if(text){
    try{data=JSON.parse(text)}catch{data={error:"Ο server επέστρεψε μη αναμενόμενη απάντηση."}}
  }
  if(response.status===401&&(storeMatch||posMatch)){
    localStorage.removeItem("token");
    localStorage.removeItem("storeOperatorSession");
    localStorage.removeItem("user");
    window.location.reload();
  }
  if(!response.ok)throw new Error(data.error||`Σφάλμα ${response.status}`);
  return data;
};

const KatTestQuickAccess=()=> <a href="/platform-admin/kat-test" style={{position:"fixed",right:24,top:86,zIndex:9999,display:"inline-flex",alignItems:"center",gap:8,padding:"13px 20px",borderRadius:12,background:"#0ea5e9",color:"#fff",fontWeight:900,textDecoration:"none",boxShadow:"0 10px 25px rgba(14,165,233,.28)",border:"2px solid rgba(255,255,255,.85)"}}>KAT TEST</a>;

if(katTestMatch){
  document.title="MyWorkStation KAT TEST";
  createRoot(document.getElementById("root")).render(<KatTestCenter/>);
}else if(platformMatch){
  document.title="MyWorkStation Platform Admin";
  createRoot(document.getElementById("root")).render(<><PlatformAdminApp/><CommercialLicenseCenter/><MasterCatalogCenter/><KatTestQuickAccess/></>);
}else if(posMatch){
  const storeId=decodeURIComponent(posMatch[1]);
  document.title="MyWorkStation POS";
  createRoot(document.getElementById("root")).render(<CommercialPosApp api={storeApi} storeId={storeId}/>);
}else if(storeMatch){
  const storeId=decodeURIComponent(storeMatch[1]);
  document.title="MyWorkStation Store Mode";
  createRoot(document.getElementById("root")).render(<StoreOperatorApp api={storeApi} storeId={storeId}/>);
}else{
  installOwnerPasswordChangeGate();
  installModuleUiEnforcement();
  import("./main.jsx");
  const launcherRoot=document.getElementById("pilot-report-root");
  if(launcherRoot)createRoot(launcherRoot).render(<PilotReportLauncherLive/>);
  const commerceRoot=document.createElement("div");
  commerceRoot.id="commerce-root";
  document.body.appendChild(commerceRoot);
  createRoot(commerceRoot).render(<CommerceLauncher/>);
}
