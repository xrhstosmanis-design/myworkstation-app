import {installPriceCatalogControllerV2} from "./installPriceCatalogControllerV2.js";

const allowed=()=>{try{return ["SUPER_ADMIN","OWNER","ADMIN","MANAGER"].includes(JSON.parse(localStorage.getItem("user")||"{}").role)}catch{return false}};
const tabs=[
  ["prices","▣ Έλεγχος τιμών πώλησης"],
  ["leaflet","🎟 Προσφορές φυλλαδίου"],
  ["gifts","🎁 Προσφορές και δώρα"],
  ["wholesale","🔖 Τιμές χονδρικής"]
];
let installed=false;
let syncScheduled=false;

function scheduleSync(){
  if(syncScheduled)return;
  syncScheduled=true;
  requestAnimationFrame(()=>{syncScheduled=false;syncAll()});
}

function buildNav(hub,panel,strip){
  let nav=panel.querySelector(":scope > [data-price-catalog-visible-nav]");
  if(nav)return nav;
  nav=document.createElement("nav");
  nav.className="price-catalog-visible-nav";
  nav.dataset.priceCatalogVisibleNav="1";
  nav.setAttribute("aria-label","Πλοήγηση Τιμοκαταλόγου");
  nav.hidden=true;
  nav.innerHTML=tabs.map(([id,label])=>`<button type="button" data-price-catalog-visible-tab="${id}">${label}</button>`).join("");
  strip.insertAdjacentElement("afterend",nav);
  return nav;
}

function syncHub(hub){
  const strip=hub.querySelector(".commerce-module-strip");
  const launch=strip?.querySelector("[data-price-catalog-launch]");
  const panel=strip?.closest(".panel")||hub.firstElementChild;
  if(!strip||!launch||!panel)return;
  const nav=buildNav(hub,panel,strip);
  const suite=hub.querySelector(".price-catalog-suite");
  const visibleSuite=Boolean(suite&&!suite.hidden&&suite.getAttribute("hidden")===null);
  const active=visibleSuite&&launch.classList.contains("active");
  nav.hidden=!active;
  if(!active)return;
  const selected=document.querySelector(".price-catalog-visible-nav button.active")?.dataset.priceCatalogVisibleTab||"prices";
  nav.querySelectorAll("[data-price-catalog-visible-tab]").forEach(button=>{
    const isSelected=button.dataset.priceCatalogVisibleTab===selected;
    button.classList.toggle("active",isSelected);
    button.setAttribute("aria-selected",isSelected?"true":"false");
  });
}

function syncAll(){document.querySelectorAll(".commerce-hub").forEach(syncHub)}

export function installPriceCatalogVisibleNav(){
  if(installed||!allowed())return;
  installed=true;
  installPriceCatalogControllerV2();
  document.addEventListener("click",scheduleSync,true);
  window.addEventListener("myworkstation:modules-updated",scheduleSync);
  syncAll();
}
