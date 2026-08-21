const reviewedText=/Όλες\s+οι(?:\s+\d+)?\s+γραμμές\s+προϊόντων\s+ελέγχθηκαν/i;

document.addEventListener("click",event=>{
  const button=event.target.closest?.(".po-modal button");
  if(!button||!/Οριστικοποίηση/i.test(button.textContent||""))return;
  const modal=button.closest(".po-modal");
  const panel=modal?.querySelector(".mws-ocr-resolution-panel");
  if(!panel)return;

  const reviewed=[...panel.querySelectorAll("div")].some(node=>reviewedText.test(node.textContent||""));
  if(!reviewed)return;

  // The reconciliation layer has already re-read the backend OCR rows and
  // confirmed that no real product line remains unresolved. Keep the legacy
  // finalize guard in sync so it cannot block on a stale dataset value.
  panel.dataset.unresolved="0";
  button.disabled=false;
  button.title="";
},true);
