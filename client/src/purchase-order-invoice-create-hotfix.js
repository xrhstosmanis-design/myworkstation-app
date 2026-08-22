const previousFetch=window.fetch.bind(window);

let latestInvoiceJobId="";
const activeInvoiceModal=()=>[...document.querySelectorAll(".po-modal")].reverse().find(modal=>modal.querySelector('form[data-new-order]')&&modal.querySelector('[data-create-invoice]'))||null;
const authHeaders=()=>{const token=localStorage.getItem("token")||sessionStorage.getItem("storeOperatorToken");return {"Content-Type":"application/json",...(token?{Authorization:`Bearer ${token}`}:{})}};
const normalizeDate=value=>{const text=String(value||"").trim();if(!text)return null;if(/^\d{4}-\d{2}-\d{2}$/.test(text))return text;const match=text.match(/^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{4})$/);if(!match)return null;return `${match[3]}-${String(match[2]).padStart(2,"0")}-${String(match[1]).padStart(2,"0")}`};
const parseAmount=value=>{const text=String(value??"").trim().replace(/\s/g,"");const normalized=text.includes(",")?text.replace(/\./g,"").replace(",","."):text;const number=Number(normalized.replace(/[^0-9.-]/g,""));return Number.isFinite(number)?number:0};
const setStatus=(modal,text,error=false)=>{const el=modal?.querySelector("[data-invoice-status]");if(!el)return;el.textContent=text;el.style.background=error?"#fff1f2":"#ecfdf5";el.style.color=error?"#991b1b":"#065f46"};

window.fetch=async function(input,init={}){
  const url=typeof input==="string"?input:input?.url||"";
  const match=url.match(/\/api\/commerce\/ai-reader\/jobs\/([^/]+)\/ai-recheck(?:\?|$)/);
  if(match){
    latestInvoiceJobId=decodeURIComponent(match[1]);
    const modal=activeInvoiceModal();
    if(modal)modal.dataset.invoiceJobId=latestInvoiceJobId;
  }
  return previousFetch(input,init);
};

async function runCreate(button){
  const modal=button.closest(".po-modal")||activeInvoiceModal();
  if(!modal)return;
  if(button.dataset.invoiceCreating==="1")return;

  setStatus(modal,"Έλεγχος στοιχείων πριν τη δημιουργία…");
  const jobId=String(modal.dataset.invoiceJobId||latestInvoiceJobId||"").trim();
  const reviewedLines=Math.max(Number(modal.dataset.invoiceProductLines||0),Number(modal.querySelectorAll("[data-invoice-product-lines] tbody tr").length||0),Number(modal.querySelectorAll("[data-product-lines-review] tbody tr").length||0));
  const form=modal.querySelector('form[data-new-order]');
  const supplierId=String(form?.querySelector('[name="supplierId"]')?.value||"").trim();
  const documentNumber=String(form?.querySelector('[name="invoiceNumber"]')?.value||"").trim();
  const documentDate=normalizeDate(modal.querySelector("[data-doc-date]")?.value)||null;
  const totalGross=parseAmount(modal.querySelector("[data-doc-total]")?.value);

  if(!jobId){setStatus(modal,"Δεν βρέθηκε το job του επανελέγχου. Πάτησε «Επανέλεγχος με AI» και ξαναδοκίμασε.",true);return}
  if(reviewedLines<=0){setStatus(modal,"Δεν υπάρχουν ελεγμένες γραμμές προϊόντων. Κάνε πρώτα επανέλεγχο.",true);return}
  if(!supplierId){setStatus(modal,"Επίλεξε/επιβεβαίωσε Προμηθευτή.",true);return}
  if(!documentNumber){setStatus(modal,"Επιβεβαίωσε τον αριθμό τιμολογίου.",true);return}
  if(!(totalGross>0)){setStatus(modal,"Επιβεβαίωσε το συνολικό ποσό με ΦΠΑ.",true);return}

  button.dataset.invoiceCreating="1";
  button.disabled=true;
  setStatus(modal,"Δημιουργία πρόχειρης παραγγελίας για έλεγχο…");
  try{
    const response=await previousFetch(`/api/commerce/ai-reader/jobs/${encodeURIComponent(jobId)}/pos-intake`,{
      method:"POST",
      headers:authHeaders(),
      body:JSON.stringify({supplierId,documentNumber:documentNumber.slice(0,80),documentDate,totalGross,settlementMode:"CREDIT",note:`BackOffice εισαγωγή τιμολογίου ${documentNumber} — Azure/AI έλεγχος πριν την οριστικοποίηση`.slice(0,500)})
    });
    const data=await response.json().catch(()=>({}));
    if(!response.ok){const detail=Array.isArray(data?.details)&&data.details.length?` (${data.details.map(issue=>Array.isArray(issue.path)?issue.path.join("."):"").filter(Boolean).join(", ")})`:"";throw new Error(`${data.error||`Σφάλμα ${response.status}`}${detail}`)}
    const orderId=data.purchaseOrderId||data.orderId||null;
    if(orderId)sessionStorage.setItem("mws:last-imported-purchase-order",orderId);
    setStatus(modal,`✓ Η παραγγελία δημιουργήθηκε με ${Number(data.lineCount||reviewedLines)} γραμμές. Δεν ενημερώθηκε stock.`);
    setTimeout(()=>{modal.closest(".po-modal-overlay")?.remove();document.querySelector(".purchase-orders-suite [data-po-refresh]")?.click();},700);
  }catch(error){button.disabled=false;delete button.dataset.invoiceCreating;setStatus(modal,error.message||"Αποτυχία δημιουργίας παραγγελίας.",true)}
}

function bindButton(button){
  if(!button||button.dataset.createHotfixBound==="1")return;
  button.dataset.createHotfixBound="1";
  button.addEventListener("click",event=>{event.preventDefault();event.stopPropagation();event.stopImmediatePropagation();runCreate(button)},true);
}
function scan(){document.querySelectorAll("[data-create-invoice]").forEach(bindButton);const modal=activeInvoiceModal();if(modal&&latestInvoiceJobId&&!modal.dataset.invoiceJobId)modal.dataset.invoiceJobId=latestInvoiceJobId}
new MutationObserver(scan).observe(document.documentElement,{childList:true,subtree:true});
scan();
