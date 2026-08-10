import React from "react";
import {createRoot} from "react-dom/client";
import ManagementBusinessUnitsPanel from "./ManagementBusinessUnitsPanel.jsx";

let root=null;let host=null;
const text=node=>String(node?.textContent||"").trim();
export function installManagementBusinessUnitsSuite(api){
  const suite=document.querySelector(".management-catalog-host .management-suite");const tabs=suite?.querySelector(".mg-tabs");if(!suite||!tabs)return;
  const buttons=[...tabs.querySelectorAll("button")];
  const categoryButton=buttons.find(b=>text(b)==="Κατηγορίες ειδών"),bankButton=buttons.find(b=>text(b)==="Τράπεζες"),shippingButton=buttons.find(b=>text(b)==="Τρόποι αποστολής"),terminalButton=buttons.find(b=>text(b)==="PoS τερματικά");
  if(!categoryButton||!bankButton||!shippingButton||!terminalButton)return;
  for(const b of [bankButton,shippingButton,terminalButton]){b.disabled=false;b.removeAttribute("disabled")}
  bankButton.title="Τράπεζες";shippingButton.title="Τρόποι αποστολής";terminalButton.title="PoS τερματικά";
  if(!suite.querySelector(":scope > .management-business-unit-host")){const el=document.createElement("div");el.className="management-business-unit-host";tabs.insertAdjacentElement("afterend",el)}
  const currentHost=suite.querySelector(":scope > .management-business-unit-host");
  const clearActive=()=>{suite.classList.remove("management-business-unit-active");bankButton.classList.remove("active");shippingButton.classList.remove("active");terminalButton.classList.remove("active")};
  const closePanel=()=>{clearActive();categoryButton.classList.add("active")};
  const render=mode=>{if(!root||host!==currentHost){root?.unmount?.();root=createRoot(currentHost);host=currentHost}root.render(React.createElement(ManagementBusinessUnitsPanel,{api,mode,onClose:closePanel}))};
  const activate=(button,mode)=>event=>{event.preventDefault();event.stopPropagation();suite.classList.remove("management-vat-active","management-expense-active","management-company-active","management-modifier-active","management-customer-category-active","management-profession-active");for(const b of buttons)b.classList.remove("active");suite.classList.add("management-business-unit-active");button.classList.add("active");render(mode)};
  if(bankButton.dataset.mbuBound!=="1"){bankButton.dataset.mbuBound="1";bankButton.addEventListener("click",activate(bankButton,"banks"))}
  if(shippingButton.dataset.mbuBound!=="1"){shippingButton.dataset.mbuBound="1";shippingButton.addEventListener("click",activate(shippingButton,"shipping"))}
  if(terminalButton.dataset.mbuBound!=="1"){terminalButton.dataset.mbuBound="1";terminalButton.addEventListener("click",activate(terminalButton,"terminals"))}
  for(const button of buttons.filter(b=>b!==bankButton&&b!==shippingButton&&b!==terminalButton)){if(button.dataset.mbuBound!=="1"){button.dataset.mbuBound="1";button.addEventListener("click",clearActive)}}
}
