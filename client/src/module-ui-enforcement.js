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

const normalizeText=value=>String(value||"").replace(/\s+/g," ").trim();

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

function renamePersonnelLeaves(button){
  const text=normalizeText(button.textContent);
  if(text!=="Άδειες")return;
  const textNode=[...button.childNodes].find(node=>node.nodeType===Node.TEXT_NODE&&normalizeText(node.textContent));
  if(textNode)textNode.textContent="Άδειες προσωπικού";
  else button.append(document.createTextNode("Άδειες προσωπικού"));
}

function applyRules(activeModules){
  const active=new Set(activeModules||[]);
  for(const button of document.querySelectorAll("aside nav button")){
    renamePersonnelLeaves(button);
    const text=normalizeText(button.textContent);
    const rule=navRules.find(item=>text===item.label||text.startsWith(item.label));
    if(rule)setVisibility(button,active.has(rule.module));
  }

  const candidates=document.querySelectorAll("h1,h2,h3,h4,button,b,strong");
  for(const element of candidates){
    const text=normalizeText(element.textContent);
    const rule=sectionRules.find(item=>text===item.text||text.startsWith(item.text));
    if(rule)setVisibility(nearestContainer(element),active.has(rule.module));
  }

  for(const card of document.querySelectorAll(".card")){
    const text=normalizeText(card.textContent);
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
  try{activeModules=JSON.parse(localStorage.getItem("activeModules")||"[]")}catch{}
  let activeSet=new Set(activeModules);
  let loadedToken="";
  let loadedAt=0;
  let licensePromise=null;

  const loadLicense=async(token,{force=false}={})=>{
    if(!token){
      activeModules=[];
      activeSet=new Set();
      loadedToken="";
      loadedAt=0;
      localStorage.removeItem("activeModules");
      applyRules(activeModules);
      return;
    }
    const fresh=token===loadedToken&&Date.now()-loadedAt<3000;
    if(!force&&fresh)return;
    if(licensePromise)return licensePromise;
    licensePromise=(async()=>{
      const response=await originalFetch(`/api/license/current?_=${Date.now()}`,{
        cache:"no-store",
        headers:{Authorization:`Bearer ${token}`,"Cache-Control":"no-cache"}
      });
      if(!response.ok)throw new Error("license unavailable");
      const data=await response.json();
      activeModules=data.activeModules||[];
      activeSet=new Set(activeModules);
      loadedToken=token;
      loadedAt=Date.now();
      localStorage.setItem("activeModules",JSON.stringify(activeModules));
      applyRules(activeModules);
      window.dispatchEvent(new CustomEvent("myworkstation:modules-updated",{detail:{activeModules}}));
    })().catch(()=>{
      applyRules(activeModules);
    }).finally(()=>{licensePromise=null});
    return licensePromise;
  };

  window.fetch=async(input,init={})=>{
    const requestUrl=typeof input==="string"?input:input?.url||"";
    const url=new URL(requestUrl,window.location.origin);
    const method=String(init.method||(typeof input!=="string"&&input?.method)||"GET").toUpperCase();
    const token=localStorage.getItem("token")||"";

    if(url.pathname!=="/api/license/current"&&token){
      await loadLicense(token,{force:Date.now()-loadedAt>3000});
    }

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
    loadLicense(token,{force:true});
  };
  const onVisible=()=>{if(document.visibilityState==="visible")refresh()};

  applyRules(activeModules);
  refresh();
  const timer=setInterval(refresh,5000);
  window.addEventListener("focus",refresh);
  window.addEventListener("pageshow",refresh);
  document.addEventListener("visibilitychange",onVisible);
  window.addEventListener("beforeunload",()=>{
    clearInterval(timer);
    observer.disconnect();
    window.removeEventListener("focus",refresh);
    window.removeEventListener("pageshow",refresh);
    document.removeEventListener("visibilitychange",onVisible);
  },{once:true});
}
