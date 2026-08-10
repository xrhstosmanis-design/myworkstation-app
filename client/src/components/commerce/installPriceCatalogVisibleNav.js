const allowed=()=>{try{return ["SUPER_ADMIN","OWNER","ADMIN","MANAGER"].includes(JSON.parse(localStorage.getItem("user")||"{}").role)}catch{return false}};

const tabs=[
  ["prices","▣ Έλεγχος τιμών πώλησης"],
  ["leaflet","🎟 Προσφορές φυλλαδίου"],
  ["gifts","🎁 Προσφορές και δώρα"],
  ["wholesale","🔖 Τιμές χονδρικής"]
];
let installed=false;
let lastTab="prices";
let syncScheduled=false;

function scheduleSync(){
  if(syncScheduled)return;
  syncScheduled=true;
  requestAnimationFrame(()=>{syncScheduled=false;syncAll()});
}

function activeInternalTab(suite){
  const active=suite?.querySelector("[data-pc-tab].active");
  return active?.dataset?.pcTab||lastTab;
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
  nav.addEventListener("click",event=>{
    const button=event.target.closest("[data-price-catalog-visible-tab]");
    if(!button)return;
    event.preventDefault();
    event.stopPropagation();
    const tabId=button.dataset.priceCatalogVisibleTab;
    lastTab=tabId;
    const suite=hub.querySelector(".price-catalog-suite:not([hidden])")||hub.querySelector(".price-catalog-suite");
    const internal=suite?.querySelector(`[data-pc-tab="${tabId}"]`);
    if(!internal){
      console.error("Price catalog internal tab missing",tabId);
      return;
    }
    internal.click();
    scheduleSync();
  });
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
  lastTab=activeInternalTab(suite);
  nav.querySelectorAll("[data-price-catalog-visible-tab]").forEach(button=>{
    const selected=button.dataset.priceCatalogVisibleTab===lastTab;
    button.classList.toggle("active",selected);
    button.setAttribute("aria-selected",selected?"true":"false");
  });
}

function syncAll(){document.querySelectorAll(".commerce-hub").forEach(syncHub)}

export function installPriceCatalogVisibleNav(){
  if(installed||!allowed())return;
  installed=true;
  document.addEventListener("click",scheduleSync,true);
  window.addEventListener("myworkstation:modules-updated",scheduleSync);
  syncAll();
}
