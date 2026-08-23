const LAB_PATH='/platform-admin/invoice-learning-lab';
if(window.location.pathname.replace(/\/+$/,'')===LAB_PATH){
  const authHeaders=()=>({Authorization:`Bearer ${localStorage.getItem('token')||''}`});
  const checksum12=digits=>{
    const s=String(digits);
    let sum=0;
    for(let i=0;i<12;i++)sum+=Number(s[i])*(i%2===0?1:3);
    return String((10-(sum%10))%10);
  };
  const random9=()=>{
    const a=new Uint32Array(3);
    if(window.crypto?.getRandomValues)window.crypto.getRandomValues(a);else{a[0]=Date.now();a[1]=Math.random()*0xffffffff;a[2]=performance.now()*1000000;}
    return String((BigInt(a[0])<<64n)^(BigInt(a[1])<<32n)^BigInt(a[2])).replace('-','').slice(-9).padStart(9,'0');
  };
  async function existingBarcodes(){
    try{
      const r=await fetch('/api/platform/invoice-learning/product-knowledge',{headers:authHeaders()});
      const d=await r.json().catch(()=>({}));
      if(!r.ok)return new Set();
      return new Set((d.products||[]).map(x=>String(x.barcode||'').trim()).filter(Boolean));
    }catch{return new Set()}
  }
  async function makeInternalBarcode(){
    const used=await existingBarcodes();
    for(let i=0;i<30;i++){
      const base='290'+random9(); // 29x = restricted/internal circulation range, 12 digits before checksum
      const ean=base+checksum12(base);
      if(!used.has(ean))return ean;
    }
    throw new Error('Δεν μπόρεσε να δημιουργηθεί μοναδικό barcode. Δοκίμασε ξανά.');
  }
  function install(modal){
    if(!modal||modal.dataset.mwsBarcodeGenerator==='1')return;
    const input=modal.querySelector('[data-barcode]');
    if(!input)return;
    modal.dataset.mwsBarcodeGenerator='1';
    const wrap=document.createElement('div');
    wrap.style.cssText='display:flex;gap:8px;align-items:center;margin-top:8px;flex-wrap:wrap';
    const button=document.createElement('button');
    button.type='button';
    button.textContent='⚙ Generate Barcode';
    button.style.cssText='border:0;border-radius:8px;padding:10px 14px;background:#0f8877;color:#fff;font-weight:900;cursor:pointer';
    const note=document.createElement('span');
    note.textContent='Δημιουργεί δικό μας έγκυρο EAN-13 μόνο όταν το προϊόν δεν έχει barcode.';
    note.style.cssText='font-size:12px;color:#5f7180';
    button.onclick=async()=>{
      if(String(input.value||'').trim()&&!confirm('Υπάρχει ήδη barcode. Θέλεις να το αντικαταστήσεις με δικό μας;'))return;
      button.disabled=true;button.textContent='Δημιουργία…';
      try{
        const code=await makeInternalBarcode();
        input.value=code;
        input.dispatchEvent(new Event('input',{bubbles:true}));
        input.dispatchEvent(new Event('change',{bubbles:true}));
        note.textContent=`MWS internal barcode: ${code}`;
      }catch(e){alert(e.message||'Αποτυχία δημιουργίας barcode.')}finally{button.disabled=false;button.textContent='⚙ Generate Barcode'}
    };
    input.insertAdjacentElement('afterend',wrap);wrap.append(button,note);
  }
  const scan=()=>document.querySelectorAll('.pb-modal').forEach(install);
  const obs=new MutationObserver(scan);obs.observe(document.documentElement,{childList:true,subtree:true});scan();
}
