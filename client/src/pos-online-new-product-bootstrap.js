const STORE_RE=/^\/store\/([^/]+)\/?$/;
const storeMatch=window.location.pathname.match(STORE_RE);

if(storeMatch){
  const storeId=decodeURIComponent(storeMatch[1]);
  const api=async(path,options={})=>{
    const token=localStorage.getItem("token");
    const response=await fetch(path,{...options,headers:{"Content-Type":"application/json",...(token?{Authorization:`Bearer ${token}`}:{}) ,...(options.headers||{})}});
    const text=await response.text();let data={};if(text){try{data=JSON.parse(text)}catch{data={error:"Ο server επέστρεψε μη αναμενόμενη απάντηση."}}}
    if(!response.ok)throw new Error(data.error||`Σφάλμα ${response.status}`);return data;
  };

  const esc=value=>String(value??"").replace(/[&<>"']/g,ch=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[ch]));
  const num=value=>Number(String(value??"").replace(",","."));
  const visible=el=>{if(!el)return false;const r=el.getBoundingClientRect();return r.width>0&&r.height>0};
  const currentQuery=()=>{
    const candidates=[...document.querySelectorAll('.standard-search input,input[placeholder*="Barcode"],input[placeholder*="barcode"],input[type="search"]')];
    const input=candidates.find(el=>visible(el)&&String(el.value||"").trim())||candidates.find(visible);
    return String(input?.value||"").trim();
  };
  const clearSearch=()=>{
    const candidates=[...document.querySelectorAll('.standard-search input,input[placeholder*="Barcode"],input[placeholder*="barcode"],input[type="search"]')];
    const input=candidates.find(visible);if(!input)return;
    const setter=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,"value")?.set;
    if(setter)setter.call(input,"");else input.value="";
    input.dispatchEvent(new Event("input",{bubbles:true}));input.dispatchEvent(new Event("change",{bubbles:true}));
  };
  const refreshPos=()=>{
    const buttons=[...document.querySelectorAll("button")];
    const refresh=buttons.find(button=>String(button.textContent||"").replace(/\s+/g," ").trim().toLocaleUpperCase("el-GR").includes("ΑΝΑΝΕΩΣΗ"));
    refresh?.click();
  };

  function closeModal(){document.getElementById("mws-pos-online-new-overlay")?.remove()}
  async function openModal(){
    const query=currentQuery();if(!query){window.alert("Σκάναρε ή γράψε πρώτα barcode / κωδικό.");return}
    let result;
    try{result=await api(`/api/store-pos/stores/${encodeURIComponent(storeId)}/online-product-search?q=${encodeURIComponent(query)}`)}catch(error){window.alert(error.message);return}
    const row=(result.rows||[])[0];if(!row){window.alert("Δεν βρέθηκε online προϊόν για αυτό το barcode.");return}
    const barcode=String((row.barcodes||[])[0]||row.sourceCode||query).trim();
    closeModal();
    const overlay=document.createElement("div");overlay.id="mws-pos-online-new-overlay";
    overlay.innerHTML=`<section class="mws-pos-online-new-modal" role="dialog" aria-modal="true">
      <header><div><small>ONLINE ΑΝΑΖΗΤΗΣΗ · ΝΕΟ ΕΙΔΟΣ</small><h2>Νέο είδος στο κατάστημα</h2><p>Θα δημιουργηθεί καρτέλα είδους και θα συνδεθεί άμεσα με την Αποθήκη.</p></div><button type="button" data-close>×</button></header>
      <div class="body">
        <label>Barcode<input name="barcode" value="${esc(barcode)}" readonly></label>
        <label>Περιγραφή<input name="name" value="${esc(row.name||"")}" required></label>
        <label>Κατηγορία<input name="categoryName" value="${esc(row.categoryName||"")}" placeholder="π.χ. ΑΝΑΨΥΚΤΙΚΑ"></label>
        <div class="grid3">
          <label>ΦΠΑ %<select name="vatRate"><option value="13" ${Number(row.vatRate)===13||row.vatRate==null?"selected":""}>13%</option><option value="24" ${Number(row.vatRate)===24?"selected":""}>24%</option><option value="6" ${Number(row.vatRate)===6?"selected":""}>6%</option><option value="0" ${Number(row.vatRate)===0?"selected":""}>0%</option></select></label>
          <label>Μονάδα<select name="unit"><option value="PIECE">ΤΕΜ</option><option value="KG">KG</option><option value="LITER">LT</option><option value="PACKAGE">ΣΥΣΚΕΥΑΣΙΑ</option></select></label>
          <label>Αρχικό stock<input name="openingStock" inputmode="decimal" value="0"></label>
        </div>
        <div class="grid2"><label>Τιμή αγοράς<input name="costPrice" inputmode="decimal" value="0"></label><label>Τιμή λιανικής<input name="salePrice" inputmode="decimal" value="0"></label></div>
        <div class="inventory-note"><b>Σύνδεση Αποθήκης ενεργή</b><span>Το αρχικό stock θα γραφτεί στο StoreProduct και, αν είναι πάνω από 0, θα δημιουργηθεί κίνηση αποθήκης.</span></div>
        <div class="error" data-error hidden></div>
      </div>
      <footer><button type="button" data-close class="secondary">Ακύρωση</button><button type="button" data-save class="primary">Καταχώριση & σύνδεση με Αποθήκη</button></footer>
    </section>`;
    document.body.appendChild(overlay);
    overlay.querySelectorAll("[data-close]").forEach(btn=>btn.addEventListener("click",closeModal));
    overlay.addEventListener("mousedown",event=>{if(event.target===overlay)closeModal()});
    overlay.querySelector("[data-save]").addEventListener("click",async()=>{
      const modal=overlay.querySelector(".mws-pos-online-new-modal"),errorBox=modal.querySelector("[data-error]"),save=modal.querySelector("[data-save]");
      const body={barcode:modal.querySelector('[name="barcode"]').value.trim(),name:modal.querySelector('[name="name"]').value.trim(),categoryName:modal.querySelector('[name="categoryName"]').value.trim(),vatRate:num(modal.querySelector('[name="vatRate"]').value),unit:modal.querySelector('[name="unit"]').value,openingStock:num(modal.querySelector('[name="openingStock"]').value),costPrice:num(modal.querySelector('[name="costPrice"]').value),salePrice:num(modal.querySelector('[name="salePrice"]').value)};
      if(!body.name||!Number.isFinite(body.salePrice)||body.salePrice<=0||!Number.isFinite(body.openingStock)||body.openingStock<0){errorBox.hidden=false;errorBox.textContent="Συμπλήρωσε περιγραφή, λιανική τιμή μεγαλύτερη από 0 και έγκυρο αρχικό stock.";return}
      save.disabled=true;save.textContent="Καταχώριση…";errorBox.hidden=true;
      try{
        const created=await api(`/api/store-pos/stores/${encodeURIComponent(storeId)}/online-product-create`,{method:"POST",body:JSON.stringify(body)});
        modal.querySelector(".body").innerHTML=`<div class="success"><b>Το είδος καταχωρίστηκε.</b><span>Κωδικός: ${esc(created.sku)} · Stock: ${esc(created.currentStock)} · Η Αποθήκη συνδέθηκε κανονικά.</span></div>`;
        modal.querySelector("footer").innerHTML="";
        setTimeout(()=>{closeModal();clearSearch();refreshPos()},700);
      }catch(error){save.disabled=false;save.textContent="Καταχώριση & σύνδεση με Αποθήκη";errorBox.hidden=false;errorBox.textContent=error.message}
    });
  }

  const isOnlineButton=button=>button instanceof HTMLButtonElement&&String(button.textContent||"").replace(/\s+/g," ").trim().toLocaleUpperCase("el-GR").includes("ONLINE ΑΝΑΖΗΤΗΣΗ");
  document.addEventListener("click",event=>{
    const button=event.target.closest("button");
    if(!isOnlineButton(button))return;
    event.preventDefault();event.stopPropagation();event.stopImmediatePropagation();
    openModal();
  },true);

  function enhanceOnlineRows(){
    document.querySelectorAll(".standard-search-results > div").forEach(card=>{
      if(card.dataset.mwsOnlineNewDone==="1")return;
      if(card.querySelector("button")||card.textContent.includes("Το προϊόν δεν υπάρχει"))return;
      const title=card.querySelector("b");if(!title)return;
      card.dataset.mwsOnlineNewDone="1";
      const button=document.createElement("button");button.type="button";button.className="mws-pos-online-new-button";button.textContent="+ ΝΕΟ ΕΙΔΟΣ";button.addEventListener("click",event=>{event.preventDefault();event.stopPropagation();openModal()});card.appendChild(button);
    });
  }

  const style=document.createElement("style");style.textContent=`
    .mws-pos-online-new-button{margin-top:7px;padding:10px 13px;border:0;border-radius:9px;background:#0b7f72;color:#fff;font-weight:900;cursor:pointer}
    #mws-pos-online-new-overlay{position:fixed;inset:0;z-index:2147482500;background:rgba(7,27,45,.62);display:flex;align-items:center;justify-content:center;padding:18px;box-sizing:border-box}
    .mws-pos-online-new-modal{width:min(900px,96vw);max-height:92vh;overflow:auto;background:#fff;border-radius:16px;box-shadow:0 24px 70px rgba(5,31,50,.35);border:1px solid #b9cad8;font-family:inherit}
    .mws-pos-online-new-modal header{display:flex;justify-content:space-between;gap:18px;align-items:flex-start;padding:18px 20px;background:#153f61;color:#fff}.mws-pos-online-new-modal header small{font-weight:900;letter-spacing:.06em}.mws-pos-online-new-modal header h2{margin:3px 0 2px;font-size:25px}.mws-pos-online-new-modal header p{margin:0;opacity:.9}.mws-pos-online-new-modal header button{border:0;border-radius:9px;background:#ffffff22;color:#fff;width:46px;height:46px;font-size:28px;cursor:pointer}
    .mws-pos-online-new-modal .body{padding:18px 20px;display:grid;gap:13px}.mws-pos-online-new-modal label{display:grid;gap:6px;font-weight:800}.mws-pos-online-new-modal input,.mws-pos-online-new-modal select{min-height:46px;border:1px solid #b9c9d4;border-radius:8px;padding:8px 11px;font:inherit;background:#fff;box-sizing:border-box}.mws-pos-online-new-modal .grid2{display:grid;grid-template-columns:1fr 1fr;gap:12px}.mws-pos-online-new-modal .grid3{display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px}.mws-pos-online-new-modal .inventory-note{padding:12px 14px;border:1px solid #9dd6c1;background:#eaf8f2;border-radius:9px;display:grid;gap:3px;color:#134b3b}.mws-pos-online-new-modal .error{padding:11px 13px;background:#fff0f0;border:1px solid #e4aaaa;color:#a22626;border-radius:8px;font-weight:800}.mws-pos-online-new-modal .success{padding:22px;background:#eaf8f2;border:1px solid #9dd6c1;border-radius:10px;display:grid;gap:7px;font-size:18px;color:#134b3b}.mws-pos-online-new-modal footer{display:flex;justify-content:flex-end;gap:10px;padding:14px 20px;border-top:1px solid #d7e0e6;background:#f6f9fb}.mws-pos-online-new-modal footer button{min-height:44px;padding:0 16px;border-radius:8px;font-weight:900;cursor:pointer}.mws-pos-online-new-modal footer .secondary{border:1px solid #b8c7d2;background:#fff}.mws-pos-online-new-modal footer .primary{border:0;background:#0b7f72;color:#fff}
    @media(max-width:720px){.mws-pos-online-new-modal .grid2,.mws-pos-online-new-modal .grid3{grid-template-columns:1fr}}
  `;document.head.appendChild(style);
  new MutationObserver(enhanceOnlineRows).observe(document.documentElement,{childList:true,subtree:true});
  enhanceOnlineRows();
}
