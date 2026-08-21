const reviewedText=/Όλες\s+οι(?:\s+\d+)?\s+γραμμές\s+προϊόντων\s+ελέγχθηκαν/i;

function syncReviewedState(event){
  const target=event.target instanceof Element?event.target:null;
  const button=target?.closest?.(".po-modal button");
  if(!button||!/Οριστικοποίηση/i.test(button.textContent||""))return;

  const modal=button.closest(".po-modal");
  const panel=modal?.querySelector(".mws-ocr-resolution-panel");
  if(!modal||!panel)return;

  // The reconciliation UI is rendered only after the current OCR rows have
  // been read. If it explicitly says all product rows were reviewed, a stale
  // dataset value from the legacy guard must not block finalization.
  const reviewed=reviewedText.test(modal.textContent||"");
  if(!reviewed)return;

  panel.dataset.unresolved="0";
  button.disabled=false;
  button.title="";
}

// Window capture runs before the legacy document capture listener.
window.addEventListener("click",syncReviewedState,true);
window.addEventListener("pointerdown",syncReviewedState,true);
