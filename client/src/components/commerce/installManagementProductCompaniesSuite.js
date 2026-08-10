import React from "react";
import {createRoot} from "react-dom/client";
import ManagementProductCompaniesPanel from "./ManagementProductCompaniesPanel.jsx";

let root=null;let host=null;
const text=node=>String(node?.textContent||"").trim();

export function installManagementProductCompaniesSuite(api){
  const suite=document.querySelector(".management-catalog-host .management-suite");const tabs=suite?.querySelector(".mg-tabs");if(!suite||!tabs)return;
  const buttons=[...tabs.querySelectorAll("button")];const categoryButton=buttons.find(b=>text(b)==="Κατηγορίες ειδών");const vatButton=buttons.find(b=>text(b)==="Τμήματα ΦΠΑ");const expenseButton=buttons.find(b=>text(b)==="Κατηγορίες εξόδων");const companyButton=buttons.find(b=>text(b)==="Εταιρείες");if(!categoryButton||!companyButton)return;
  companyButton.disabled=false;companyButton.removeAttribute("disabled");companyButton.title="Εταιρείες";
  if(!suite.querySelector(":scope > .management-company-host")){const el=document.createElement("div");el.className="management-company-host";tabs.insertAdjacentElement("afterend",el)}
  const currentHost=suite.querySelector(":scope > .management-company-host");
  const clearActive=()=>{suite.classList.remove("management-company-active");companyButton.classList.remove("active")};
  const closeCompany=()=>{clearActive();categoryButton.classList.add("active")};
  const render=()=>{const storeSelect=document.querySelector(".commerce-hub > .panel label select");const store={id:storeSelect?.value||"",name:storeSelect?.options?.[storeSelect.selectedIndex]?.text||"Κατάστημα"};if(!root||host!==currentHost){root?.unmount?.();root=createRoot(currentHost);host=currentHost}root.render(React.createElement(ManagementProductCompaniesPanel,{api,store,onClose:closeCompany}))};
  if(companyButton.dataset.mpcoBound!=="1")companyButton.addEventListener("click",event=>{event.preventDefault();event.stopPropagation();suite.classList.remove("management-vat-active","management-expense-active");categoryButton.classList.remove("active");vatButton?.classList.remove("active");expenseButton?.classList.remove("active");suite.classList.add("management-company-active");companyButton.classList.add("active");render()},{capture:false}),companyButton.dataset.mpcoBound="1";
  for(const button of [categoryButton,vatButton,expenseButton].filter(Boolean)){if(button.dataset.mpcoBound!=="1"){button.dataset.mpcoBound="1";button.addEventListener("click",clearActive)}}
  const storeSelect=document.querySelector(".commerce-hub > .panel label select");if(storeSelect&&storeSelect.dataset.mpcoBound!=="1"){storeSelect.dataset.mpcoBound="1";storeSelect.addEventListener("change",()=>{if(suite.classList.contains("management-company-active"))render()})}
}
