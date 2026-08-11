const esc=value=>String(value??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[c]));
const num=value=>Number(String(value??0).replace(",","."))||0;
let context=null;

async function api(path,options={}){
  const token=localStorage.getItem("token");
  const response=await fetch(path,{...options,headers:{"Content-Type":"application/json",...(token?{Authorization:`Bearer ${token}`}:{}) ,...(options.headers||{})}});
  const data=await response.json().catch(()=>({}));
  if(!response.ok){const error=new Error(data.error||`Σφάλμα ${response.status}`);error.code=data.code;error.data=data;throw error}
  return data;
}

function rememberContext(event){
  const fresh=event.target.closest?.("[data-pc-new-promo]");
  if(fresh){context={mode:"new",type:fresh.dataset.pcNewPromo,promotionId:null};return}
  const edit=event.target.closest?.("[data-pc-edit-promo]");
  if(edit)context={mode:"edit",type:null,promotionId:edit.dataset.pcEditPromo};
}

function storeFieldset(stores){
  return `<fieldset class="promo-inline-stores wide" data-promo-inline-stores><legend>Καταστήματα POS</legend><p>Η ενεργή προσφορά εφαρμόζεται μόνο στα επιλεγμένα καταστήματα. Δεν επιτρέπεται επικάλυψη ίδιας προσφοράς στο ίδιο κατάστημα και χρονικό διάστημα.</p><div class="promo-inline-actions"><button type="button" data-promo-all>Όλα</button><button type="button" data-promo-none>Κανένα</button></div><div class="promo-inline-store-list">${stores.map(store=>`<label><input type="checkbox" data-promo-store value="${esc(store.id)}" ${store.selected?"checked":""}> <span>${esc(store.name)}</span></label>`).join("")||'<span class="promo-inline-empty">Δεν υπάρχουν ενεργά καταστήματα.</span>'}</div></fieldset>`;
}

async function enhanceForm(){
  const form=document.querySelector('form[data-pc-promo-form]:not([data-promo-store-guard])');
  if(!form||!context)return;
  form.dataset.promoStoreGuard="loading";
  const save=form.querySelector('.pc-modal-actions button.primary');if(save)save.disabled=true;
  try{
    let type=context.type,promotionId=context.promotionId,stores=[];
    if(context.mode==="edit"){
      const data=await api(`/api/price-catalog/promotions/${encodeURIComponent(promotionId)}/stores`);
      type=data.promotion?.promotionType||type;
      stores=data.stores||[];
    }else{
      const lookups=await api("/api/price-catalog/lookups");
      stores=(lookups.stores||[]).map(store=>({...store,selected:false}));
    }
    if(!document.body.contains(form))return;
    form.dataset.promoStoreGuard="ready";
    form.dataset.promoMode=context.mode;
    form.dataset.promoType=type||"LEAFLET";
    if(promotionId)form.dataset.promotionId=promotionId;
    const actions=form.querySelector(".pc-modal-actions");
    if(actions)actions.insertAdjacentHTML("beforebegin",storeFieldset(stores));
    else form.insertAdjacentHTML("beforeend",storeFieldset(stores));
    form.querySelector("[data-promo-all]")?.addEventListener("click",()=>form.querySelectorAll("[data-promo-store]").forEach(input=>input.checked=true));
    form.querySelector("[data-promo-none]")?.addEventListener("click",()=>form.querySelectorAll("[data-promo-store]").forEach(input=>input.checked=false));
    if(save)save.disabled=false;
  }catch(error){
    form.dataset.promoStoreGuard="error";
    if(save)save.disabled=false;
    alert(error.message);
  }
}

function selectedStoreIds(form){return [...form.querySelectorAll("[data-promo-store]:checked")].map(input=>input.value)}
function bodyFromForm(form){
  const type=form.dataset.promoType||"LEAFLET",leaflet=type==="LEAFLET";
  const body={
    promotionType:type,
    offerPrice:leaflet?num(form.elements.offerPrice?.value):null,
    discountPercent:num(form.elements.discountPercent?.value),
    saleQuantity:leaflet?1:num(form.elements.saleQuantity?.value),
    bonusQuantity:leaflet?0:num(form.elements.bonusQuantity?.value),
    customerPoints:leaflet?num(form.elements.customerPoints?.value):0,
    validFrom:form.elements.validFrom?.value,
    validUntil:form.elements.validUntil?.value||null,
    active:Boolean(form.elements.active?.checked),
    storeIds:selectedStoreIds(form)
  };
  if(form.dataset.promoMode==="new")body.productId=form.elements.productId?.value||"";
  return body;
}

async function guardedSubmit(event){
  const form=event.target.closest?.('form[data-pc-promo-form][data-promo-store-guard="ready"]');
  if(!form)return;
  event.preventDefault();event.stopImmediatePropagation();
  const save=form.querySelector('.pc-modal-actions button.primary');if(save)save.disabled=true;
  try{
    const body=bodyFromForm(form);
    if(form.dataset.promoMode==="new"&&!body.productId)throw new Error("Επίλεξε είδος.");
    if(body.active&&!body.storeIds.length)throw new Error("Επίλεξε τουλάχιστον ένα κατάστημα POS για ενεργή προσφορά.");
    const promotionId=form.dataset.promotionId;
    const path=form.dataset.promoMode==="edit"?`/api/price-catalog/promotions/${encodeURIComponent(promotionId)}/scoped`:"/api/price-catalog/promotions/scoped";
    await api(path,{method:form.dataset.promoMode==="edit"?"PATCH":"POST",body:JSON.stringify(body)});
    form.closest(".pc-modal-overlay")?.remove();
    document.querySelector(".price-catalog-suite [data-pc-refresh]")?.click();
  }catch(error){
    alert(error.message);
    if(save)save.disabled=false;
  }
}

export function installPromotionStoreGuard(){
  if(!window.__mwsPromotionStoreGuardInstalled){
    window.__mwsPromotionStoreGuardInstalled=true;
    document.addEventListener("click",rememberContext,true);
    document.addEventListener("submit",guardedSubmit,true);
  }
  enhanceForm().catch(error=>console.error("Promotion store guard:",error));
}
