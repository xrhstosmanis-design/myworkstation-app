function setFiles(target,files){
  if(!target||!files?.length)return;
  try{
    const dt=new DataTransfer();
    [...files].forEach(file=>dt.items.add(file));
    target.files=dt.files;
    target.dispatchEvent(new Event('change',{bubbles:true}));
  }catch(error){
    console.warn('Invoice file forwarding failed',error);
  }
}

function enhancePanel(panel){
  if(panel.dataset.uiCompat==='1')return;
  panel.dataset.uiCompat='1';

  const original=panel.querySelector('.mws-invoice-file');
  if(original){
    const label=original.closest('label');
    if(label){
      label.innerHTML=`<span style="display:block;font-weight:800;margin-bottom:8px">Σκάναρε ή επίλεξε ολόκληρο το τιμολόγιο</span>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
          <button type="button" class="mws-camera-action" style="padding:14px;font-weight:800;border:1px solid #92bdb0;border-radius:10px;background:#eef9f5">📷 Λήψη από κάμερα</button>
          <button type="button" class="mws-file-action" style="padding:14px;font-weight:800;border:1px solid #92bdb0;border-radius:10px;background:#eef9f5">📄 Επιλογή αρχείου / PDF</button>
        </div>
        <input class="mws-camera-input" type="file" accept="image/*" capture="environment" hidden>
        <input class="mws-file-input" type="file" accept="image/jpeg,image/png,image/webp,application/pdf" hidden>`;
      label.appendChild(original);
      original.hidden=true;
      const camera=label.querySelector('.mws-camera-input');
      const file=label.querySelector('.mws-file-input');
      label.querySelector('.mws-camera-action')?.addEventListener('click',()=>camera?.click());
      label.querySelector('.mws-file-action')?.addEventListener('click',()=>file?.click());
      camera?.addEventListener('change',()=>setFiles(original,camera.files));
      file?.addEventListener('change',()=>setFiles(original,file.files));
    }
  }

  const note=[...panel.querySelectorAll('small')].find(el=>/Και στις δύο περιπτώσεις/i.test(el.textContent||''));
  if(note)note.innerHTML='<b>ΠΛΗΡΩΜΕΝΟ:</b> αφαιρείται κανονικά από τα μετρητά της ενεργής βάρδιας. <b>ΜΕ ΠΙΣΤΩΣΗ:</b> δεν αφαιρείται τίποτα από τη βάρδια. Και στις δύο περιπτώσεις το τιμολόγιο πηγαίνει στις Παραγγελίες & Αγορές για έλεγχο και η αποθήκη ενημερώνεται μόνο μετά την Οριστικοποίηση.';

  const form=panel.closest('.pos-payment-form');
  if(form){
    [...form.querySelectorAll('label,div,button')].forEach(el=>{
      if(panel.contains(el))return;
      const text=(el.textContent||'').trim();
      if(/Αφαίρεση από τα μετρητά της βάρδιας/i.test(text)||/^OCR \+ AI/i.test(text)){
        el.style.display='none';
      }
    });
  }
}

function enhance(){
  document.querySelectorAll('.pos-invoice-scan-v2').forEach(enhancePanel);
}

enhance();
new MutationObserver(enhance).observe(document.documentElement,{childList:true,subtree:true});
