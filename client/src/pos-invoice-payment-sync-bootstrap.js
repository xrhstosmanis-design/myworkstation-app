const CACHE_KEY='mws:pending-invoice-payment-v1';
let syncTimer=null;
const syncing=new WeakSet();
const freshResetDone=new WeakSet();

const valueSetter=(el,value)=>{
  if(!el)return;
  const next=String(value??'');
  if(String(el.value??'')===next)return;
  const proto=el instanceof HTMLSelectElement?HTMLSelectElement.prototype:el instanceof HTMLTextAreaElement?HTMLTextAreaElement.prototype:HTMLInputElement.prototype;
  const set=Object.getOwnPropertyDescriptor(proto,'value')?.set;
  if(set)set.call(el,next);else el.value=next;
  el.dispatchEvent(new Event(el instanceof HTMLSelectElement?'change':'input',{bubbles:true}));
  el.dispatchEvent(new Event('change',{bubbles:true}));
};

const readCache=()=>{try{return JSON.parse(sessionStorage.getItem(CACHE_KEY)||'{}')}catch{return{}}};
const writeCache=data=>{try{sessionStorage.setItem(CACHE_KEY,JSON.stringify({...readCache(),...data,updatedAt:Date.now()}))}catch{}};
const clearCache=()=>{try{sessionStorage.removeItem(CACHE_KEY)}catch{}};
const norm=s=>String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toUpperCase().replace(/[^A-ZΑ-Ω0-9 ]/g,' ').replace(/\s+/g,' ').trim();
const stop=new Set(['ΑΕ','Α','Ε','ΙΚΕ','ΜΟΝ','ΕΠΕ','ΟΕ','ΕΕ','BEER','SUPPLIES','SUPPLY','THE','AND']);
const tokens=s=>norm(s).split(' ').filter(x=>x.length>=3&&!stop.has(x));

function scoreNames(a,b){
  const A=tokens(a),B=tokens(b);if(!A.length||!B.length)return 0;
  const sa=new Set(A),sb=new Set(B);let common=0;for(const x of sa)if(sb.has(x))common++;
  const contain=norm(a).includes(norm(b))||norm(b).includes(norm(a));
  return contain?1:common/Math.min(sa.size,sb.size);
}

function paymentRoot(panel){return panel.closest('.pos-payment-form')||null}
function labelControl(root,labelText,selector='input'){
  const labels=[...root.querySelectorAll('label')].filter(l=>!l.closest('.pos-invoice-scan-v2'));
  const wanted=norm(labelText);
  for(const label of labels){
    const own=norm([...label.childNodes].filter(n=>n.nodeType===Node.TEXT_NODE).map(n=>n.textContent).join(' '));
    if(own===wanted||norm(label.textContent||'').startsWith(wanted)){
      const control=label.querySelector(selector);if(control)return control;
    }
  }
  return null;
}
function findSupplierSelect(root){return labelControl(root,'Προμηθευτής','select')||root.querySelector('select')}
function findAmountInput(root){return labelControl(root,'Ποσό','input')}
function findNotes(root){return labelControl(root,'Παρατηρήσεις','input,textarea')}
function findAmountPad(root){
  const amount=findAmountInput(root);if(!amount)return null;
  const pads=[...root.querySelectorAll('.pos-inline-keypad')];
  if(!pads.length)return null;
  let node=amount.parentElement;
  while(node&&node!==root){
    let sibling=node.nextElementSibling;
    while(sibling){if(sibling.matches?.('.pos-inline-keypad'))return sibling;sibling=sibling.nextElementSibling}
    node=node.parentElement;
  }
  return pads[0]||null;
}
function setAmountViaPad(root,total){
  const desired=parseTotalRaw(total);if(!desired)return;
  const amount=findAmountInput(root);if(!amount)return;
  if(parseTotalRaw(amount.value)===desired)return;
  const pad=findAmountPad(root);if(!pad){valueSetter(amount,desired);return;}
  const buttons=[...pad.querySelectorAll('button')];
  const clickText=text=>{const btn=buttons.find(b=>String(b.textContent||'').trim()===text);btn?.click()};
  const clear=buttons.find(b=>/ΚΑΘΑΡΙΣΜΟΣ|^C$/i.test(String(b.textContent||'').trim()));
  clear?.click();
  for(const ch of desired.replace('.',','))clickText(ch);
}

function freshInvoicePanel(panel){
  const fileInput=panel.querySelector('input[type="file"]');
  const hasFile=Boolean(fileInput?.files?.length);
  const status=String(panel.querySelector('.mws-invoice-status')?.textContent||'');
  const number=panel.querySelector('.mws-doc-number')?.value?.trim()||'';
  const total=panel.querySelector('.mws-doc-total')?.value?.trim()||'';
  const waiting=/Περιμένει τιμολόγιο|Δεν επιλέχθηκε/i.test(status);
  return !hasFile&&!number&&!total&&(waiting||!status.trim());
}
function resetFreshPayment(root,panel){
  if(freshResetDone.has(root)||!freshInvoicePanel(panel))return;
  freshResetDone.add(root);
  clearCache();
  const supplier=findSupplierSelect(root);if(supplier)valueSetter(supplier,'');
  const amount=findAmountInput(root);if(amount&&amount.value)setAmountViaPad(root,'0');
  const notes=findNotes(root);if(notes)valueSetter(notes,'');
}

