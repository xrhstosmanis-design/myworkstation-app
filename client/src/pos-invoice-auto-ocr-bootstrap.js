const nativeFetch = window.fetch.bind(window);

const tokenHeaders = () => {
  const token = sessionStorage.getItem("storeOperatorToken") || localStorage.getItem("token");
  return {
    "Content-Type": "application/json",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
};

const sessionStoreId = () => {
  try { return JSON.parse(sessionStorage.getItem("storeOperatorSession") || "null")?.store?.id || null; }
  catch { return null; }
};

const readFile = file => new Promise((resolve,reject)=>{
  const reader=new FileReader();
  reader.onload=()=>resolve(reader.result);
  reader.onerror=()=>reject(new Error("Δεν ήταν δυνατή η ανάγνωση του τιμολογίου."));
  reader.readAsDataURL(file);
});

const dataUrlToBytes = (dataUrl) => {
  const comma = String(dataUrl || "").indexOf(",");
  if (comma < 0) throw new Error("Μη έγκυρο αρχείο παραστατικού.");
  const binary = atob(dataUrl.slice(comma + 1));
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
};

async function pdfPreview(dataUrl) {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  pdfjs.GlobalWorkerOptions.workerSrc = new URL("pdfjs-dist/legacy/build/pdf.worker.min.mjs", import.meta.url).toString();
  const pdf = await pdfjs.getDocument({ data: dataUrlToBytes(dataUrl) }).promise;
  const page = await pdf.getPage(1);
  const viewport = page.getViewport({ scale: 2 });
  const canvas = document.createElement("canvas");
  canvas.width = Math.ceil(viewport.width);
  canvas.height = Math.ceil(viewport.height);
  await page.render({ canvasContext: canvas.getContext("2d"), viewport }).promise;
  return {
    imageDataUrl: canvas.toDataURL("image/jpeg", 0.92),
    pageCount: pdf.numPages,
    pdfNote: pdf.numPages > 1 ? `Αναγνώστηκε η πρώτη σελίδα από ${pdf.numPages}. Το αρχικό PDF παραμένει συνδεδεμένο.` : "Αναγνώστηκε η πρώτη σελίδα του PDF."
  };
}

function collectLines(data) {
  const found=[];
  const visit=node=>{
    if(!node)return;
    if(Array.isArray(node)){node.forEach(visit);return;}
    if(node.text&&node.words&&String(node.text).trim())found.push({text:String(node.text).trim(),confidence:Math.max(0,Math.min(100,Math.round(Number(node.confidence)||0)))});
    for(const key of ["blocks","paragraphs","lines"])visit(node[key]);
  };
  visit(data.blocks);
  if(found.length)return found;
  return String(data.text||"").split(/\r?\n/).map(text=>text.trim()).filter(Boolean).map(text=>({text,confidence:Math.round(Number(data.confidence)||0)}));
}

async function localOcr(file) {
  const dataUrl=await readFile(file);
  let source=dataUrl,pageCount=null,pdfNote=null;
  if(file.type==="application/pdf"){
    const preview=await pdfPreview(dataUrl);source=preview.imageDataUrl;pageCount=preview.pageCount;pdfNote=preview.pdfNote;
  }
  const {createWorker}=await import("tesseract.js");
  const worker=await createWorker("ell+eng");
  let result;
  try{result=await worker.recognize(source)}finally{await worker.terminate()}
  return {
    dataUrl,
    mimeType:file.type||"image/jpeg",
    filename:file.name||"timologio.jpg",
    confidence:Math.max(0,Math.min(100,Math.round(Number(result?.data?.confidence)||0))),
    rawText:result?.data?.text||"",
    lines:collectLines(result?.data||{}),
    pageCount,pdfNote
  };
}

const normalize=value=>String(value||"").normalize("NFD").replace(/[\u0300-\u036f]/g,"").toUpperCase().replace(/[^A-ZΑ-Ω0-9]/g,"");
const moneyNumber=value=>{
  const cleaned=String(value||"").replace(/\s/g,"").replace(/\.(?=\d{3}(?:\D|$))/g,"").replace(",",".").replace(/[^0-9.]/g,"");
  const n=Number(cleaned);return Number.isFinite(n)?n:null;
};

function extractInvoiceMeta(rawText, supplierSelect) {
  const lines=String(rawText||"").split(/\r?\n/).map(x=>x.trim()).filter(Boolean);
  const joined=normalize(rawText);
  let supplierId="",supplierName="";
  if(supplierSelect){
    let best=0;
    for(const option of [...supplierSelect.options]){
      if(!option.value)continue;
      const key=normalize(option.textContent);
      if(key.length>=4&&joined.includes(key)&&key.length>best){best=key.length;supplierId=option.value;supplierName=option.textContent.trim();}
    }
  }

  let documentNumber="";
  for(const line of lines){
    const match=line.match(/(?:ΤΙΜΟΛΟΓΙΟ|ΤΙΜ|INVOICE|ΠΑΡΑΣΤΑΤΙΚΟ).{0,30}?(?:ΑΡ\.?|ΑΡΙΘΜ(?:ΟΣ)?|NO\.?|#)?\s*[:\-]?\s*([A-ZΑ-Ω0-9][A-ZΑ-Ω0-9\-/]{2,})/i)
      || line.match(/(?:ΑΡ\.?\s*(?:ΤΙΜΟΛΟΓΙΟΥ)?|ΑΡΙΘΜΟΣ\s*(?:ΤΙΜΟΛΟΓΙΟΥ)?|INVOICE\s*NO\.?)\s*[:\-]?\s*([A-ZΑ-Ω0-9\-/]{3,})/i);
    if(match){documentNumber=match[1].trim();break;}
  }

  let documentDate="";
  for(const line of lines){
    const match=line.match(/(?:ΗΜΕΡΟΜΗΝΙΑ|DATE)?\s*[:\-]?\s*(\d{1,2}[\/\-.]\d{1,2}[\/\-.](?:20)?\d{2})/i);
    if(match){
      const p=match[1].split(/[\/\-.]/).map(Number);if(p.length===3){let [d,m,y]=p;if(y<100)y+=2000;documentDate=`${String(y).padStart(4,"0")}-${String(m).padStart(2,"0")}-${String(d).padStart(2,"0")}`;}break;
    }
  }

  let totalGross=null;
  const totalWords=/(ΓΕΝΙΚΟ\s*ΣΥΝΟΛΟ|ΠΛΗΡΩΤΕΟ|ΤΕΛΙΚΟ\s*ΣΥΝΟΛΟ|ΣΥΝΟΛΟ\s*ΜΕ\s*ΦΠΑ|TOTAL\s*DUE|GRAND\s*TOTAL|TOTAL)/i;
  for(const line of lines.filter(x=>totalWords.test(x)).reverse()){
    const nums=line.match(/\d{1,3}(?:\.\d{3})*(?:,\d{2})|\d+(?:[.,]\d{2})/g)||[];
    const candidate=nums.map(moneyNumber).filter(n=>n!==null&&n>0).pop();
    if(candidate){totalGross=candidate;break;}
  }
  if(totalGross===null){
    const nums=(rawText.match(/\d{1,3}(?:\.\d{3})*(?:,\d{2})|\d+(?:[.,]\d{2})/g)||[]).map(moneyNumber).filter(n=>n!==null&&n>0&&n<100000000);
    if(nums.length)totalGross=Math.max(...nums);
  }
  return {supplierId,supplierName,documentNumber,documentDate,totalGross};
}

async function createJob(storeId,file,ocr){
  const response=await nativeFetch("/api/commerce/ai-reader/jobs",{
    method:"POST",headers:tokenHeaders(),body:JSON.stringify({
      storeId,filename:ocr.filename,mimeType:ocr.mimeType,dataUrl:ocr.dataUrl,localConfidence:ocr.confidence,
      result:{rawText:ocr.rawText,lines:ocr.lines,pageCount:ocr.pageCount,pdfNote:ocr.pdfNote}
    })
  });
  const data=await response.json().catch(()=>({}));
  if(!response.ok)throw new Error(data.error||`Αποτυχία OCR (${response.status}).`);
  return data;
}

async function capability(storeId){
  const response=await nativeFetch(`/api/store-pos/stores/${encodeURIComponent(storeId)}/capabilities`,{headers:tokenHeaders()});
  if(!response.ok)return false;
  const data=await response.json();return Boolean(data.invoiceAi);
}

const formState=new WeakMap();

function nativeSetValue(element,value){
  const proto=element instanceof HTMLSelectElement?HTMLSelectElement.prototype:HTMLInputElement.prototype;
  const setter=Object.getOwnPropertyDescriptor(proto,"value")?.set;
  setter?.call(element,String(value??""));
  element.dispatchEvent(new Event(element instanceof HTMLSelectElement?"change":"input",{bubbles:true}));
  element.dispatchEvent(new Event("change",{bubbles:true}));
}

function buildInvoicePanel(form,storeId){
  if(form.dataset.invoiceScanV2)return;
  form.dataset.invoiceScanV2="1";
  const typeButtons=[...form.querySelectorAll(".pos-payment-types button")];
  const supplierButton=typeButtons.find(b=>/Πληρωμή προμηθευτή/i.test(b.textContent||""));
  const supplierSelect=form.querySelector("select");
  const amountInput=[...form.querySelectorAll("input")].find(i=>i.inputMode==="decimal"||i.readOnly);
  const oldPhoto=form.querySelector(".pos-photo-actions");
  const oldAi=form.querySelector(".pos-ai-reader");
  const oldCheck=form.querySelector(".pos-check");
  const oldSubmit=[...form.querySelectorAll("button")].find(b=>/Καταχώριση πληρωμής/i.test(b.textContent||""));

  const panel=document.createElement("div");
  panel.className="pos-invoice-scan-v2";
  panel.style.cssText="border:2px solid #d8b45b;border-radius:12px;padding:14px;margin:12px 0;background:#fffaf0;display:none";
  panel.innerHTML=`
    <div style="font-weight:800;margin-bottom:8px">Αυτόματη καταχώρηση τιμολογίου</div>
    <label style="display:block;margin-bottom:8px">Σκάναρε / επίλεξε ολόκληρο το τιμολόγιο
      <input class="mws-invoice-file" type="file" accept="image/jpeg,image/png,image/webp,application/pdf" capture="environment" style="display:block;margin-top:6px;width:100%" />
    </label>
    <div class="mws-invoice-status" style="padding:8px;background:#fff;border-radius:8px;margin-bottom:8px">Περιμένει τιμολόγιο.</div>
    <label>Αριθμός τιμολογίου<input class="mws-doc-number" style="width:100%" /></label>
    <label>Ημερομηνία<input class="mws-doc-date" type="date" style="width:100%" /></label>
    <label>Συνολικό ποσό<input class="mws-doc-total" inputmode="decimal" style="width:100%" /></label>
    <div style="display:flex;gap:8px;margin:10px 0">
      <button type="button" class="mws-paid" style="flex:1">ΠΛΗΡΩΜΕΝΟ</button>
      <button type="button" class="mws-credit" style="flex:1">ΜΕ ΠΙΣΤΩΣΗ</button>
    </div>
    <small style="display:block;margin-bottom:8px">Και στις δύο περιπτώσεις το τιμολόγιο θα πάει στις Παραγγελίες & Αγορές για έλεγχο. Δεν ενημερώνεται stock και δεν αφαιρείται ποσό από τη βάρδια.</small>
    <button type="button" class="mws-submit-invoice" disabled style="width:100%;font-weight:800">Καταχώριση τιμολογίου για έλεγχο</button>`;
  (oldPhoto||oldAi||oldSubmit||form.lastElementChild)?.before(panel);

  const state={jobId:null,settlementMode:null,file:null,working:false};formState.set(form,state);
  const status=panel.querySelector(".mws-invoice-status");
  const fileInput=panel.querySelector(".mws-invoice-file");
  const docNumber=panel.querySelector(".mws-doc-number");
  const docDate=panel.querySelector(".mws-doc-date");
  const docTotal=panel.querySelector(".mws-doc-total");
  const paid=panel.querySelector(".mws-paid"),credit=panel.querySelector(".mws-credit"),submit=panel.querySelector(".mws-submit-invoice");

  const refreshSubmit=()=>{submit.disabled=state.working||!state.jobId||!state.settlementMode||!supplierSelect?.value||!docNumber.value.trim()||!(Number(String(docTotal.value).replace(",","."))>0)};
  [docNumber,docTotal,supplierSelect].filter(Boolean).forEach(el=>el.addEventListener("input",refreshSubmit));
  supplierSelect?.addEventListener("change",refreshSubmit);
  paid.onclick=()=>{state.settlementMode="PAID";paid.style.fontWeight="900";credit.style.fontWeight="400";refreshSubmit();};
  credit.onclick=()=>{state.settlementMode="CREDIT";credit.style.fontWeight="900";paid.style.fontWeight="400";refreshSubmit();};

  fileInput.onchange=async()=>{
    const file=fileInput.files?.[0];if(!file)return;
    state.file=file;state.working=true;state.jobId=null;refreshSubmit();status.textContent="Διαβάζω ολόκληρο το τιμολόγιο…";
    try{
      const ocr=await localOcr(file);
      const job=await createJob(storeId,file,ocr);state.jobId=job.id;
      const meta=extractInvoiceMeta(ocr.rawText,supplierSelect);
      if(meta.supplierId&&supplierSelect)nativeSetValue(supplierSelect,meta.supplierId);
      if(meta.totalGross){docTotal.value=meta.totalGross.toFixed(2);if(amountInput)nativeSetValue(amountInput,meta.totalGross.toFixed(2).replace(".",","));}
      if(meta.documentNumber)docNumber.value=meta.documentNumber;
      if(meta.documentDate)docDate.value=meta.documentDate;
      status.innerHTML=`OCR ${ocr.confidence}% · Προμηθευτής: <b>${meta.supplierName||"χρειάζεται επιλογή"}</b> · Αρ. τιμολογίου: <b>${meta.documentNumber||"χρειάζεται έλεγχο"}</b> · Σύνολο: <b>${meta.totalGross?meta.totalGross.toFixed(2)+" €":"χρειάζεται έλεγχο"}</b>`;
    }catch(error){status.textContent=error.message||"Η ανάγνωση απέτυχε.";}
    finally{state.working=false;refreshSubmit();}
  };

  submit.onclick=async()=>{
    refreshSubmit();if(submit.disabled)return;
    state.working=true;refreshSubmit();status.textContent="Στέλνω το τιμολόγιο στις Παραγγελίες & Αγορές…";
    try{
      const response=await nativeFetch(`/api/commerce/ai-reader/jobs/${encodeURIComponent(state.jobId)}/pos-intake`,{
        method:"POST",headers:tokenHeaders(),body:JSON.stringify({
          supplierId:supplierSelect.value,documentNumber:docNumber.value.trim(),documentDate:docDate.value||null,
          totalGross:Number(String(docTotal.value).replace(",",".")),settlementMode:state.settlementMode
        })
      });
      const data=await response.json().catch(()=>({}));if(!response.ok)throw new Error(data.error||"Η καταχώριση απέτυχε.");
      status.textContent=data.message||"Το τιμολόγιο στάλθηκε για έλεγχο.";
      submit.disabled=true;fileInput.disabled=true;paid.disabled=true;credit.disabled=true;
    }catch(error){status.textContent=error.message||"Η καταχώριση απέτυχε.";state.working=false;refreshSubmit();}
  };

  const syncVisibility=async()=>{
    const supplierMode=Boolean(supplierButton?.classList.contains("active"));
    const enabled=supplierMode&&await capability(storeId);
    panel.style.display=enabled?"block":"none";
    if(enabled){if(oldPhoto)oldPhoto.style.display="none";if(oldAi)oldAi.style.display="none";if(oldCheck)oldCheck.style.display="none";if(oldSubmit)oldSubmit.style.display="none";}
    else{if(oldPhoto)oldPhoto.style.display="";if(oldAi)oldAi.style.display="";if(oldCheck)oldCheck.style.display="";if(oldSubmit)oldSubmit.style.display="";}
  };
  typeButtons.forEach(button=>button.addEventListener("click",()=>setTimeout(syncVisibility,0)));
  syncVisibility();
}

function enhance(){
  const storeId=sessionStoreId();if(!storeId)return;
  document.querySelectorAll(".pos-payment-form").forEach(form=>buildInvoicePanel(form,storeId));
}

enhance();
new MutationObserver(enhance).observe(document.documentElement,{childList:true,subtree:true});
