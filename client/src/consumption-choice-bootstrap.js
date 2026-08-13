const state={kind:"WASTE"};

function label(){return state.kind==="WASTE"?"ΦΥΡΑ":"ΙΔΙΑ ΚΑΤΑΝΑΛΩΣΗ"}
function sync(root){
  const quantity=root.querySelector(".pos-waste-qty > b");
  if(quantity)quantity.textContent=quantity.textContent.replace(/^Ποσότητα (?:φύρας|ίδιας κατανάλωσης):/i,`Ποσότητα ${state.kind==="WASTE"?"φύρας":"ίδιας κατανάλωσης"}:`);
  const warning=root.querySelector(".pos-warning");
  if(warning)warning.textContent=state.kind==="WASTE"
    ?"Δεν εκδίδεται απόδειξη. Η ΦΥΡΑ καταγράφεται NON_FISCAL, μετράει στον τζίρο ΜΕΤΡΗΤΩΝ και αφαιρείται κανονικά από stock."
    :"Δεν εκδίδεται απόδειξη. Η ΙΔΙΑ ΚΑΤΑΝΑΛΩΣΗ καταγράφεται NON_FISCAL, ΔΕΝ μετράει στον τζίρο και αφαιρείται κανονικά από stock.";
  const action=root.querySelector(".pos-danger-action");
  if(action){
    for(const node of [...action.childNodes])if(node.nodeType===Node.TEXT_NODE&&String(node.textContent||"").includes("Καταχώριση"))node.textContent=` Καταχώριση ${label()} `;
  }
  root.querySelectorAll("[data-consumption-kind]").forEach(button=>button.classList.toggle("active",button.dataset.consumptionKind===state.kind));
}

function enhance(){
  for(const modal of document.querySelectorAll(".pos-standard-modal")){
    const title=modal.querySelector("h2");
    if(!title||!String(title.textContent||"").includes("Φύρα / Κατανάλωση προσωπικού"))continue;
    const main=modal.querySelector("main");
    if(!main)continue;
    if(!main.querySelector("[data-consumption-selector]")){
      const selector=document.createElement("div");
      selector.dataset.consumptionSelector="true";
      selector.className="pos-payment-types";
      selector.innerHTML='<button type="button" data-consumption-kind="WASTE" class="active">ΦΥΡΑ</button><button type="button" data-consumption-kind="SELF_CONSUMPTION">ΙΔΙΑ ΚΑΤΑΝΑΛΩΣΗ</button>';
      const summary=main.querySelector(".pos-waste-summary");
      main.insertBefore(selector,summary||main.firstChild);
      selector.addEventListener("click",event=>{
        const button=event.target.closest("[data-consumption-kind]");
        if(!button)return;
        state.kind=button.dataset.consumptionKind;
        sync(main);
      });
    }
    sync(main);
  }
}

const originalFetch=window.fetch.bind(window);
window.fetch=async(input,init={})=>{
  const url=typeof input==="string"?input:input?.url;
  if(url&&/\/api\/store-pos\/stores\/[^/]+\/waste(?:\?|$)/.test(url)&&String(init?.method||"GET").toUpperCase()==="POST"){
    let body={};
    try{body=JSON.parse(init.body||"{}")}catch{}
    const nextUrl=url.replace(/\/waste(?=\?|$)/,"/consumption");
    return originalFetch(nextUrl,{...init,body:JSON.stringify({...body,kind:state.kind})});
  }
  return originalFetch(input,init);
};

new MutationObserver(enhance).observe(document.documentElement,{childList:true,subtree:true});
document.addEventListener("click",()=>setTimeout(enhance,0),true);
enhance();
