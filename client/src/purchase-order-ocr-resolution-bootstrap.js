const nativeFetch=window.fetch.bind(window);
const managerRoles=new Set(["SUPER_ADMIN","OWNER","ADMIN","MANAGER"]);
const user=()=>{try{return JSON.parse(localStorage.getItem("user")||"null")}catch{return null}};
const headers=()=>{const token=localStorage.getItem("token");return {"Content-Type":"application/json",...(token?{Authorization:`Bearer ${token}`}:{})}};
const esc=value=>String(value??"").replace(/[&<>"']/g,ch=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[ch]));
const money=value=>Number(value||0).toLocaleString("el-GR",{style:"currency",currency:"EUR"});
let lastOrderId=null;

async function api(path,options={}){
  const response=await nativeFetch(path,{...options,headers:{...headers(),...(options.headers||{})}});
  const data=await response.json().catch(()=>({}));
  if(!response.ok)throw new Error(data.error||`Σφάλμα ${response.status}`);
  return data;
}

function overlay(html){
  const wrap=document.createElement("div");
  wrap.className="mws-ocr-resolve-overlay";
  wrap.style.cssText="position:fixed;inset:0;z-index:100000;background:#0008;display:flex;align-items:center;justify-content:center;padding:22px";
  wrap.innerHTML=`<section style="width:min(1000px,96vw);max-height:92vh;overflow:auto;background:#fff;border-radius:14px;padding:18px;box-shadow:0 20px 60px #0005">${html}</section>`;
  document.body.appendChild(wrap);
  wrap.addEventListener("click",event=>{if(event.target===wrap||event.target.closest("[data-mws-close]"))wrap.remove()});
  return wrap;
}

async function searchExternalBarcode(barcode){
  if(!/^\d{6,18}$/.test(String(barcode||"")))return null;
  try{
    const result=await api(`/api/owner-products/smart-entry/barcode/${encodeURIComponent(barcode)}`);
    if(!result?.found||!result.product)return null;
    return {id:null,name:result.product.name||"",sku:result.product.sku||"",vatRate:result.product.vatRate??0,salePrice:0,costPrice:0,barcodes:[barcode],source:result.source||"ONLINE"};
  }catch{return null}
}

async function loadLines(orderId){
  return api(`/api/commerce/purchase-orders/${encodeURIComponent(orderId)}/ocr-lines`);
}

function lineStatus(row){
  if(row.resolutionStatus==="INFO")return `<span style="padding:3px 8px;border-radius:999px;background:#eef2f5">INFO</span>`;
  if(row.resolutionStatus==="MATCHED")return `<span style="padding:3px 8px;border-radius:999px;background:#e4f6e9;color:#176b32">✓ ΑΝΤΙΣΤΟΙΧΙΣΜΕΝΟ</span>`;
  return `<span style="padding:3px 8px;border-radius:999px;background:#fff1cf;color:#8a5700">! ΧΡΕΙΑΖΕΤΑΙ ΕΛΕΓΧΟ</span>`;
}

function renderPanel(panel,data){
  const rows=data.rows||[];
  panel.dataset.unresolved=String(data.unresolved||0);
  panel.innerHTML=`
    <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:12px;margin-bottom:10px">
      <div><h3 style="margin:0 0 4px">Έλεγχος γραμμών τιμολογίου</h3><small>Οι γραμμές εμφανίζονται με την ίδια σειρά που διαβάστηκαν από το τιμολόγιο. INFO = πληροφοριακή γραμμή, δεν επηρεάζει stock.</small></div>
      <div style="font-weight:900;${data.unresolved?"color:#a75d00":"color:#14733c"}">${data.unresolved?`${data.unresolved} άλυτες γραμμές`:`✓ Όλες οι γραμμές προϊόντων ελέγχθηκαν`}</div>
    </div>
    <div style="display:grid;gap:7px">${rows.map(row=>`
      <article data-ocr-line="${esc(row.id)}" style="border:1px solid ${row.resolutionStatus==='UNRESOLVED'?'#e3b34f':'#dce5e2'};border-radius:10px;padding:9px;background:${row.resolutionStatus==='INFO'?'#f7f8f9':row.resolutionStatus==='UNRESOLVED'?'#fffaf0':'#fff'}">
        <div style="display:grid;grid-template-columns:52px minmax(240px,1fr) 180px 150px;gap:8px;align-items:center">
          <b>#${row.ocrSequence||"—"}</b>
          <div><div style="font-weight:700">${esc(row.ocrRawText||row.description||"")}</div><small>OCR ${Math.round(Number(row.ocrConfidence||0))}%${row.detectedBarcode?` · Barcode ${esc(row.detectedBarcode)}`:""}</small></div>
          <div>${lineStatus(row)}</div>
          <div>${row.productName?`<b>${esc(row.productName)}</b><small style="display:block">${esc(row.sku||"")}</small>`:row.ocrLineType==='PRODUCT'?'<b>Χωρίς προϊόν</b>':'—'}</div>
        </div>
        ${row.resolutionStatus==='UNRESOLVED'?`<div style="display:flex;flex-wrap:wrap;gap:7px;margin-top:8px"><button type="button" data-ocr-search="${esc(row.id)}">🔎 Online / Κατάλογος</button><button type="button" data-ocr-new="${esc(row.id)}">＋ Νέα εγγραφή</button></div>`:""}
      </article>`).join("")}
    </div>`;
}

function updateFinalizeGuard(modal,panel){
  const unresolved=Number(panel?.dataset.unresolved||0);
  [...modal.querySelectorAll("button")].filter(b=>/Οριστικοποίηση/i.test(b.textContent||"")).forEach(button=>{
    button.disabled=unresolved>0;
    button.title=unresolved>0?`Υπάρχουν ${unresolved} άλυτες γραμμές προϊόντων.`:"";
  });
}

async function refreshPanel(modal,panel,orderId){
  const data=await loadLines(orderId);
  if(!data.rows?.some(row=>row.ocrRawText||row.ocrSequence||data.order?.sourceType==="POS_OCR_DRAFT")){panel.remove();return;}
  renderPanel(panel,data);updateFinalizeGuard(modal,panel);bindPanel(modal,panel,orderId,data);
}

async function resolveExisting(orderId,line,product,addBarcode){
  return api(`/api/commerce/purchase-orders/${encodeURIComponent(orderId)}/ocr-lines/${encodeURIComponent(line.id)}/resolve-existing`,{method:"POST",body:JSON.stringify({productId:product.id,addBarcode:Boolean(addBarcode),barcode:line.detectedBarcode||null})});
}

async function createProduct(orderId,line,candidate={}){
  const name=window.prompt("Ονομασία νέου προϊόντος",candidate.name||line.description||line.ocrRawText||"");if(!name)return null;
  const barcode=window.prompt("Barcode",candidate.barcodes?.[0]||line.detectedBarcode||"")??"";
  const vatRaw=window.prompt("ΦΠΑ %",String(candidate.vatRate??24));if(vatRaw===null)return null;
  const saleRaw=window.prompt("Τιμή λιανικής",String(candidate.salePrice||0));if(saleRaw===null)return null;
  const vatRate=Number(String(vatRaw).replace(",",".")),salePrice=Number(String(saleRaw).replace(",","."));
  return api(`/api/commerce/purchase-orders/${encodeURIComponent(orderId)}/ocr-lines/${encodeURIComponent(line.id)}/create-product`,{method:"POST",body:JSON.stringify({name,barcode,vatRate:Number.isFinite(vatRate)?vatRate:24,salePrice:Number.isFinite(salePrice)?salePrice:0})});
}

async function openSearch(modal,panel,orderId,line){
  const q0=line.detectedBarcode||line.description||line.ocrRawText||"";
  const w=overlay(`<div style="display:flex;justify-content:space-between;gap:10px"><div><h2 style="margin:0">Αναζήτηση / Συγχώνευση προϊόντος</h2><p style="margin:5px 0 12px">${esc(line.ocrRawText||line.description||"")}</p></div><button data-mws-close>×</button></div><div style="display:flex;gap:7px"><input data-q value="${esc(q0)}" style="flex:1;padding:10px"/><button data-search>Αναζήτηση</button></div><div data-results style="margin-top:12px"></div>`);
  const box=w.querySelector("[data-results]"),input=w.querySelector("[data-q]");
  const run=async()=>{
    const q=input.value.trim();if(q.length<2)return;
    box.innerHTML="Αναζήτηση…";
    try{
      const result=await api(`/api/commerce/purchase-orders/${encodeURIComponent(orderId)}/ocr-lines/${encodeURIComponent(line.id)}/search?q=${encodeURIComponent(q)}`);
      const rows=[...(result.rows||[])];
      const online=await searchExternalBarcode(q);
      if(online&&!rows.some(r=>(r.barcodes||[]).includes(q)))rows.push(online);
      box.innerHTML=rows.length?rows.map((row,index)=>`<article data-result="${index}" style="border:1px solid #dce5e2;border-radius:9px;padding:10px;margin:7px 0"><div style="display:flex;justify-content:space-between;gap:10px"><div><b>${esc(row.name||"Χωρίς όνομα")}</b><small style="display:block">${esc(row.source)} · ${esc(row.sku||"")} · ${(row.barcodes||[]).map(esc).join(", ")}</small></div><div style="display:flex;gap:6px;flex-wrap:wrap;justify-content:flex-end">${row.source==='LOCAL'?`<button data-link="${index}">Συγχώνευση / Αντιστοίχιση</button>${line.detectedBarcode?`<button data-link-barcode="${index}">Αντιστοίχιση + Barcode</button>`:""}`:`<button data-create="${index}">Νέα εγγραφή από αποτέλεσμα</button>`}</div></div></article>`).join(""):'Δεν βρέθηκε αποτέλεσμα. Μπορείς να κάνεις Νέα εγγραφή.';
      box.querySelectorAll("[data-link]").forEach(btn=>btn.onclick=async()=>{await resolveExisting(orderId,line,rows[Number(btn.dataset.link)],false);w.remove();await refreshPanel(modal,panel,orderId)});
      box.querySelectorAll("[data-link-barcode]").forEach(btn=>btn.onclick=async()=>{await resolveExisting(orderId,line,rows[Number(btn.dataset.linkBarcode)],true);w.remove();await refreshPanel(modal,panel,orderId)});
      box.querySelectorAll("[data-create]").forEach(btn=>btn.onclick=async()=>{await createProduct(orderId,line,rows[Number(btn.dataset.create)]);w.remove();await refreshPanel(modal,panel,orderId)});
    }catch(error){box.innerHTML=`<div style="color:#a40000">${esc(error.message)}</div>`}
  };
  w.querySelector("[data-search]").onclick=run;input.addEventListener("keydown",e=>{if(e.key==="Enter")run()});run();
}

function bindPanel(modal,panel,orderId,data){
  const byId=new Map((data.rows||[]).map(row=>[row.id,row]));
  panel.querySelectorAll("[data-ocr-search]").forEach(btn=>btn.onclick=()=>openSearch(modal,panel,orderId,byId.get(btn.dataset.ocrSearch)));
  panel.querySelectorAll("[data-ocr-new]").forEach(btn=>btn.onclick=async()=>{const line=byId.get(btn.dataset.ocrNew);try{await createProduct(orderId,line);await refreshPanel(modal,panel,orderId)}catch(error){alert(error.message)}});
}

async function enhancePurchaseModal(modal,orderId){
  if(!orderId||modal.dataset.ocrResolutionBound===orderId)return;
  modal.dataset.ocrResolutionBound=orderId;
  const panel=document.createElement("section");panel.className="mws-ocr-resolution-panel";panel.style.cssText="border:2px solid #d8b45b;border-radius:12px;padding:12px;margin:12px 0;background:#fff";panel.textContent="Φόρτωση γραμμών τιμολογίου…";
  const title=modal.querySelector(".po-modal-title");(title?.nextElementSibling||modal.firstElementChild)?.before?.(panel);if(!panel.isConnected)modal.prepend(panel);
  try{await refreshPanel(modal,panel,orderId)}catch(error){panel.remove()}
}

document.addEventListener("click",event=>{
  const open=event.target.closest?.("[data-po-open]");if(open)lastOrderId=open.dataset.poOpen;
  const finalButton=event.target.closest?.(".po-modal button");
  if(finalButton&&/Οριστικοποίηση/i.test(finalButton.textContent||"")){
    const panel=finalButton.closest(".po-modal")?.querySelector(".mws-ocr-resolution-panel");
    const unresolved=Number(panel?.dataset.unresolved||0);if(unresolved>0){event.preventDefault();event.stopImmediatePropagation();alert(`Υπάρχουν ${unresolved} άλυτες γραμμές προϊόντων. Κάνε πρώτα αντιστοίχιση / barcode / νέα εγγραφή.`)}
  }
},true);

function enhance(){
  if(!managerRoles.has(user()?.role))return;
  document.querySelectorAll(".po-modal-overlay .po-modal").forEach(modal=>{if(lastOrderId)enhancePurchaseModal(modal,lastOrderId)});
}

enhance();
new MutationObserver(enhance).observe(document.documentElement,{childList:true,subtree:true});
