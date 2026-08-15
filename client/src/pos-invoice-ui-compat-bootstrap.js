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

const bytesFromDataUrl=dataUrl=>{
  const binary=atob(String(dataUrl).split(',')[1]||'');
  const out=new Uint8Array(binary.length);
  for(let i=0;i<binary.length;i+=1)out[i]=binary.charCodeAt(i);
  return out;
};

function jpegSize(bytes){
  let i=2;
  while(i+9<bytes.length){
    if(bytes[i]!==0xff){i+=1;continue;}
    const marker=bytes[i+1];
    const len=(bytes[i+2]<<8)+bytes[i+3];
    if([0xc0,0xc1,0xc2,0xc3,0xc5,0xc6,0xc7,0xc9,0xca,0xcb,0xcd,0xce,0xcf].includes(marker)){
      return {height:(bytes[i+5]<<8)+bytes[i+6],width:(bytes[i+7]<<8)+bytes[i+8]};
    }
    if(!len)break;
    i+=2+len;
  }
  return {width:1200,height:1600};
}

function makePdfFromJpegs(images){
  const enc=new TextEncoder();
  const parts=[];
  const offsets=[0];
  let length=0;
  const push=value=>{const b=typeof value==='string'?enc.encode(value):value;parts.push(b);length+=b.length;};
  const obj=(id,body)=>{offsets[id]=length;push(`${id} 0 obj\n${body}\nendobj\n`);};
  const streamObj=(id,dict,data)=>{offsets[id]=length;push(`${id} 0 obj\n<< ${dict} /Length ${data.length} >>\nstream\n`);push(data);push(`\nendstream\nendobj\n`);};

  const prepared=images.map((img,index)=>{
    const bytes=bytesFromDataUrl(img.dataUrl);
    const size=jpegSize(bytes);
    return {...size,bytes,name:`Im${index+1}`};
  });
  const pageWidth=595;
  const placements=[];
  let pageHeight=0;
  prepared.forEach(img=>{
    const h=pageWidth*(img.height/img.width);
    placements.push({h,y:pageHeight});
    pageHeight+=h;
  });
  pageHeight=Math.max(pageHeight,842);

  push('%PDF-1.4\n');
  const catalogId=1,pagesId=2,pageId=3,contentId=4;
  const firstImageId=5;
  obj(catalogId,`<< /Type /Catalog /Pages ${pagesId} 0 R >>`);
  obj(pagesId,`<< /Type /Pages /Kids [${pageId} 0 R] /Count 1 >>`);
  const xobjs=prepared.map((img,i)=>`/${img.name} ${firstImageId+i} 0 R`).join(' ');
  obj(pageId,`<< /Type /Page /Parent ${pagesId} 0 R /MediaBox [0 0 ${pageWidth} ${pageHeight.toFixed(2)}] /Resources << /XObject << ${xobjs} >> >> /Contents ${contentId} 0 R >>`);
  let commands='';
  let cursor=pageHeight;
  prepared.forEach((img,i)=>{
    const h=placements[i].h;cursor-=h;
    commands+=`q ${pageWidth.toFixed(2)} 0 0 ${h.toFixed(2)} 0 ${cursor.toFixed(2)} cm /${img.name} Do Q\n`;
  });
  streamObj(contentId,'',enc.encode(commands));
  prepared.forEach((img,i)=>streamObj(firstImageId+i,`/Type /XObject /Subtype /Image /Width ${img.width} /Height ${img.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode`,img.bytes));
  const xrefOffset=length;
  const count=firstImageId+prepared.length;
  push(`xref\n0 ${count}\n0000000000 65535 f \n`);
  for(let id=1;id<count;id+=1)push(`${String(offsets[id]||0).padStart(10,'0')} 00000 n \n`);
  push(`trailer\n<< /Size ${count} /Root ${catalogId} 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`);
  const total=parts.reduce((n,p)=>n+p.length,0);const out=new Uint8Array(total);let at=0;parts.forEach(p=>{out.set(p,at);at+=p.length;});
  return new Blob([out],{type:'application/pdf'});
}

