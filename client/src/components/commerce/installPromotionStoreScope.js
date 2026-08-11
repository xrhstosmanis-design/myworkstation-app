const esc=value=>String(value??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[c]));
async function api(path,options={}){const token=localStorage.getItem("token");const response=await fetch(path,{...options,headers:{"Content-Type":"application/json",...(token?{Authorization:`Bearer ${token}`}:{}) ,...(options.headers||{})}});const data=await response.json().catch(()=>({}));if(!response.ok)throw new Error(data.error||`Σφάλμα ${response.status}`);return data}
function modal(html){const overlay=document.createElement("div");overlay.className="promo-store-overlay";overlay.innerHTML=`<section class="promo-store-modal">${html}</section>`;document.body.appendChild(overlay);overlay.addEventListener("click",event=>{if(event.target===overlay||event.target.closest("[data-promo-store-close]"))overlay.remove()});return overlay}
async function openScope(promotionId){
  const data=await api(`/api/price-catalog/promotions/${encodeURIComponent(promotionId)}/stores`);
  const overlay=modal(`<header><div><small>ΕΦΑΡΜΟΓΗ ΠΡΟΣΦΟΡΑΣ ΣΤΟ POS</small><h3>Καταστήματα POS</h3></div><button data-promo-store-close>✕</button></header><p class="promo-store-warning">Η προσφορά εφαρμόζεται στο POS μόνο στα επιλεγμένα καταστήματα. Χωρίς επιλογή καταστήματος παραμένει αποθηκευμένη στο BackOffice αλλά δεν αλλάζει καμία τιμή POS.</p><div class="promo-store-list">${data.stores.map(store=>`<label><input type="checkbox" value="${esc(store.id)}" ${store.selected?"checked":""}><span>${esc(store.name)}</span></label>`).join("")||'<div class="promo-store-empty">Δεν υπάρχουν ενεργά καταστήματα.</div>'}</div><footer><button data-promo-store-close>Επιστροφή</button><button class="primary" data-promo-store-save>Καταχώρηση</button></footer>`);
  overlay.querySelector("[data-promo-store-save]").onclick=async()=>{const button=overlay.querySelector("[data-promo-store-save]");button.disabled=true;try{const storeIds=[...overlay.querySelectorAll('.promo-store-list input[type="checkbox"]:checked')].map(input=>input.value);await api(`/api/price-catalog/promotions/${encodeURIComponent(promotionId)}/stores`,{method:"PUT",body:JSON.stringify({storeIds})});overlay.remove()}catch(error){alert(error.message);button.disabled=false}};
}
function enhance(){
  document.querySelectorAll(".price-catalog-suite .pc-table.leaflet .row:not(.head),.price-catalog-suite .pc-table.gifts .row:not(.head)").forEach(row=>{
    const edit=row.querySelector("[data-pc-edit-promo]");if(!edit||row.querySelector("[data-promo-store-scope]"))return;
    const promotionId=edit.dataset.pcEditPromo;if(!promotionId)return;
    const holder=edit.parentElement||row.firstElementChild;if(!holder)return;
    const button=document.createElement("button");button.type="button";button.dataset.promoStoreScope=promotionId;button.className="promo-store-scope-button";button.title="Καταστήματα στα οποία εφαρμόζεται η προσφορά στο POS";button.textContent="🏬 POS";button.onclick=event=>{event.preventDefault();event.stopPropagation();openScope(promotionId).catch(error=>alert(error.message))};holder.appendChild(button)
  })
}
export function installPromotionStoreScope(){enhance()}
