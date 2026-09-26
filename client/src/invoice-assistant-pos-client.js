const esc=value=>String(value??"").replace(/[&<>"']/g,ch=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[ch]));
const number=value=>Number(String(value??"").replace(",","."));
const euro=value=>Number(value||0).toLocaleString("el-GR",{minimumFractionDigits:2,maximumFractionDigits:2});
const normalizePrintedUnit=value=>{const unit=String(value??"").trim().toUpperCase();if(["PIECE","ΤΜ","ΤΜΧ","ΤΕΜ","TM","TMX","TEM","PCS"].includes(unit))return "PIECE";if(["PACKAGE","ΠΑΚ","ΠΑΚ.","ΚΙΒ","ΚΙΒ.","BOX"].includes(unit))return "PACKAGE";return unit};
const validPrinted=(line,manuallyConfirmed=false)=>{
  if(!manuallyConfirmed&&line.confidence!=="certain"||!line.description?.trim()||!["PIECE","PACKAGE"].includes(line.invoiceUnit))return false;
  const fields=["quantity","unitCost","vatRate","discount1","discount2","discount3","exciseTotal","netAmount","grossAmount","stockUnitsPerInvoiceUnit"];
  if(fields.some(field=>String(line[field]??"").trim()===""||!Number.isFinite(number(line[field]))||number(line[field])<0))return false;
  if(number(line.quantity)<=0||number(line.vatRate)>100||number(line.stockUnitsPerInvoiceUnit)<1||!Number.isInteger(number(line.stockUnitsPerInvoiceUnit))||["discount1","discount2","discount3"].some(field=>number(line[field])>100))return false;
  const net=number(line.quantity)*number(line.unitCost)*["discount1","discount2","discount3"].reduce((factor,field)=>factor*(1-number(line[field])/100),1);
  return Math.abs(net-number(line.netAmount))<=0.05&&Math.abs((net+number(line.exciseTotal))*(1+number(line.vatRate)/100)-number(line.grossAmount))<=0.05;
};
const lineHtml=(line,index)=>`<div style="border-top:1px solid #e2ebef;padding:7px 0"><b>${index+1}. ${esc(line.description)}</b> ${line.supplierCode?`· ${esc(line.supplierCode)}`:""}<br>${esc(line.quantity)} ${line.invoiceUnit==="PACKAGE"?"πακέτα":"τεμ."} × ${esc(line.unitCost)} €${line.invoiceUnit==="PACKAGE"?` · απόθεμα ${esc(number(line.quantity)*number(line.stockUnitsPerInvoiceUnit))} τεμ.`:""} · εκπτώσεις ${esc(line.discount1||0)}/${esc(line.discount2||0)}/${esc(line.discount3||0)}%<br>Καθαρό ${euro(line.netAmount)} € · ΕΦΚ ${euro(line.exciseTotal)} € · ΦΠΑ ${esc(line.vatRate)}% · Πληρωτέο ${euro(line.grossAmount)} €</div>`;
const editableFields=["supplierCode","description","quantity","invoiceUnit","stockUnitsPerInvoiceUnit","unitCost","discount1","discount2","discount3","exciseTotal","vatRate"];
const rowAmounts=line=>{
  const net=number(line.quantity)*number(line.unitCost)*["discount1","discount2","discount3"].reduce((factor,field)=>factor*(1-number(line[field])/100),1);
  const vat=(net+number(line.exciseTotal))*number(line.vatRate)/100;
  return {net,vat,gross:net+number(line.exciseTotal)+vat};
};
const tableInput=(line,index,field)=>field==="invoiceUnit"?`<select data-row="${index}" data-field="${field}" aria-label="${esc(field)} γραμμής ${index+1}"><option value="PIECE" ${line[field]==="PIECE"?"selected":""}>τεμ.</option><option value="PACKAGE" ${line[field]==="PACKAGE"?"selected":""}>πακ.</option></select>`:`<input data-row="${index}" data-field="${field}" aria-label="${esc(labels[field]||field)} γραμμής ${index+1}" value="${esc(line[field]??"")}" style="width:${field==="description"?"220":"72"}px;box-sizing:border-box;padding:5px;border:1px solid #b6cad5;border-radius:4px">`;
const editableTable=lines=>`<div style="overflow:auto;max-height:38vh;border:1px solid #b7cdd9;border-radius:8px;background:white"><table style="border-collapse:collapse;min-width:1450px;width:100%;font-size:12px"><thead style="position:sticky;top:0;background:#153e5a;color:white"><tr>${["Επιλογή","#","Κωδ.","Περιγραφή","Ποσ.","ΜΜ","Τεμ./πακ.","Τιμή","Εκπτ. 1","2","3","Καθαρό","ΕΦΚ","ΦΠΑ %","ΦΠΑ €","Πληρωτέο"].map(label=>`<th style="padding:7px;white-space:nowrap">${label}</th>`).join("")}</tr></thead><tbody>${lines.map((line,index)=>{const amounts=rowAmounts(line);return `<tr style="border-bottom:1px solid #d8e5ec;background:${line.matchingLineId?"#fff":"#eaf8f1"}"><td><input type="checkbox" data-edit-select="${index}" aria-label="Επιλογή γραμμής ${index+1}"></td><td>${index+1}</td>${editableFields.map(field=>field==="exciseTotal"||field==="vatRate"?"":`<td style="padding:5px">${tableInput(line,index,field)}</td>`).join("")}<td data-net="${index}">${euro(amounts.net)}</td><td>${tableInput(line,index,"exciseTotal")}</td><td>${tableInput(line,index,"vatRate")}</td><td data-vat="${index}">${euro(amounts.vat)}</td><td data-gross="${index}">${euro(amounts.gross)}</td></tr>`}).join("")}</tbody></table></div>`;
const labels={description:"Περιγραφή",quantity:"Ποσότητα τιμολογίου",unitCost:"Τιμή μονάδας",invoiceUnit:"Μονάδα τιμολογίου",stockUnitsPerInvoiceUnit:"Τεμάχια ανά συσκευασία",discount1:"Έκπτωση 1",discount2:"Έκπτωση 2",discount3:"Έκπτωση 3",exciseTotal:"ΕΦΚ",vatRate:"ΦΠΑ %"};
const api=async(path,options={})=>{
  const token=localStorage.getItem("token");
  const response=await fetch(path,{...options,headers:{"Content-Type":"application/json",...(token?{Authorization:`Bearer ${token}`}:{}),...(options.headers||{})}});
  const result=await response.json().catch(()=>({}));
  if(!response.ok)throw new Error(result.error||`Σφάλμα ${response.status}`);
  return result;
};

export async function openPosInvoiceAssistant(orderId,order,onComplete){
  const overlay=document.createElement("div");
  overlay.style.cssText="position:fixed;inset:0;z-index:100100;background:#102c3cbb;padding:0;display:block";
  overlay.innerHTML=`<section role="dialog" aria-modal="true" aria-label="Βοηθός τιμολογίου POS" style="box-sizing:border-box;width:100%;height:100%;height:100dvh;background:#f7fafc;overflow:hidden;display:flex;flex-direction:column">
    <header style="display:flex;justify-content:space-between;align-items:center;gap:12px;background:#143f61;color:white;padding:13px 18px"><div><b>Βοηθός τιμολογίου POS</b><small style="display:block">Πρόχειρο ${esc(order.invoiceNumber||"")} · ${esc(order.supplierName||"προμηθευτής")}</small></div><button data-close type="button" aria-label="Κλείσιμο" style="font-size:22px">×</button></header>
    <div style="display:grid;grid-template-columns:minmax(280px,35%) minmax(0,1fr);min-height:0;flex:1">
      <div style="min-height:0;overflow:auto;padding:12px;background:#e9f0f5"><div data-pages></div></div>
      <div style="min-height:0;overflow:auto;padding:16px"><p style="margin:0 0 9px">Δες τις φωτογραφίες, πες τι θέλεις να διορθωθεί και έλεγξε τις προτάσεις πριν τις περάσεις στο πρόχειρο.</p>
        <details><summary style="cursor:pointer;font-weight:700">Αρχικό πρόχειρο POS · άνοιγμα για σύγκριση</summary><div data-current style="border:1px solid #d4e1e8;background:white;border-radius:10px;padding:9px;max-height:26vh;overflow:auto"></div></details>
        <label style="display:block;margin-top:12px;font-weight:700">Εντολή προς τον βοηθό<textarea data-message rows="3" style="box-sizing:border-box;width:100%;margin-top:5px;padding:10px;border:1px solid #a7bdc9;border-radius:8px" placeholder="π.χ. Οι γραμμές 1–3 είναι σε γραμμάρια και η 4 είναι 48 πακέτα × 100 τεμάχια"></textarea></label>
        <button data-ask type="button" style="margin-top:8px;padding:10px 15px;background:#075c8d;color:white;border:0;border-radius:7px;font-weight:800">Έλεγχος φωτογραφιών</button>
        <p data-status role="status" style="min-height:24px;color:#284d64"></p><div data-history aria-live="polite"></div><div data-answer></div><div data-printed></div><div data-proposals></div>
        <div style="margin-top:14px;padding:14px;background:#eaf5f1;border-radius:9px"><b>Εκμάθηση συσκευασίας ανά προμηθευτή</b><p>Διάλεξε προϊόν από τις γραμμές και όρισε πόσα τεμάχια έχει ένα κιβώτιο. Η τυπωμένη ποσότητα και αξία δεν αλλάζουν.</p><div style="display:flex;flex-wrap:wrap;align-items:end;gap:8px"><label>Προϊόν ή κωδικός<br><input data-rule-product list="invoice-assistant-rule-products" placeholder="Επίλεξε από το τιμολόγιο" style="width:260px"></label><datalist id="invoice-assistant-rule-products" data-rule-options></datalist><label>Τεμάχια σε 1 ΚΒ<br><input data-rule-factor type="number" min="1" step="1" value="24" style="width:105px"></label><button data-save-rule type="button">Αποθήκευση κανόνα</button></div><p data-rule-status role="status"></p><small>Ο κανόνας ισχύει για αυτόν τον προμηθευτή και κωδικό σε όλα τα καταστήματα. Η γραμμή ενημερώνεται στο ίδιο πρόχειρο.</small><input data-rule-tax type="hidden"></div>
        <button data-apply type="button" hidden style="margin-top:12px;padding:11px 15px;background:#087762;color:white;border:0;border-radius:8px;font-weight:800">Εφαρμογή επιλεγμένων στο πρόχειρο</button>
      </div>
    </div>
  </section>`;
  document.body.appendChild(overlay);
  let changed=false;
  const close=()=>{overlay.remove();if(changed)Promise.resolve(onComplete?.()).catch(error=>alert(error.message))},status=overlay.querySelector("[data-status]"),pages=overlay.querySelector("[data-pages]"),current=overlay.querySelector("[data-current]"),proposals=overlay.querySelector("[data-proposals]"),apply=overlay.querySelector("[data-apply]");
  overlay.querySelector("[data-close]").onclick=close;
  overlay.querySelector("[data-save-rule]").onclick=async()=>{
    const tax=overlay.querySelector("[data-rule-tax]").value.trim(),product=overlay.querySelector("[data-rule-product]").value.trim(),factor=Number(overlay.querySelector("[data-rule-factor]").value),ruleStatus=overlay.querySelector("[data-rule-status]");
    if(!/^\d{9}$/.test(tax)||!product||!Number.isInteger(factor)||factor<1){ruleStatus.textContent="Χρειάζεται ΑΦΜ εκδότη, προϊόν από τον πίνακα και θετικός ακέραιος αριθμός τεμαχίων.";return}
    const button=overlay.querySelector("[data-save-rule]");button.disabled=true;
    try{
      const matches=activePrintedRows.filter(row=>String(row.supplierCode||"").trim().toUpperCase()===product.toUpperCase()||String(row.description||"").trim().toUpperCase()===product.toUpperCase());
      if(matches.length!==1||!matches[0].supplierCode||!activePagesComplete||activePrintedTotal===null)throw new Error("Επίλεξε μία μοναδική γραμμή με τυπωμένο κωδικό από το τιμολόγιο.");
      const row={...matches[0],invoiceUnit:"PACKAGE",stockUnitsPerInvoiceUnit:factor};
      const code=String(row.supplierCode).trim();
      if(!validPrinted(row,true))throw new Error("Η γραμμή δεν έχει όλα τα ποσά. Διόρθωσέ την στον πίνακα πριν αποθηκεύσεις κανόνα.");
      const result=await api("/api/platform/invoice-learning/supplier-profile/stock-rules",{method:"PUT",body:JSON.stringify({orderId,supplierTaxId:tax,supplierName:order.supplierName||"",rules:[{supplierItemCode:code,invoiceUnit:"PACKAGE",stockUnit:"PIECE",factor}]})});
      ruleStatus.textContent=`Ο κανόνας αποθηκεύτηκε (έκδοση ${result.profileVersion}). Ενημερώνεται η γραμμή στο ίδιο πρόχειρο…`;
      const latest=await api(`/api/purchase-orders/${encodeURIComponent(orderId)}/detail`);
      if(latest.order.status!=="NEW"||latest.order.sourceType!=="POS_OCR_DRAFT")throw new Error("Ο κανόνας αποθηκεύτηκε, αλλά το πρόχειρο δεν είναι πλέον επεξεργάσιμο.");
      const existing=latest.lines.filter(line=>String(line.supplierCode||"").trim().toUpperCase()===code.toUpperCase());
      if(existing.length>1)throw new Error("Ο κανόνας αποθηκεύτηκε, αλλά υπάρχουν πολλαπλές γραμμές με τον ίδιο κωδικό στο πρόχειρο.");
      if(existing.length===1)await api(`/api/purchase-orders/${encodeURIComponent(orderId)}/lines/${encodeURIComponent(existing[0].id)}`,{method:"PATCH",body:JSON.stringify({invoiceUnit:"PACKAGE",stockUnitsPerInvoiceUnit:factor})});
      else await api(`/api/purchase-orders/${encodeURIComponent(orderId)}/lines`,{method:"POST",body:JSON.stringify({supplierCode:code,description:row.description.trim().slice(0,250),quantity:number(row.quantity),unitCost:number(row.unitCost),invoiceUnit:"PACKAGE",stockUnitsPerInvoiceUnit:factor,discount1:number(row.discount1),discount2:number(row.discount2),discount3:number(row.discount3),exciseTotal:number(row.exciseTotal),vatRate:number(row.vatRate)})});
      const after=await api(`/api/purchase-orders/${encodeURIComponent(orderId)}/detail`);
      current.innerHTML=`<b>Τρέχον πρόχειρο · ${after.lines.length} γραμμές · καθαρό ${euro(after.totals.net)} € · ΦΠΑ ${euro(after.totals.vat)} € · πληρωτέο ${euro(after.totals.gross)} €</b><div style="margin-top:7px">${after.lines.map(lineHtml).join("")}</div>`;
      matches[0].invoiceUnit="PACKAGE";matches[0].stockUnitsPerInvoiceUnit=factor;
      const index=activePrintedRows.indexOf(matches[0]);
      const factorInput=overlay.querySelector(`[data-row="${index}"][data-field="stockUnitsPerInvoiceUnit"]`),unitInput=overlay.querySelector(`[data-row="${index}"][data-field="invoiceUnit"]`);
      if(factorInput)factorInput.value=String(factor);if(unitInput)unitInput.value="PACKAGE";
      ruleStatus.textContent=`✓ Αποθηκεύτηκε κανόνας: ${order.supplierName||"προμηθευτής"} · ${row.description} · 1 ΚΒ = ${factor} ΤΜ. Η γραμμή ${code} ενημερώθηκε στο ίδιο πρόχειρο (${after.lines.length} γραμμές, ${euro(after.totals.gross)} €).`;
      lineById.clear();after.lines.forEach(line=>lineById.set(line.id,line));
      const savedLine=after.lines.find(line=>String(line.supplierCode||"").trim().toUpperCase()===code.toUpperCase());
      if(savedLine){matches[0].matchingLineId=savedLine.id;const box=overlay.querySelector(`[data-edit-select="${index}"]`);if(box){box.checked=false;box.closest("tr").style.background="#fff"}}
      changed=true;
    }
    catch(error){ruleStatus.textContent=error.message}finally{button.disabled=false}
  };
  const lineById=new Map();
  let source;const history=[];let activePrintedRows=[],activePagesComplete=false,activePrintedTotal=null;
  try{
    const [result,detail]=await Promise.all([
      api(`/api/commerce/purchase-orders/${encodeURIComponent(orderId)}/invoice-assistant/source`),
      api(`/api/purchase-orders/${encodeURIComponent(orderId)}/detail`)
    ]);
    source=result;
    overlay.querySelector("[data-rule-tax]").value=String(result.document.supplierTaxId||"");
    detail.lines.forEach(line=>lineById.set(line.id,line));
    pages.innerHTML=result.pages.map(page=>`<article style="margin-bottom:13px;background:white;padding:9px;border-radius:10px"><b>Σελίδα ${page.index}: ${esc(page.filename||"φωτογραφία")}</b><div style="overflow:auto;max-height:75vh;margin-top:8px" data-image-viewport>${page.mimeType==="application/pdf"?`<iframe title="Σελίδα ${page.index}" src="${esc(page.dataUrl)}" style="width:100%;height:70vh;border:0"></iframe>`:`<img src="${esc(page.dataUrl)}" alt="Σελίδα ${page.index}" draggable="false" style="display:block;width:100%;transform-origin:top left;cursor:grab;user-select:none;touch-action:none" data-zoom-image>`}</div></article>`).join("");
    pages.querySelectorAll("[data-zoom-image]").forEach(img=>{let zoom=1;const viewport=img.closest("[data-image-viewport]");let drag=null;
      img.addEventListener("wheel",event=>{event.preventDefault();zoom=Math.min(4,Math.max(0.75,zoom+(event.deltaY<0?0.15:-0.15)));img.style.width=`${zoom*100}%`},{passive:false});
      img.addEventListener("pointerdown",event=>{if(event.button!==0)return;event.preventDefault();drag={id:event.pointerId,x:event.clientX,y:event.clientY,left:viewport.scrollLeft,top:viewport.scrollTop};img.setPointerCapture(event.pointerId);img.style.cursor="grabbing"});
      img.addEventListener("pointermove",event=>{if(!drag||event.pointerId!==drag.id)return;viewport.scrollLeft=drag.left-(event.clientX-drag.x);viewport.scrollTop=drag.top-(event.clientY-drag.y)});
      const endDrag=event=>{if(!drag||event.pointerId!==drag.id)return;drag=null;img.style.cursor="grab";if(img.hasPointerCapture(event.pointerId))img.releasePointerCapture(event.pointerId)};
      img.addEventListener("pointerup",endDrag);img.addEventListener("pointercancel",endDrag);
    });
    current.innerHTML=`<b>Γραμμές που έχει τώρα το POS · ${detail.lines.length} · καθαρό ${euro(detail.totals.net)} € · ΦΠΑ ${euro(detail.totals.vat)} € · πληρωτέο ${euro(detail.totals.gross)} €</b><div style="margin-top:7px">${detail.lines.map(lineHtml).join("")}</div>`;
    status.textContent=`Προηγούμενη ανάγνωση πληρωτέου: ${euro(result.document.totalGross)} €. Επιβεβαίωσε στο έντυπο. Επίλεξε τι θα ελέγξει ο βοηθός.`;
  }catch(error){status.textContent=error.message;overlay.querySelector("[data-ask]").disabled=true;return}
  overlay.querySelector("[data-ask]").onclick=async()=>{
    const message=overlay.querySelector("[data-message]").value.trim();if(!message){status.textContent="Γράψε πρώτα τι θέλεις να ελέγξει.";return}
    const ask=overlay.querySelector("[data-ask]");ask.disabled=true;apply.hidden=true;proposals.replaceChildren();status.textContent="Ο βοηθός συγκρίνει τις φωτογραφίες με το πρόχειρο…";
    try{
      const result=await api(`/api/commerce/purchase-orders/${encodeURIComponent(orderId)}/invoice-assistant/preview`,{method:"POST",body:JSON.stringify({message,history:history.slice(-12)})});
      history.push({role:"user",text:message},{role:"assistant",text:result.assistantMessage||""});
      overlay.querySelector("[data-history]").innerHTML=history.map(entry=>`<p style="margin:4px 0"><b>${entry.role==="user"?"Εσύ":"Βοηθός"}:</b> ${esc(entry.text)}</p>`).join("");
      overlay.querySelector("[data-answer]").textContent=result.assistantMessage||"Ο έλεγχος ολοκληρώθηκε.";
      const printed=Array.isArray(result.printedLines)?result.printedLines.map(line=>({...line,invoiceUnit:normalizePrintedUnit(line.invoiceUnit),stockUnitsPerInvoiceUnit:normalizePrintedUnit(line.invoiceUnit)==="PIECE"&&String(line.stockUnitsPerInvoiceUnit??"").trim()===""?"1":line.stockUnitsPerInvoiceUnit})):[];
      const printedTotal=Number.isFinite(result.printedTotal)?result.printedTotal:null;
      const matched=new Set(printed.map(line=>line.matchingLineId).filter(Boolean));
      const calculatedGross=printed.reduce((sum,line)=>sum+rowAmounts(line).gross,0);
      const economicsAgree=printedTotal!==null&&printed.length>0&&Math.abs(calculatedGross-printedTotal)<=0.05;
      const missingPhysical=result.pagesComplete?printed.filter(line=>!line.matchingLineId):[];
      const missing=missingPhysical.filter(validPrinted);
      const extra=result.pagesComplete&&printed.length?[...lineById.values()].filter(line=>!matched.has(line.id)):[];
      if(!result.pagesComplete){status.textContent=result.pageWarning||"Το παραστατικό δεν διαβάστηκε πλήρως.";apply.hidden=true}
      else if(!economicsAgree){status.textContent=`Οι γραμμές του πρόχειρου υπολογίζονται σε ${euro(calculatedGross)} € αντί για ${euro(printedTotal)} € του εντύπου. Έλεγξε τις εκπτώσεις και τις αξίες πριν εφαρμόσεις αλλαγές.`;apply.hidden=true}
      activePagesComplete=result.pagesComplete;activePrintedTotal=printedTotal;
      const working=printed.map(line=>({...line,
        stockUnitsPerInvoiceUnit:line.stockUnitsPerInvoiceUnit
      }));
      activePrintedRows=working;
      overlay.querySelector("[data-rule-options]").innerHTML=working.filter(line=>line.supplierCode).map(line=>`<option value="${esc(line.supplierCode)}" label="${esc(line.description)}"></option>`).join("");
      const printedArea=overlay.querySelector("[data-printed]");
      proposals.after(apply);
      printedArea.innerHTML=`${result.pagesComplete?"":`<p role="alert" style="background:#fff0d5;border:2px solid #b75300;padding:12px;font-weight:800">${esc(result.pageWarning||"Ελλιπές τιμολόγιο")} Μην εφαρμόσεις αλλαγές.</p>`}<h3>Τιμολόγιο προς έλεγχο · ${working.length} γραμμές</h3><p>Διόρθωσε τα πεδία στον πίνακα. Οι αλλαγές μένουν εδώ μέχρι να επιλέξεις γραμμή και να πατήσεις εφαρμογή.${working.some(line=>number(line.unitDiscountAmount)>0)?" Η Έκπτωση 1 είναι το ισοδύναμο ποσοστό της τυπωμένης έκπτωσης ανά τεμάχιο, προσαρμοσμένο στη στρογγυλοποιημένη καθαρή αξία της ίδιας γραμμής. Έλεγξε την τυπωμένη έκπτωση στη φωτογραφία.":""}</p>${working.length?`<label style="display:block;margin:8px 0;font-weight:700"><input type="checkbox" data-select-all> Επιλογή όλων των γραμμών που έλεγξα στη φωτογραφία</label>${editableTable(working)}`:"Δεν αναγνωρίστηκαν γραμμές."}<div data-apply-slot style="margin:10px 0"></div><p data-apply-status role="status" style="font-weight:700;color:#18506b"></p><p data-working-total style="font-weight:800"></p><div data-detailed-totals></div>`;
      printedArea.querySelector("[data-apply-slot]").appendChild(apply);
      const applyNote=printedArea.querySelector("[data-apply-status]");
      const setApplyStatus=message=>{status.textContent=message;applyNote.textContent=message};
      const workingTotal=printedArea.querySelector("[data-working-total]");
      const refreshTotal=()=>{const amounts=working.map(rowAmounts);const net=working.reduce((sum,line,index)=>sum+amounts[index].net+number(line.exciseTotal),0);const vat=amounts.reduce((sum,row)=>sum+row.vat,0);const gross=amounts.reduce((sum,row)=>sum+row.gross,0);workingTotal.textContent=`Καθαρό με ΕΦΚ ${euro(net)} € + ΦΠΑ ${euro(vat)} € = ${euro(gross)} € · τυπωμένο ${printedTotal===null?"μη αναγνώσιμο":`${euro(printedTotal)} €`} · διαφορά ${printedTotal===null?"—":`${euro(Math.abs(gross-printedTotal))} €`}`;const taxGroups=new Map();working.forEach((line,index)=>{const rate=number(line.vatRate),group=taxGroups.get(rate)||{net:0,vat:0};group.net+=amounts[index].net+number(line.exciseTotal);group.vat+=amounts[index].vat;taxGroups.set(rate,group)});printedArea.querySelector("[data-detailed-totals]").innerHTML=`<div style="background:#eef4f7;padding:12px;border-radius:8px"><b>Σύνολα τιμολογίου</b><div>Σύνολο ποσότητας παραστατικού: <b>${euro(working.reduce((sum,line)=>sum+number(line.quantity),0))}</b></div>${[...taxGroups].sort((a,b)=>a[0]-b[0]).map(([rate,group])=>`<div>Καθαρή αξία ΦΠΑ ${esc(rate)}%: ${euro(group.net)} € · ΦΠΑ: ${euro(group.vat)} €</div>`).join("")}<div>Καθαρή αξία: <b>${euro(net)} €</b> · ΦΠΑ: <b>${euro(vat)} €</b></div><div style="background:#daf3e5;padding:8px;margin-top:6px;font-size:20px;font-weight:800">Πληρωτέο ${euro(gross)} €</div></div>`;apply.hidden=!result.pagesComplete||printedTotal===null||Math.abs(gross-printedTotal)>0.05};
      refreshTotal();
      printedArea.querySelector("[data-select-all]")?.addEventListener("change",event=>{printedArea.querySelectorAll("[data-edit-select]").forEach(box=>box.checked=event.target.checked)});
      printedArea.addEventListener("change",event=>{const index=Number(event.target.dataset.editSelect);if(event.target.checked&&Number.isInteger(index)&&working[index]?.supplierCode){overlay.querySelector("[data-rule-product]").value=working[index].supplierCode;overlay.querySelector("[data-rule-factor]").value=number(working[index].stockUnitsPerInvoiceUnit)>1?working[index].stockUnitsPerInvoiceUnit:"24"}});
      printedArea.addEventListener("input",event=>{const field=event.target.dataset.field,index=Number(event.target.dataset.row);if(!field||!working[index])return;working[index][field]=event.target.value;const amounts=rowAmounts(working[index]);working[index].netAmount=amounts.net.toFixed(2);working[index].grossAmount=amounts.gross.toFixed(2);for(const [name,value] of Object.entries(amounts)){const cell=printedArea.querySelector(`[data-${name}="${index}"]`);if(cell)cell.textContent=euro(value)}refreshTotal()});

      const valid=result.corrections.filter(change=>lineById.has(change.lineId)&&labels[change.field]);
      proposals.innerHTML=`${valid.length||extra.length?`<h3>Άλλες προτάσεις για το πρόχειρο</h3><p>Επίλεξε μόνο όσα επιβεβαιώνεις στη φωτογραφία.</p>`:""}${valid.map((change,index)=>{const line=lineById.get(change.lineId);return `<label style="display:block;background:#fff9dc;border-left:4px solid #c48009;margin:6px 0;padding:9px"><input type="checkbox" data-change="${index}"> <b>${esc(line.description)} · ${esc(labels[change.field])}</b><br><small>Τώρα: ${esc(line[change.field]??"—")} → Πρόταση: ${esc(change.value)}</small><br><small>${esc(change.reason)}</small></label>`}).join("")}${extra.map((line,index)=>`<label style="display:block;background:#ffe8e6;margin:6px 0;padding:9px"><input type="checkbox" data-delete="${index}"> Διαγραφή από πρόχειρο: ${esc(line.description)} · ${euro(line.grossAmount)} € <small>(δεν αντιστοιχίστηκε στο έντυπο· επιβεβαίωσε ότι δεν υπάρχει σε άλλη σελίδα)</small></label>`).join("")}`;
      if(result.pagesComplete){apply.hidden=!economicsAgree;apply.onclick=async()=>{
        const currentGross=working.reduce((sum,line)=>sum+rowAmounts(line).gross,0);
        if(printedTotal===null||Math.abs(currentGross-printedTotal)>0.05){setApplyStatus("Οι υπολογισμένες γραμμές δεν συμφωνούν με το τυπωμένο πληρωτέο εντός 0,05 €. Διόρθωσε πρώτα τις αξίες.");return}
        let chosen=[...proposals.querySelectorAll("[data-change]:checked")].map(node=>valid[Number(node.dataset.change)]);
        const additions=[...proposals.querySelectorAll("[data-add]:checked")].map(node=>missing[Number(node.dataset.add)]);
        const deletions=[...proposals.querySelectorAll("[data-delete]:checked")].map(node=>extra[Number(node.dataset.delete)]);
        const edited=[...printedArea.querySelectorAll("[data-edit-select]:checked")].map(node=>working[Number(node.dataset.editSelect)]);
        const rowPatches=new Map();
        for(const row of edited){
          if(!validPrinted(row,true)){setApplyStatus(`Έλεγξε τα ποσά και τα υποχρεωτικά πεδία της γραμμής ${row.sequence}.`);return}
          if(!row.matchingLineId){const previous=additions.findIndex(line=>line.sequence===row.sequence);if(previous>=0)additions[previous]=row;else additions.push(row);continue}
          const before=lineById.get(row.matchingLineId);if(!before){setApplyStatus("Η γραμμή του πρόχειρου άλλαξε. Άνοιξε ξανά τον βοηθό.");return}
          const patch={};for(const field of editableFields){const value=row[field];if(field==="supplierCode"||field==="description"||field==="invoiceUnit"){if(String(value??"")!==String(before[field]??""))patch[field]=value}else if(Math.abs(number(value)-number(before[field]))>0.000001)patch[field]=number(value)}
          if(Object.keys(patch).length){rowPatches.set(row.matchingLineId,patch);chosen=chosen.filter(change=>change.lineId!==row.matchingLineId)}
        }
        if(!chosen.length&&!additions.length&&!deletions.length&&!rowPatches.size){setApplyStatus("Επίλεξε τις γραμμές στον πίνακα ή την επιλογή όλων αφού τις συγκρίνεις με τη φωτογραφία. Έπειτα πάτησε ξανά Εφαρμογή.");return}
        const grouped=new Map();for(const change of chosen){const patch=grouped.get(change.lineId)||{};patch[change.field]=change.field==="description"||change.field==="invoiceUnit"?change.value:number(change.value);grouped.set(change.lineId,patch)}
        for(const [lineId,patch] of rowPatches)grouped.set(lineId,patch);
        for(const patch of grouped.values())if(Number(patch.stockUnitsPerInvoiceUnit)>1&&patch.invoiceUnit===undefined)patch.invoiceUnit="PACKAGE";
        apply.disabled=true;let done=0;try{
          const latest=await api(`/api/purchase-orders/${encodeURIComponent(orderId)}/detail`);
          if(latest.order.status!=="NEW"||latest.order.sourceType!=="POS_OCR_DRAFT")throw new Error("Το πρόχειρο δεν είναι πλέον διαθέσιμο για αλλαγές.");
          const now=new Map(latest.lines.map(line=>[line.id,line]));
          if(now.size!==lineById.size||[...lineById].some(([id,line])=>!now.has(id)||["description","quantity","unitCost","netAmount","grossAmount"].some(field=>String(now.get(id)[field]??"")!==String(line[field]??""))))throw new Error("Το πρόχειρο άλλαξε στο μεταξύ. Κλείσε και άνοιξε ξανά τον βοηθό.");
          for(const change of chosen)if(!now.has(change.lineId)||String(now.get(change.lineId)[change.field]??"")!==String(lineById.get(change.lineId)[change.field]??""))throw new Error("Μια επιλεγμένη γραμμή άλλαξε στο μεταξύ. Κλείσε και άνοιξε ξανά τον βοηθό.");
          for(const [lineId,patch] of grouped){await api(`/api/purchase-orders/${encodeURIComponent(orderId)}/lines/${encodeURIComponent(lineId)}`,{method:"PATCH",body:JSON.stringify(patch)});done++}
          for(const line of additions){const created=await api(`/api/purchase-orders/${encodeURIComponent(orderId)}/lines`,{method:"POST",body:JSON.stringify({supplierCode:line.supplierCode||null,description:line.description.trim().slice(0,250),quantity:number(line.quantity),unitCost:number(line.unitCost),invoiceUnit:line.invoiceUnit,stockUnitsPerInvoiceUnit:number(line.stockUnitsPerInvoiceUnit),discount1:number(line.discount1),discount2:number(line.discount2),discount3:number(line.discount3),exciseTotal:number(line.exciseTotal),vatRate:number(line.vatRate)})});line.matchingLineId=created.id;done++}
          for(const line of deletions){await api(`/api/purchase-orders/${encodeURIComponent(orderId)}/lines/${encodeURIComponent(line.id)}`,{method:"DELETE"});done++}
          const after=await api(`/api/purchase-orders/${encodeURIComponent(orderId)}/detail`);
          const difference=Math.abs(Number(after.totals.gross||0)-Number(printedTotal??source.document.totalGross??0));
          setApplyStatus(`Αποθηκεύτηκαν ${done} γραμμές. Σύνολο πρόχειρου ${euro(after.totals.gross)} € · ${printedTotal===null?"προηγούμενη ανάγνωση":"τυπωμένο"} ${euro(printedTotal??source.document.totalGross)} € · διαφορά ${euro(difference)} €.${printedTotal===null?" Επιβεβαίωσε το πληρωτέο στο έντυπο.":difference>0.05?" Χρειάζεται επιπλέον έλεγχος.":" Το πληρωτέο συμφωνεί εντός 0,05 €· έλεγξε και κάθε είδος."}`);
          lineById.clear();after.lines.forEach(line=>lineById.set(line.id,line));
          current.innerHTML=`<b>Τρέχον πρόχειρο · ${after.lines.length} γραμμές · καθαρό ${euro(after.totals.net)} € · ΦΠΑ ${euro(after.totals.vat)} € · πληρωτέο ${euro(after.totals.gross)} €</b><div style="margin-top:7px">${after.lines.map(lineHtml).join("")}</div>`;
          printedArea.querySelectorAll("[data-edit-select]:checked").forEach(box=>box.checked=false);
          working.forEach((row,index)=>{const tr=printedArea.querySelector(`[data-edit-select="${index}"]`)?.closest("tr");if(tr&&row.matchingLineId)tr.style.background="#fff"});
          proposals.replaceChildren();apply.hidden=false;changed=true;
        }catch(error){status.textContent=`Αποθηκεύτηκαν ${done} γραμμές. ${error.message}`}finally{apply.disabled=false}
      }}
      status.textContent=result.pagesComplete?`Έλεγχος ολοκληρώθηκε · ${valid.length} διορθώσεις υπαρχουσών γραμμών, ${missingPhysical.length} γραμμές που λείπουν από το πρόχειρο (${missing.length} πλήρως συμπληρωμένες), ${extra.length} γραμμές προς έλεγχο διαγραφής. ${printedTotal===null?"Πληρωτέο από προηγούμενη ανάγνωση":"Τυπωμένο πληρωτέο"} ${euro(printedTotal??source.document.totalGross)} €.`:result.pageWarning||"Το παραστατικό δεν διαβάστηκε πλήρως.";
    }catch(error){status.textContent=error.message}finally{ask.disabled=false}
  };
  overlay.querySelector("[data-message]").value="Σύγκρινε όλες τις τυπωμένες γραμμές με το πρόχειρο. Δείξε μόνο συγκεκριμένα λάθη που διακρίνονται καθαρά στη φωτογραφία και πες μου τι χρειάζεται έλεγχο.";
  overlay.querySelector("[data-ask]").click();
}
