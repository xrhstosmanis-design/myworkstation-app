import React from "react";
import {createRoot} from "react-dom/client";
import ManagementModifiersPanel from "./ManagementModifiersPanel.jsx";

let root=null;let host=null;
const text=node=>String(node?.textContent||"").trim();

export function installManagementModifiersSuite(api){
  const suite=document.querySelector(".management-catalog-host .management-suite");const tabs=suite?.querySelector(".mg-tabs");if(!suite||!tabs)return;
  const buttons=[...tabs.querySelectorAll("button")];const categoryButton=buttons.find(b=>text(b)==="Κατηγορίες ειδών");const vatButton=buttons.find(b=>text(b)==="Τμήματα ΦΠΑ");const expenseButton=buttons.find(b=>text(b)==="Κατηγορίες εξόδων");const companyButton=buttons.find(b=>text(b)==="Εταιρείες");const modifierButton=buttons.find(b=>text(b)==="Modifiers");if(!categoryButton||!modifierButton)return;
  modifierButton.disabled=false;modifierButton.removeAttribute("disabled");modifierButton.title="Modifiers";
  if(!suite.querySelector(":scope > .management-modifier-host")){const el=document.createElement("div");el.className="management-modifier-host";tabs.insertAdjacentElement("afterend",el)}
  const currentHost=suite.querySelector(":scope > .management-modifier-host");
  const clearActive=()=>{suite.classList.remove("management-modifier-active");modifierButton.classList.remove("active")};
  const closeModifiers=()=>{clearActive();categoryButton.classList.add("active")};
  const render=()=>{if(!root||host!==currentHost){root?.unmount?.();root=createRoot(currentHost);host=currentHost}root.render(React.createElement(ManagementModifiersPanel,{api,onClose:closeModifiers}))};
  if(modifierButton.dataset.mmodBound!=="1"){modifierButton.dataset.mmodBound="1";modifierButton.addEventListener("click",event=>{event.preventDefault();event.stopPropagation();suite.classList.remove("management-vat-active","management-expense-active","management-company-active");for(const b of [categoryButton,vatButton,expenseButton,companyButton].filter(Boolean))b.classList.remove("active");suite.classList.add("management-modifier-active");modifierButton.classList.add("active");render()})}
  for(const button of [categoryButton,vatButton,expenseButton,companyButton].filter(Boolean)){if(button.dataset.mmodBound!=="1"){button.dataset.mmodBound="1";button.addEventListener("click",clearActive)}}
}
