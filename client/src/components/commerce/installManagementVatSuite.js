import React from "react";
import {createRoot} from "react-dom/client";
import ManagementVatDepartmentsPanel from "./ManagementVatDepartmentsPanel.jsx";

let root=null;let host=null;
const text=node=>String(node?.textContent||"").trim();

export function installManagementVatSuite(api){
  const suite=document.querySelector(".management-catalog-host .management-suite");
  const tabs=suite?.querySelector(".mg-tabs");
  if(!suite||!tabs)return;
  const buttons=[...tabs.querySelectorAll("button")];
  const categoryButton=buttons.find(b=>text(b)==="Κατηγορίες ειδών");
  const vatButton=buttons.find(b=>text(b)==="Τμήματα ΦΠΑ");
  if(!categoryButton||!vatButton)return;
  vatButton.disabled=false;vatButton.removeAttribute("disabled");vatButton.title="Τμήματα ΦΠΑ";
  if(!suite.querySelector(":scope > .management-vat-host")){
    const el=document.createElement("div");el.className="management-vat-host";tabs.insertAdjacentElement("afterend",el);
  }
  const currentHost=suite.querySelector(":scope > .management-vat-host");
  const closeVat=()=>{suite.classList.remove("management-vat-active");vatButton.classList.remove("active");categoryButton.classList.add("active")};
  const render=()=>{
    const storeSelect=document.querySelector(".commerce-hub > .panel label select");const store={id:storeSelect?.value||"",name:storeSelect?.options?.[storeSelect.selectedIndex]?.text||"Κατάστημα"};
    if(!root||host!==currentHost){root?.unmount?.();root=createRoot(currentHost);host=currentHost}
    root.render(React.createElement(ManagementVatDepartmentsPanel,{api,store,onClose:closeVat}));
  };
  if(vatButton.dataset.mvatBound!=="1"){
    vatButton.dataset.mvatBound="1";
    vatButton.addEventListener("click",event=>{event.preventDefault();event.stopPropagation();suite.classList.add("management-vat-active");categoryButton.classList.remove("active");vatButton.classList.add("active");render()});
  }
  if(categoryButton.dataset.mvatBound!=="1"){
    categoryButton.dataset.mvatBound="1";categoryButton.addEventListener("click",()=>closeVat());
  }
  const storeSelect=document.querySelector(".commerce-hub > .panel label select");
  if(storeSelect&&storeSelect.dataset.mvatBound!=="1"){
    storeSelect.dataset.mvatBound="1";storeSelect.addEventListener("change",()=>{if(suite.classList.contains("management-vat-active"))render()});
  }
}
