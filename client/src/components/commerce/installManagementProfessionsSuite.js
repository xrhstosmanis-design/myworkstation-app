import React from "react";
import {createRoot} from "react-dom/client";
import ManagementProfessionsPanel from "./ManagementProfessionsPanel.jsx";

let root=null;let host=null;
const text=node=>String(node?.textContent||"").trim();
export function installManagementProfessionsSuite(api){
  const suite=document.querySelector(".management-catalog-host .management-suite");const tabs=suite?.querySelector(".mg-tabs");if(!suite||!tabs)return;
  const buttons=[...tabs.querySelectorAll("button")];
  const categoryButton=buttons.find(b=>text(b)==="Κατηγορίες ειδών"),vatButton=buttons.find(b=>text(b)==="Τμήματα ΦΠΑ"),expenseButton=buttons.find(b=>text(b)==="Κατηγορίες εξόδων"),companyButton=buttons.find(b=>text(b)==="Εταιρείες"),modifierButton=buttons.find(b=>text(b)==="Modifiers"),customerCategoryButton=buttons.find(b=>text(b)==="Κατηγορίες πελατών"),professionButton=buttons.find(b=>text(b)==="Επαγγέλματα");
  if(!categoryButton||!professionButton)return;
  professionButton.disabled=false;professionButton.removeAttribute("disabled");professionButton.title="Επαγγέλματα";
  if(!suite.querySelector(":scope > .management-profession-host")){const el=document.createElement("div");el.className="management-profession-host";tabs.insertAdjacentElement("afterend",el)}
  const currentHost=suite.querySelector(":scope > .management-profession-host");
  const clearActive=()=>{suite.classList.remove("management-profession-active");professionButton.classList.remove("active")};
  const closePanel=()=>{clearActive();categoryButton.classList.add("active")};
  const render=()=>{if(!root||host!==currentHost){root?.unmount?.();root=createRoot(currentHost);host=currentHost}root.render(React.createElement(ManagementProfessionsPanel,{api,onClose:closePanel}))};
  if(professionButton.dataset.mprofBound!=="1"){professionButton.dataset.mprofBound="1";professionButton.addEventListener("click",event=>{event.preventDefault();event.stopPropagation();suite.classList.remove("management-vat-active","management-expense-active","management-company-active","management-modifier-active","management-customer-category-active");for(const b of [categoryButton,vatButton,expenseButton,companyButton,modifierButton,customerCategoryButton].filter(Boolean))b.classList.remove("active");suite.classList.add("management-profession-active");professionButton.classList.add("active");render()})}
  for(const button of [categoryButton,vatButton,expenseButton,companyButton,modifierButton,customerCategoryButton].filter(Boolean)){if(button.dataset.mprofBound!=="1"){button.dataset.mprofBound="1";button.addEventListener("click",clearActive)}}
}
