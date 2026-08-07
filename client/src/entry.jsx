import React from "react";
import {createRoot} from "react-dom/client";
import PilotReportLauncherLive from "./components/cloud/PilotReportLauncherLive.jsx";
import StoreOperatorApp from "./components/store/StoreOperatorApp.jsx";
import PlatformAdminApp from "./components/platform/PlatformAdminApp.jsx";
import CommercialLicenseCenter from "./components/platform/CommercialLicenseCenter.jsx";
import PlatformAuditCenter from "./components/platform/PlatformAuditCenter.jsx";
import MasterCatalogCenter from "./components/platform/MasterCatalogCenter.jsx";
import CommerceLauncher from "./components/commerce/CommerceLauncher.jsx";
import {installModuleUiEnforcement} from "./module-ui-enforcement.js";
import {installOwnerPasswordChangeGate} from "./owner-password-change.js";
import "./components/platform/platform-security.css";
import "./components/platform/commercial-license.css";
import "./components/platform/platform-audit.css";
import "./styles.css";

const platformMatch=window.location.pathname.match(/^\/platform-admin\/?$/);
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
  if(!response.ok)throw new Error(data.error||`Σφάλμα ${response.status}`);
  return data;
};

if(platformMatch){
  document.title="MyWorkStation Platform Admin";
  createRoot(document.getElementById("root")).render(<><PlatformAdminApp/><CommercialLicenseCenter/><PlatformAuditCenter/><MasterCatalogCenter/></>);
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
