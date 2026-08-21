const api=async(path,options={})=>{
  const token=localStorage.getItem("token");
  const response=await fetch(path,{...options,headers:{"Content-Type":"application/json",...(token?{Authorization:`Bearer ${token}`}:{}) ,...(options.headers||{})}});
  const data=await response.json().catch(()=>({}));
  if(!response.ok)throw new Error(data.error||`Σφάλμα ${response.status}`);
  return data;
};
const esc=value=>String(value??"").replace(/[&<>"']/g,ch=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[ch]));
const isPlatformSuper=()=>{try{const u=JSON.parse(localStorage.getItem("user")||"{}");return u.isSuperAdmin===true||u.platformRole==="SUPER_ADMIN"||u.role==="SUPER_ADMIN"}catch{return false}};

function close(){document.getElementById("mws-platform-advanced-overlay")?.remove()}
async function openAdvanced(){
  let options;
  try{options=await api("/api/platform/advanced-online-search/options")}catch(error){alert(error.message);return}
  close();
  const overlay=document.createElement("div");overlay.id="mws-platform-advanced-overlay";
  overlay.innerHTML=`<section class="mws-platform-advanced-modal"><header><div><small>PLATFORM SUPER ADMIN · ΠΑΝΤΑ ΕΝΕΡΓΟ</small><h2>Advanced Online Product Search</h2><p>Αναζήτηση προϊόντος στο Google και καταχώριση στον Master Catalog.</p></div><button data-close>×</button></header><div class="body">
    <div class="search-row"><input data-barcode inputmode="numeric" placeholder="Σκάναρε / γράψε barcode"><button data-search>Google Search</button></div>
    <div data-result class="result" hidden></div>
    <div data-form hidden>
      <label>Περιγραφή<input data-name></label>
      <div class="grid2"><label>Κατηγορία<input data-category list="mws-master-categories" placeholder="Επιλογή ή νέα κατηγορία"><datalist id="mws-master-categories">${(options.categories||[]).map(x=>`<option value="${esc(x)}"></option>`).join("")}</datalist></label><label>Υποκατηγορία<input data-subcategory list="mws-master-subcategories" placeholder="Επιλογή ή νέα υποκατηγορία"><datalist id="mws-master-subcategories"></datalist></label></div>
      <div class="grid3"><label>ΦΠΑ %<select data-vat><option value="">— Επιλογή —</option><option>0</option><option>6</option><option>13</option><option>24</option></select></label><label>Τιμή αγοράς<input data-cost type="number" min="0" step="0.01"></label><label>Τιμή λιανικής<input data-retail type="number" min="0" step="0.01"></label></div>
      <div class="notice">Το Google δίνει μόνο πρόταση περιγραφής. Κατηγορία, Υποκατηγορία, ΦΠΑ και τιμές επιβεβαιώνονται από εσένα.</div>
    </div>
    <div data-error class="error" hidden></div>
  </div><footer><button data-close>Ακύρωση</button><button data-save class="primary" hidden>Καταχώριση στον Master Catalog</button></footer></section>`;
  document.body.appendChild(overlay);
  const category=overlay.querySelector("[data-category]"),subcategory=overlay.querySelector("[data-subcategory]"),sublist=overlay.querySelector("#mws-master-subcategories");
  const refreshSubs=()=>{const selected=category.value.trim();sublist.innerHTML=(options.subcategories||[]).filter(x=>!selected||x.categoryName===selected).map(x=>`<option value="${esc(x.name)}"></option>`).join("")};
  category.addEventListener("input",refreshSubs);refreshSubs();
  overlay.querySelectorAll("[data-close]").forEach(b=>b.addEventListener("click",close));
  overlay.addEventListener("mousedown",e=>{if(e.target===overlay)close()});
  let found=null;
  overlay.querySelector("[data-search]").addEventListener("click",async()=>{
    const barcode=overlay.querySelector("[data-barcode]").value.trim(),error=overlay.querySelector("[data-error]"),resultBox=overlay.querySelector("[data-result]"),form=overlay.querySelector("[data-form]"),save=overlay.querySelector("[data-save]");
    error.hidden=true;resultBox.hidden=true;form.hidden=true;save.hidden=true;found=null;
    if(!/^\d{6,18}$/.test(barcode)){error.hidden=false;error.textContent="Βάλε έγκυρο barcode 6–18 ψηφίων.";return}
    try{
      const data=await api(`/api/platform/advanced-online-search/search?q=${encodeURIComponent(barcode)}`),row=(data.rows||[])[0];
      if(!row){error.hidden=false;error.textContent=data.advanced?.reason==="LIMIT_REACHED"?"Έχει συμπληρωθεί το όριο Advanced Search.":data.advanced?.reason==="PROVIDER_NOT_CONFIGURED"?"Δεν έχει ρυθμιστεί provider.":"Δεν βρέθηκε αξιόπιστη αντιστοίχιση για το barcode.";return}
      if(data.source==="MASTER_CATALOG"){error.hidden=false;error.textContent=`Το προϊόν υπάρχει ήδη στον Master Catalog: ${row.name}`;return}
      found={...row,barcode};resultBox.hidden=false;resultBox.innerHTML=`<b>${esc(row.name)}</b><span>${esc(row.sourceDomain||row.provider||"Google")}</span><small>Exact barcode match: ${esc(barcode)}</small>`;
      overlay.querySelector("[data-name]").value=row.name||"";form.hidden=false;save.hidden=false;
    }catch(e){error.hidden=false;error.textContent=e.message}
  });
  overlay.querySelector("[data-save]").addEventListener("click",async()=>{
    if(!found)return;const error=overlay.querySelector("[data-error]"),save=overlay.querySelector("[data-save]");
    const body={barcode:found.barcode,name:overlay.querySelector("[data-name]").value.trim(),categoryName:category.value.trim(),subcategoryName:subcategory.value.trim(),vatRate:overlay.querySelector("[data-vat]").value,defaultCostPrice:overlay.querySelector("[data-cost]").value,defaultRetailPrice:overlay.querySelector("[data-retail]").value};
    if(!body.name||!body.categoryName||body.vatRate===""){error.hidden=false;error.textContent="Συμπλήρωσε Περιγραφή, Κατηγορία και ΦΠΑ.";return}
    save.disabled=true;save.textContent="Καταχώριση…";error.hidden=true;
    try{const created=await api("/api/platform/advanced-online-search/master-product",{method:"POST",body:JSON.stringify(body)});overlay.querySelector(".body").innerHTML=`<div class="success"><b>Καταχωρίστηκε στον Master Catalog.</b><span>${esc(created.name)} · ${esc(created.categoryName)}${created.subcategoryName?` → ${esc(created.subcategoryName)}`:""}</span></div>`;overlay.querySelector("footer").innerHTML='<button data-close-final>Κλείσιμο</button>';overlay.querySelector("[data-close-final]").onclick=()=>{close();document.querySelector(".master-catalog-modal button")?.click()}}catch(e){save.disabled=false;save.textContent="Καταχώριση στον Master Catalog";error.hidden=false;error.textContent=e.message}
  });
}

function install(){
  if(!isPlatformSuper())return;
  document.querySelectorAll(".master-catalog-modal").forEach(modal=>{
    if(modal.querySelector("[data-mws-advanced-master]"))return;
    const host=modal.querySelector(".master-maintenance")||modal.querySelector(".master-catalog-head");if(!host)return;
    const button=document.createElement("button");button.type="button";button.dataset.mwsAdvancedMaster="1";button.className="mws-advanced-master-button";button.textContent="⌕ Advanced Online Search";button.addEventListener("click",openAdvanced);host.appendChild(button);
  });
}
const style=document.createElement("style");style.textContent=`.mws-advanced-master-button{padding:10px 14px;border:0;border-radius:9px;background:#0b7891;color:#fff;font-weight:900;cursor:pointer}#mws-platform-advanced-overlay{position:fixed;inset:0;z-index:2147483000;background:#071b2db8;display:flex;align-items:center;justify-content:center;padding:20px}.mws-platform-advanced-modal{width:min(900px,96vw);max-height:94vh;overflow:auto;background:#fff;border-radius:16px;box-shadow:0 26px 80px #001a2f66;font-family:inherit}.mws-platform-advanced-modal header{display:flex;justify-content:space-between;background:#153f61;color:#fff;padding:18px 20px}.mws-platform-advanced-modal header h2{margin:3px 0}.mws-platform-advanced-modal header p{margin:0}.mws-platform-advanced-modal header button{width:44px;height:44px;border:0;border-radius:9px;background:#ffffff22;color:#fff;font-size:28px}.mws-platform-advanced-modal .body{padding:18px;display:grid;gap:13px}.mws-platform-advanced-modal .search-row{display:grid;grid-template-columns:1fr auto;gap:10px}.mws-platform-advanced-modal input,.mws-platform-advanced-modal select{min-height:44px;border:1px solid #b8c9d5;border-radius:8px;padding:8px 10px;font:inherit;box-sizing:border-box;width:100%}.mws-platform-advanced-modal .search-row button,.mws-platform-advanced-modal .primary{border:0;border-radius:8px;background:#0b7891;color:#fff;padding:0 16px;font-weight:900}.mws-platform-advanced-modal label{display:grid;gap:5px;font-weight:800}.mws-platform-advanced-modal .grid2{display:grid;grid-template-columns:1fr 1fr;gap:12px}.mws-platform-advanced-modal .grid3{display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px}.mws-platform-advanced-modal .result,.mws-platform-advanced-modal .notice,.mws-platform-advanced-modal .success{padding:12px;border-radius:9px;background:#eef8ff;border:1px solid #bdd7e9;display:grid;gap:4px}.mws-platform-advanced-modal .error{padding:12px;border-radius:9px;background:#fff0f0;border:1px solid #e5aaaa;color:#9d2222;font-weight:800}.mws-platform-advanced-modal footer{display:flex;justify-content:flex-end;gap:10px;padding:14px 18px;border-top:1px solid #d6e0e7}.mws-platform-advanced-modal footer button{min-height:42px;padding:0 15px;border-radius:8px;border:1px solid #b8c9d5;background:#fff;font-weight:900}@media(max-width:700px){.mws-platform-advanced-modal .grid2,.mws-platform-advanced-modal .grid3{grid-template-columns:1fr}}`;document.head.appendChild(style);
new MutationObserver(install).observe(document.documentElement,{childList:true,subtree:true});install();
