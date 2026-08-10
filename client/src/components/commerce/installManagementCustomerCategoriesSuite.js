import React from "react";
import {createRoot} from "react-dom/client";
import ManagementCustomerCategoriesPanel from "./ManagementCustomerCategoriesPanel.jsx";

let root=null;let host=null;
const text=node=>String(node?.textContent||"").trim();

export function installManagementCustomerCategoriesSuite(api){
  const suite=document.querySelector(".management-catalog-host .management-suite");const tabs=suite?.querySelector(".mg-tabs");if(!suite||!tabs)return;
  const buttons=[...tabs.querySelectorAll("button")];
  const categoryButton=buttons.find(b=>text(b)==="Κατηγορίες ειδών"),vatButton=buttons.find(b=>text(b)==="Τμήματα ΦΠΑ"),expenseButton=buttons.find(b=>text(b)==="Κατηγορίες εξόδων"),companyButton=buttons.find(b=>text(b)==="Εταιρείες"),modifierButton=buttons.find(b=>text(b)==="Modifiers"),customerCategoryButton=buttons.find(b=>text(b)==="Κατηγορίες πελατών");
  if(!categoryButton||!customerCategoryButton)return;
  customerCategoryButton.disabled=false;customerCategoryButton.removeAttribute("disabled");customerCategoryButton.title="Κατηγορίες πελατών";
  if(!suite.querySelector(":scope > .management-customer-category-host")){const el=document.createElement("div");el.className="management-customer-category-host";tabs.insertAdjacentElement("afterend",el)}
  const currentHost=suite.querySelector(":scope > .management-customer-category-host");
  const clearActive=()=>{suite.classList.remove("management-customer-category-active");customerCategoryButton.classList.remove("active")};
  const closePanel=()=>{clearActive();categoryButton.classList.add("active")};
  const render=()=>{if(!root||host!==currentHost){root?.unmount?.();root=createRoot(currentHost);host=currentHost}root.render(React.createElement(ManagementCustomerCategoriesPanel,{api,onClose:closePanel}))};
  if(customerCategoryButton.dataset.mccBound!=="1"){customerCategoryButton.dataset.mccBound="1";customerCategoryButton.addEventListener("click",event=>{event.preventDefault();event.stopPropagation();suite.classList.remove("management-vat-active","management-expense-active","management-company-active","management-modifier-active");for(const b of [categoryButton,vatButton,expenseButton,companyButton,modifierButton].filter(Boolean))b.classList.remove("active");suite.classList.add("management-customer-category-active");customerCategoryButton.classList.add("active");render()})}
  for(const button of [categoryButton,vatButton,expenseButton,companyButton,modifierButton].filter(Boolean)){if(button.dataset.mccBound!=="1"){button.dataset.mccBound="1";button.addEventListener("click",clearActive)}}
}