function openCamera(target){
  const overlay=document.createElement('div');
  overlay.style.cssText='position:fixed;inset:0;z-index:99999;background:rgba(0,0,0,.88);display:flex;align-items:center;justify-content:center;padding:18px';
  overlay.innerHTML=`<div style="width:min(900px,96vw);max-height:96vh;overflow:auto;background:#fff;border-radius:16px;padding:16px">
    <div style="display:flex;justify-content:space-between;align-items:center;gap:10px;margin-bottom:12px"><b style="font-size:20px">📷 Φωτογράφιση τιμολογίου</b><button type="button" class="cam-close" style="padding:8px 12px">✕</button></div>
    <video class="cam-video" autoplay playsinline muted style="width:100%;max-height:62vh;background:#111;border-radius:10px;object-fit:contain"></video>
    <div class="cam-status" style="padding:10px 0">Άνοιγμα κάμερας…</div>
    <div class="cam-previews" style="display:flex;gap:8px;overflow:auto;margin:8px 0"></div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">
      <button type="button" class="cam-shot" style="padding:13px;font-weight:800">📸 Λήψη φωτογραφίας</button>
      <button type="button" class="cam-use" disabled style="padding:13px;font-weight:800">📄 Δημιουργία PDF & χρήση</button>
    </div>
    <small style="display:block;margin-top:8px">Μπορείς να φωτογραφίσεις περισσότερες σελίδες. Θα ενωθούν σε ένα PDF.</small>
  </div>`;
  document.body.appendChild(overlay);
  const video=overlay.querySelector('.cam-video');
  const status=overlay.querySelector('.cam-status');
  const previews=overlay.querySelector('.cam-previews');
  const shot=overlay.querySelector('.cam-shot');
  const use=overlay.querySelector('.cam-use');
  const captures=[];
  let stream=null;
  const close=()=>{stream?.getTracks?.().forEach(t=>t.stop());overlay.remove();};
  overlay.querySelector('.cam-close').onclick=close;
  overlay.addEventListener('click',e=>{if(e.target===overlay)close();});

  navigator.mediaDevices?.getUserMedia({video:{facingMode:{ideal:'environment'},width:{ideal:1920},height:{ideal:1080}},audio:false})
    .then(s=>{stream=s;video.srcObject=s;status.textContent='Η κάμερα είναι έτοιμη. Βάλε ολόκληρη τη σελίδα του τιμολογίου μέσα στο κάδρο.';})
    .catch(error=>{status.textContent='Δεν άνοιξε η κάμερα. Έλεγξε την άδεια κάμερας του browser ή χρησιμοποίησε «Επιλογή αρχείου / PDF».';shot.disabled=true;console.warn(error);});

  shot.onclick=()=>{
    if(!video.videoWidth||!video.videoHeight)return;
    const canvas=document.createElement('canvas');
    canvas.width=video.videoWidth;canvas.height=video.videoHeight;
    canvas.getContext('2d').drawImage(video,0,0,canvas.width,canvas.height);
    const dataUrl=canvas.toDataURL('image/jpeg',0.92);
    captures.push({dataUrl});
    const img=document.createElement('img');img.src=dataUrl;img.style.cssText='height:90px;border:1px solid #ccc;border-radius:6px';previews.appendChild(img);
    status.textContent=`Λήψεις: ${captures.length}. Μπορείς να τραβήξεις άλλη σελίδα ή να δημιουργήσεις PDF.`;
    use.disabled=false;
  };

  use.onclick=()=>{
    if(!captures.length)return;
    try{
      const pdf=makePdfFromJpegs(captures);
      const file=new File([pdf],`timologio-${new Date().toISOString().slice(0,19).replace(/[:T]/g,'-')}.pdf`,{type:'application/pdf'});
      close();setFiles(target,[file]);
    }catch(error){status.textContent='Απέτυχε η δημιουργία PDF. Δοκίμασε ξανά ή επίλεξε αρχείο.';console.error(error);}
  };
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
        <input class="mws-file-input" type="file" accept="image/jpeg,image/png,image/webp,application/pdf" hidden>`;
      label.appendChild(original);
      original.hidden=true;
      const file=label.querySelector('.mws-file-input');
      label.querySelector('.mws-camera-action')?.addEventListener('click',()=>openCamera(original));
      label.querySelector('.mws-file-action')?.addEventListener('click',()=>file?.click());
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
      if(/Αφαίρεση από τα μετρητά της βάρδιας/i.test(text)||/^OCR \+ AI/i.test(text))el.style.display='none';
    });
  }
}

function enhance(){document.querySelectorAll('.pos-invoice-scan-v2').forEach(enhancePanel);}
enhance();
new MutationObserver(enhance).observe(document.documentElement,{childList:true,subtree:true});
