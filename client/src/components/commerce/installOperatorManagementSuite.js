import React from "react";
import {createRoot} from "react-dom/client";
import OperatorManagementPanel from "./OperatorManagementPanel.jsx";

let mountedRoot=null;
let mountedHost=null;

function activeModules(){try{return JSON.parse(localStorage.getItem("activeModules")||"[]")}catch{return []}}
function clearSuiteClasses(hub){[...hub.classList].filter(name=>name!=="commerce-hub"&&name.endsWith("-active")).forEach(name=>hub.classList.remove(name))}

export function installOperatorManagementSuite(api){
  const hub=document.querySelector(".commerce-hub");
  const strip=hub?.querySelector(".commerce-module-strip");
  if(!hub||!strip||strip.querySelector("[data-operator-management-launch]"))return;
  const launch=document.createElement("button");
  launch.type="button";launch.dataset.operatorManagementLaunch="1";launch.textContent="👥 Χειριστές";
  const syncDisabled=()=>{const enabled=activeModules().includes("STORE_MODE");launch.disabled=!enabled;launch.classList.toggle("locked",!enabled);launch.title=enabled?"Διαχείριση χειριστών":"Απαιτείται ενεργό Store Mode"};
  syncDisabled();window.addEventListener("myworkstation:modules-updated",syncDisabled);
  strip.appendChild(launch);

  let host=hub.querySelector(".operator-management-host");
  if(!host){host=document.createElement("div");host.className="operator-management-host";hub.appendChild(host)}
  const storeSelect=hub.querySelector(":scope > .panel label select");
  const render=()=>{
    if(!storeSelect?.value)return;
    const store={id:storeSelect.value,name:storeSelect.options[storeSelect.selectedIndex]?.text||"Κατάστημα"};
    if(!mountedRoot||mountedHost!==host){mountedRoot?.unmount?.();mountedRoot=createRoot(host);mountedHost=host}
    mountedRoot.render(<OperatorManagementPanel api={api} store={store} onClose={()=>{hub.classList.remove("operator-management-active");launch.classList.remove("active")}}/>);
  };
  launch.addEventListener("click",()=>{if(launch.disabled)return;clearSuiteClasses(hub);hub.classList.add("operator-management-active");launch.classList.add("active");render()});
  strip.addEventListener("click",event=>{const button=event.target.closest("button");if(button&&button!==launch){hub.classList.remove("operator-management-active");launch.classList.remove("active")}},true);
  storeSelect?.addEventListener("change",()=>{if(hub.classList.contains("operator-management-active"))render()});
}