function parseTotalRaw(raw){
  raw=String(raw||'').trim();if(!raw)return'';
  const normalized=raw.replace(/\s/g,'').replace(/\.(?=\d{3}(?:\D|$))/g,'').replace(',','.').replace(/[^0-9.]/g,'');
  const n=Number(normalized);return Number.isFinite(n)&&n>0?n.toFixed(2):'';
}
function statusSupplier(panel){
  const status=panel.querySelector('.mws-invoice-status')?.textContent||'';
  const m=status.match(/Προμηθευτής:\s*(.+?)(?:\s*·\s*Αρ\.|\s*·\s*Σύνολο:|$)/i);
  return m?.[1]?.trim()||'';
}
function supplierCandidate(panel){return statusSupplier(panel)||panel.querySelector('.mws-sup-name')?.value?.trim()||''}
function isProcessing(panel){
  const status=String(panel.querySelector('.mws-invoice-status')?.textContent||'');
  return /2\/2|Αυτόματος επανέλεγχος|επανέλεγχος με AI|Διαβάζω|επεξεργασία|αναλύ/i.test(status);
}
function matchSupplier(select,candidate){
  if(!select||!candidate)return null;
  let best=null,bestScore=0;
  for(const option of [...select.options]){
    if(!option.value)continue;
    const score=scoreNames(candidate,option.textContent||'');
    if(score>bestScore){best=option;bestScore=score;}
  }
  return best&&bestScore>=0.67?best:null;
}
function ensureSupplierSelected(root,panel,cached){
  const select=findSupplierSelect(root);if(!select)return;
  const currentCandidate=supplierCandidate(panel);
  let option=matchSupplier(select,currentCandidate);
  if(!option&&!currentCandidate&&cached?.supplierValue){
    option=[...select.options].find(o=>String(o.value)===String(cached.supplierValue))||null;
  }
  if(option){
    valueSetter(select,option.value);
    writeCache({supplier:option.textContent?.trim()||currentCandidate,supplierValue:option.value});
    const box=panel.querySelector('.mws-new-supplier');if(box)box.style.display='none';
  }
}
function panelSnapshot(panel){
  const total=parseTotalRaw(panel.querySelector('.mws-doc-total')?.value);
  const number=panel.querySelector('.mws-doc-number')?.value?.trim()||'';
  const date=panel.querySelector('.mws-doc-date')?.value?.trim()||'';
  const supplier=supplierCandidate(panel);
  const data={};if(total)data.total=total;if(number)data.number=number;if(date)data.date=date;if(supplier)data.supplier=supplier;
  if(Object.keys(data).length)writeCache(data);
  return data;
}
function notesText(number,date){
  const parts=[];
  if(number)parts.push(`Τιμολόγιο ${String(number).trim()}`);
  if(date){const [y,m,d]=String(date).split('-');parts.push(`Ημ/νία ${d&&m&&y?`${d}/${m}/${y}`:date}`)}
  return parts.join(' · ');
}
function syncPanel(panel){
  if(!panel?.isConnected||syncing.has(panel))return;
  const root=paymentRoot(panel);if(!root)return;
  resetFreshPayment(root,panel);
  panelSnapshot(panel);
  if(isProcessing(panel)||freshInvoicePanel(panel))return;
  syncing.add(panel);
  try{
    const data=readCache();
    ensureSupplierSelected(root,panel,data);
    const currentTotal=parseTotalRaw(panel.querySelector('.mws-doc-total')?.value)||data.total;
    if(currentTotal)setAmountViaPad(root,currentTotal);
    const currentNumber=panel.querySelector('.mws-doc-number')?.value?.trim()||data.number||'';
    const currentDate=panel.querySelector('.mws-doc-date')?.value?.trim()||data.date||'';
    const notes=findNotes(root);const text=notesText(currentNumber,currentDate);if(notes&&text)valueSetter(notes,text);
  }finally{queueMicrotask(()=>syncing.delete(panel))}
}
function attach(panel){
  if(panel.dataset.paymentSyncAttached)return;
  panel.dataset.paymentSyncAttached='1';
  const schedule=()=>scheduleSync();
  for(const sel of ['.mws-doc-total','.mws-doc-number','.mws-doc-date','.mws-sup-name']){
    const el=panel.querySelector(sel);el?.addEventListener('input',schedule);el?.addEventListener('change',schedule);
  }
  new MutationObserver(schedule).observe(panel,{subtree:true,childList:true,characterData:true});
  scheduleSync();
}
function scheduleSync(delay=100){clearTimeout(syncTimer);syncTimer=setTimeout(syncAll,delay)}
function syncAll(){document.querySelectorAll('.pos-invoice-scan-v2').forEach(panel=>{attach(panel);syncPanel(panel)})}
new MutationObserver(()=>scheduleSync(120)).observe(document.documentElement,{subtree:true,childList:true});
window.addEventListener('mws-payment-restored',()=>scheduleSync(180));
setInterval(()=>{for(const panel of document.querySelectorAll('.pos-invoice-scan-v2')){if(!isProcessing(panel))syncPanel(panel)}},1000);
scheduleSync(0);
