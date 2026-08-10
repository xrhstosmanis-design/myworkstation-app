import React from "react";
import {createRoot} from "react-dom/client";
import ManagementCategoriesPanel from "./ManagementCategoriesPanel.jsx";

let mountedRoot=null;
let mountedHost=null;

function clearSuiteClasses(hub){[...hub.classList].filter(name=>name!=="commerce-hub"&&name.endsWith("-active")).forEach(name=>hub.classList.remove(name))}

export function installManagementCategoriesSuite(api){
  const hub=document.querySelector(".commerce-hub");
  const strip=hub?.querySelector(".commerce-module-strip");
  if(!hub||!strip||strip.querySelector("[data-management-categories-launch]"))return;
  const launch=document.createElement("button");
  launch.type="button";launch.dataset.managementCategoriesLaunch="1";launch.textContent="⚙️ Διαχείριση";launch.title="Κατηγορίες ειδών και λοιπή διαχείριση";
  strip.insertBefore(launch,strip.children[1]||null);
  let host=hub.querySelector(".management-catalog-host");
  if(!host){host=document.createElement("div");host.className="management-catalog-host";hub.appendChild(host)}
  const storeSelect=hub.querySelector(":scope > .panel label select");
  const close=()=>{hub.classList.remove("management-catalog-active");launch.classList.remove("active")};
  const render=()=>{
    const store={id:storeSelect?.value||"",name:storeSelect?.options?.[storeSelect.selectedIndex]?.text||"Κατάστημα"};
    if(!mountedRoot||mountedHost!==host){mountedRoot?.unmount?.();mountedRoot=createRoot(host);mountedHost=host}
    mountedRoot.render(React.createElement(ManagementCategoriesPanel,{api,store,onClose:close}));
  };
  launch.addEventListener("click",()=>{clearSuiteClasses(hub);hub.classList.add("management-catalog-active");launch.classList.add("active");render()});
  strip.addEventListener("click",event=>{const button=event.target.closest("button");if(button&&button!==launch)close()},true);
  storeSelect?.addEventListener("change",()=>{if(hub.classList.contains("management-catalog-active"))render()});
}
