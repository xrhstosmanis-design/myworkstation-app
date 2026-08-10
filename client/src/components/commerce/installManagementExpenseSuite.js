import React from "react";
import {createRoot} from "react-dom/client";
import ManagementExpenseCategoriesPanel from "./ManagementExpenseCategoriesPanel.jsx";

let root=null;let host=null;
const text=node=>String(node?.textContent||"").trim();

export function installManagementExpenseSuite(api){
  const suite=document.querySelector(".management-catalog-host .management-suite");
  const tabs=suite?.querySelector(".mg-tabs");
  if(!suite||!tabs)return;
  const buttons=[...tabs.querySelectorAll("button")];
  const categoryButton=buttons.find(b=>text(b)==="Κατηγορίες ειδών");
  const vatButton=buttons.find(b=>text(b)==="Τμήματα ΦΠΑ");
  const expenseButton=buttons.find(b=>text(b)==="Κατηγορίες εξόδων");
  if(!categoryButton||!expenseButton)return;
  expenseButton.disabled=false;expenseButton.removeAttribute("disabled");expenseButton.title="Κατηγορίες εξόδων";
  if(!suite.querySelector(":scope > .management-expense-host")){const el=document.createElement("div");el.className="management-expense-host";tabs.insertAdjacentElement("afterend",el)}
  const currentHost=suite.querySelector(":scope > .management-expense-host");
  const clearActive=()=>{suite.classList.remove("management-expense-active");expenseButton.classList.remove("active")};
  const closeExpense=()=>{clearActive();categoryButton.classList.add("active")};
  const render=()=>{if(!root||host!==currentHost){root?.unmount?.();root=createRoot(currentHost);host=currentHost}root.render(React.createElement(ManagementExpenseCategoriesPanel,{api,onClose:closeExpense}))};
  if(expenseButton.dataset.mexpBound!=="1"){
    expenseButton.dataset.mexpBound="1";expenseButton.addEventListener("click",event=>{event.preventDefault();event.stopPropagation();suite.classList.remove("management-vat-active");categoryButton.classList.remove("active");vatButton?.classList.remove("active");suite.classList.add("management-expense-active");expenseButton.classList.add("active");render()});
  }
  if(categoryButton.dataset.mexpBound!=="1"){categoryButton.dataset.mexpBound="1";categoryButton.addEventListener("click",()=>clearActive())}
  if(vatButton&&vatButton.dataset.mexpBound!=="1"){vatButton.dataset.mexpBound="1";vatButton.addEventListener("click",()=>clearActive())}
}
