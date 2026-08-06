const navRules=[
  {label:"Προσωπικό",module:"PERSONNEL"},
  {label:"Βάρδιες",module:"SHIFTS"},
  {label:"Άδειες",module:"LEAVES"}
];

const sectionRules=[
  {text:"Προσωπική είσοδος εργαζομένων",module:"STORE_MODE"},
  {text:"Συναλλαγές Βάρδιας",module:"CASH_CONTROL"},
  {text:"Έλεγχος Ταμείου",module:"CASH_CONTROL"},
  {text:"Αναφορά Πιλότου",module:"PILOT_REPORT"}
];

function nearestContainer(element){
  return element.closest("section,article,.panel,.cloud-section,.store-cloud-section")||element.parentElement;
}

function setVisibility(element,visible){
  if(!element)return;
  if(visible){
    if(element.dataset.moduleHidden==="true"){
      element.style.removeProperty("display");
      delete element.dataset.moduleHidden;
    }
  }else{
    element.style.setProperty("display","none","important");
    element.dataset.moduleHidden="true";
  }
}

function applyRules(activeModules){
  const active=new Set(activeModules||[]);
  for(const button of document.querySelectorAll("aside nav button")){
    const text=button.textContent.replace(/\s+/g," ").trim();
    const rule=navRules.find(item=>text===item.label||text.startsWith(item.label));
    if(rule)setVisibility(button,active.has(rule.module));
  }

  const candidates=document.querySelectorAll("h1,h2,h3,h4,button,b,strong");
  for(const element of candidates){
    const text=element.textContent.replace(/\s+/g," ").trim();
    const rule=sectionRules.find(item=>text===item.text||text.startsWith(item.text));
    if(rule)setVisibility(nearestContainer(element),active.has(rule.module));
  }

  for(const card of document.querySelectorAll(".card")){
    const text=card.textContent.replace(/\s+/g," ").trim();
    if(text.startsWith("Ενεργοί εργαζόμενοι")||text.startsWith("Έκτακτοι"))setVisibility(card,active.has("PERSONNEL"));
    if(text.startsWith("Ακάλυπτες βάρδιες"))setVisibility(card,active.has("SHIFTS"));
  }
}

function moduleForApiPath(path){
  if(path.startsWith("/api/employees"))return "PERSONNEL";
  if(path.startsWith("/api/shifts")||path.startsWith("/api/schedules"))return "SHIFTS";
  if(path.startsWith("/api/leaves")||path.startsWith("/api/availability"))return "LEAVES";
  if(path.startsWith("/api/operators"))return "STORE_MODE";
  if(path.startsWith("/api/cash")||path.startsWith("/api/transactions"))return "CASH_CONTROL";
  if(path.startsWith("/api/pilot"))return "PILOT_REPORT";
  return null;
}

function disabledReadFallback(path){
  if(path.startsWith("/api/employees"))return [];
  if(path.startsWith("/api/shifts"))return [];
  if(path.startsWith("/api/schedules/latest"))return null;
  if(path.startsWith("/api/leaves"))return [];
  if(path.startsWith("/api/availability"))return [];
  return null;
}

export function installModuleUiEnforcement(){
  if(window.__myWorkStationModuleEnforcement)return;
  window.__myWorkStationModuleEnforcement=true;

  const originalFetch=window.fetch.bind(window);
  let activeModules=[];
  let activeSet=new Set();
  let loadedToken="";
  let licensePromise=null;

  const loadLicense=async token=>{
    if(!token){
      activeModules=[];
      activeSet=new Set();
      loadedToken="";
      localStorage.removeItem("activeModules");
      return;
    }
    if(token===loadedToken)return;
    if(licensePromise)return licensePromise;
    licensePromise=(async()=>{
      const response=await originalFetch("/api/license/current",{headers:{Authorization:`Bearer ${token}`}});
      if(!response.ok)throw new Error("license unavailable");
      const data=await response.json();
      activeModules=data.activeModules||[];
      activeSet=new Set(activeModules);
      loadedToken=token;
      localStorage.setItem("activeModules",JSON.stringify(activeModules));
      applyRules(activeModules);
    })().catch(()=>{
      activeModules=[];
      activeSet=new Set();
      loadedToken=token;
      applyRules(activeModules);
    }).finally(()=>{licensePromise=null});
    return licensePromise;
  };

  window.fetch=async(input,init={})=>{
    const requestUrl=typeof input==="string"?input:input?.url||"";
    const url=new URL(requestUrl,window.location.origin);
    const method=String(init.method||(typeof input!=="string"&&input?.method)||"GET").toUpperCase();
    const token=localStorage.getItem("token")||"";

    if(url.pathname!=="/api/license/current"&&token)await loadLicense(token);

    const requiredModule=moduleForApiPath(url.pathname);
    if(method==="GET"&&requiredModule&&!activeSet.has(requiredModule)){
      const fallback=disabledReadFallback(url.pathname);
      return new Response(JSON.stringify(fallback),{status:200,headers:{"Content-Type":"application/json"}});
    }
    return originalFetch(input,init);
  };

  const observer=new MutationObserver(()=>applyRules(activeModules));
  observer.observe(document.documentElement,{childList:true,subtree:true});

  const refresh=()=>{
    const token=localStorage.getItem("token")||"";
    if(token!==loadedToken)loadLicense(token);
    else applyRules(activeModules);
  };
  refresh();
  const timer=setInterval(refresh,700);
  window.addEventListener("beforeunload",()=>{clearInterval(timer);observer.disconnect()},{once:true});
}
