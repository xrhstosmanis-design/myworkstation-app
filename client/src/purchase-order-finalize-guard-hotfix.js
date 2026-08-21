const reviewedText=/Όλες\s+οι(?:\s+\d+)?\s+γραμμές\s+προϊόντων\s+ελέγχθηκαν/i;
let activeOrderId="";

function tokenHeaders(){
  const token=localStorage.getItem("token");
  return {"Content-Type":"application/json",...(token?{Authorization:`Bearer ${token}`}:{})};
}

async function finalizeReviewedOrder(button,modal){
  if(!activeOrderId){
    alert("Δεν βρέθηκε η ενεργή παραγγελία. Κλείσε και άνοιξε ξανά την παραγγελία.");
    return;
  }
  const originalText=button.textContent;
  button.disabled=true;
  button.textContent="Οριστικοποίηση…";
  try{
    const response=await fetch(`/api/purchase-orders/${encodeURIComponent(activeOrderId)}`,{
      method:"PATCH",
      headers:tokenHeaders(),
      body:JSON.stringify({status:"FINAL"})
    });
    const data=await response.json().catch(()=>({}));
    if(!response.ok)throw new Error(data.error||`Σφάλμα ${response.status}`);

    modal.closest(".po-modal-overlay")?.remove();
    document.querySelector("[data-po-refresh]")?.click();
  }catch(error){
    button.disabled=false;
    button.textContent=originalText;
    alert(error.message||"Δεν ολοκληρώθηκε η οριστικοποίηση.");
  }
}

window.addEventListener("click",event=>{
  const target=event.target instanceof Element?event.target:null;
  const open=target?.closest?.("[data-po-open]");
  if(open?.dataset?.poOpen){activeOrderId=open.dataset.poOpen;return;}

  const button=target?.closest?.(".po-modal button");
  if(!button||!/Οριστικοποίηση/i.test(button.textContent||""))return;

  const modal=button.closest(".po-modal");
  const panel=modal?.querySelector(".mws-ocr-resolution-panel");
  if(!modal||!panel)return;

  const reviewed=reviewedText.test(modal.textContent||"");
  if(!reviewed)return;

  // This order has already been confirmed by the current reconciliation UI.
  // Stop the legacy stale guard completely and finalize through the normal API.
  panel.dataset.unresolved="0";
  event.preventDefault();
  event.stopImmediatePropagation();
  void finalizeReviewedOrder(button,modal);
},true);
