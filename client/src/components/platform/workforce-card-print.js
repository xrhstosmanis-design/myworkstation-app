const CODE128=["212222","222122","222221","121223","121322","131222","122213","122312","132212","221213","221312","231212","112232","122132","122231","113222","123122","123221","223211","221132","221231","213212","223112","312131","311222","321122","321221","312212","322112","322211","212123","212321","232121","111323","131123","131321","112313","132113","132311","211313","231113","231311","112133","112331","132131","113123","113321","133121","313121","211331","231131","213113","213311","213131","311123","311321","331121","312113","312311","332111","314111","221411","431111","111224","111422","121124","121421","141122","141221","112214","112412","122114","122411","142112","142211","241211","221114","413111","241112","134111","111242","121142","121241","114212","124112","124211","411212","421112","421211","212141","214121","412121","111143","111341","131141","114113","114311","411113","411311","113141","114131","311141","411131","211412","211214","211232","2331112"];

function escapeHtml(value){
  return String(value??"").replace(/[&<>'"]/g,char=>({"&":"&amp;","<":"&lt;",">":"&gt;","'":"&#39;",'"':"&quot;"}[char]));
}

function barcodeSvg(value){
  const text=String(value||"").toUpperCase();
  if(!text||[...text].some(char=>char.charCodeAt(0)<32||char.charCodeAt(0)>126))throw new Error("Ο κωδικός κάρτας δεν μπορεί να εκτυπωθεί.");
  const values=[104,...[...text].map(char=>char.charCodeAt(0)-32)];
  let checksum=104;
  for(let index=1;index<values.length;index+=1)checksum+=values[index]*index;
  values.push(checksum%103,106);
  const quietZone=24;
  let x=quietZone,bars="";
  for(const code of values){
    const pattern=CODE128[code];
    for(let index=0;index<pattern.length;index+=1){
      const width=Number(pattern[index])*2;
      if(index%2===0)bars+=`<rect x="${x}" y="0" width="${width}" height="54"/>`;
      x+=width;
    }
  }
  return `<svg role="img" aria-label="Barcode κάρτας εργασίας" viewBox="0 0 ${x+quietZone} 54" preserveAspectRatio="none">${bars}</svg>`;
}

function printPage(payload){
  const employee=escapeHtml(payload.employee.fullName),store=escapeHtml(payload.store.name),code=escapeHtml(payload.cardCode);
  return `<!doctype html><html lang="el"><head><meta charset="utf-8"><title>Κάρτα εργασίας — ${employee}</title><style>
  *{box-sizing:border-box}body{margin:0;background:#eef3f7;color:#08283f;font-family:Arial,sans-serif}.toolbar{display:flex;justify-content:center;gap:12px;padding:18px}.toolbar button{border:0;border-radius:9px;background:#087f5b;color:#fff;font-weight:800;font-size:16px;padding:12px 24px;cursor:pointer}.card{width:85.6mm;height:54mm;margin:10mm auto;background:#fff;border:1px solid #b8ccda;border-radius:4mm;padding:6mm;display:flex;flex-direction:column;justify-content:space-between;box-shadow:0 8px 30px #173a5522}.brand{font-size:9px;font-weight:900;letter-spacing:1.4px;color:#087f5b}.title{font-size:13px;font-weight:800}.name{font-size:20px;font-weight:900;margin-top:2mm}.store{font-size:11px;color:#49677d;margin-top:1mm}.barcode svg{display:block;width:100%;height:14mm;fill:#071f32}.code{text-align:center;font:9px monospace;letter-spacing:1px;margin-top:1mm}.hint{text-align:center;font-size:9px;color:#49677d}@page{size:A4;margin:12mm}@media print{body{background:#fff}.toolbar{display:none}.card{margin:0 auto;box-shadow:none;break-inside:avoid}}
  </style></head><body><div class="toolbar"><button onclick="window.print()">Εκτύπωση κάρτας</button></div><main class="card"><div><div class="brand">MYWORKSTATION · ΚΑΡΤΑ ΕΡΓΑΣΙΑΣ</div><div class="name">${employee}</div><div class="store">${store}</div></div><div class="barcode">${barcodeSvg(payload.cardCode)}<div class="code">${code}</div></div><div class="hint">Σκάναρε στο POS για προσέλευση ή αποχώρηση</div></main></body></html>`;
}

export async function openWorkforceCardPrint({request,base,employee}){
  const preview=window.open("","_blank");
  if(!preview)throw new Error("Το πρόγραμμα περιήγησης μπλόκαρε την προεπισκόπηση. Επίτρεψε τα αναδυόμενα παράθυρα και δοκίμασε ξανά.");
  preview.document.write("<!doctype html><title>Προετοιμασία κάρτας</title><p style='font:16px Arial;padding:24px'>Προετοιμασία κάρτας εργασίας…</p>");
  try{
    const payload=await request(`${base}/employees/${employee.id}/work-card`,{method:"POST"});
    preview.document.open();preview.document.write(printPage(payload));preview.document.close();preview.focus();
    return payload;
  }catch(error){preview.close();throw error}
}

export {barcodeSvg};
