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

export function installModuleUiEnforcement(){
  let lastToken;
  let modules=[];
  let loading=false;

  const refresh=async()=>{
    const token=localStorage.getItem("token")||"";
    if(!token){
      lastToken="";
      modules=[];
      applyRules([]);
      return;
    }
    if(token===lastToken||loading)return;
    loading=true;
    try{
      const response=await fetch("/api/license/current",{headers:{Authorization:`Bearer ${token}`}});
      if(!response.ok)throw new Error("license unavailable");
      const data=await response.json();
      modules=data.activeModules||[];
      lastToken=token;
      localStorage.setItem("activeModules",JSON.stringify(modules));
      applyRules(modules);
    }catch{
      modules=[];
      applyRules(modules);
    }finally{loading=false}
  };

  const observer=new MutationObserver(()=>applyRules(modules));
  observer.observe(document.documentElement,{childList:true,subtree:true});
  refresh();
  const timer=setInterval(refresh,700);
  window.addEventListener("beforeunload",()=>{clearInterval(timer);observer.disconnect()},{once:true});
}
