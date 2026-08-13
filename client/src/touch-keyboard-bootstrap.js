const TOUCH_CAPABLE=()=>window.matchMedia?.('(pointer: coarse)').matches||navigator.maxTouchPoints>0;
const TEXT_TYPES=new Set(['text','search','email','password','url','tel']);
const NUMERIC_TYPES=new Set(['number','range']);
const GREEK=[['1','2','3','4','5','6','7','8','9','0','⌫'],['%','ς','Ε','Ρ','Τ','Υ','Θ','Ι','Ο','Π'],['Α','Σ','Δ','Φ','Γ','Η','Ξ','Κ','Λ','-'],['Ζ','Χ','Ψ','Ω','Β','Ν','Μ',',','.','/','@']];
const ENGLISH=[['1','2','3','4','5','6','7','8','9','0','⌫'],['Q','W','E','R','T','Y','U','I','O','P'],['A','S','D','F','G','H','J','K','L','-'],['Z','X','C','V','B','N','M',',','.','/','@']];
const NUMERIC=[['7','8','9'],['4','5','6'],['1','2','3'],['0',',','⌫']];
let active=null,language='EL';
const fieldTriggers=new Map();

function eligible(el){
  if(!el||el.disabled||el.readOnly||el.dataset?.keyboard==='off')return false;
  if(el.tagName==='TEXTAREA')return true;
  if(el.tagName!=='INPUT')return false;
  const type=(el.type||'text').toLowerCase();
  return TEXT_TYPES.has(type)||NUMERIC_TYPES.has(type);
}
function isNumeric(el){
  if(!el)return false;
  const type=(el.type||'').toLowerCase();
  return NUMERIC_TYPES.has(type)||el.inputMode==='numeric'||el.inputMode==='decimal'||el.dataset.keyboard==='numeric';
}
function setNativeValue(el,value){
  const proto=el.tagName==='TEXTAREA'?HTMLTextAreaElement.prototype:HTMLInputElement.prototype;
  const setter=Object.getOwnPropertyDescriptor(proto,'value')?.set;
  if(setter)setter.call(el,value);else el.value=value;
  el.dispatchEvent(new Event('input',{bubbles:true}));
  el.dispatchEvent(new Event('change',{bubbles:true}));
}
function replaceSelection(text){
  if(!active)return;
  const value=active.value??'';
  const start=active.selectionStart??value.length,end=active.selectionEnd??value.length;
  const next=value.slice(0,start)+text+value.slice(end);
  setNativeValue(active,next);
  const pos=start+text.length;
  requestAnimationFrame(()=>{try{active?.setSelectionRange(pos,pos);active?.focus({preventScroll:true})}catch{}});
}
function backspace(){
  if(!active)return;
  const value=active.value??'';
  let start=active.selectionStart??value.length,end=active.selectionEnd??value.length;
  if(start===end&&start>0)start--;
  const next=value.slice(0,start)+value.slice(end);
  setNativeValue(active,next);
  requestAnimationFrame(()=>{try{active?.setSelectionRange(start,start);active?.focus({preventScroll:true})}catch{}});
}
function clearValue(){if(active){setNativeValue(active,'');active.focus({preventScroll:true})}}
function removeTriggers(){
  [...fieldTriggers.values()].forEach(b=>b.remove());
  fieldTriggers.clear();
}
function close(){document.getElementById('mws-touch-keyboard')?.classList.remove('open');active=null;removeTriggers()}
function keyButton(label,extra=''){
  const b=document.createElement('button');b.type='button';b.className=`mws-key ${extra}`;b.textContent=label;
  b.addEventListener('pointerdown',e=>e.preventDefault());
  b.addEventListener('click',()=>{if(label==='⌫')backspace();else replaceSelection(label==='SPACE'?' ':label)});
  return b;
}
function render(){
  const shell=document.getElementById('mws-touch-keyboard');if(!shell||!active)return;
  const grid=shell.querySelector('.mws-key-grid');grid.innerHTML='';
  const rows=isNumeric(active)?NUMERIC:(language==='EL'?GREEK:ENGLISH);
  shell.classList.toggle('numeric',isNumeric(active));
  rows.forEach(row=>{const line=document.createElement('div');line.className='mws-key-row';row.forEach(k=>line.appendChild(keyButton(k)));grid.appendChild(line)});
  const line=document.createElement('div');line.className='mws-key-row mws-key-actions';
  if(!isNumeric(active)){
    const lang=keyButton(language==='EL'?'ΕΛ / ENG':'ENG / ΕΛ','lang');lang.onclick=()=>{language=language==='EL'?'EN':'EL';render()};line.appendChild(lang);line.appendChild(keyButton('SPACE','space'));
  }
  const clr=keyButton('Καθαρισμός','clear');clr.onclick=clearValue;line.appendChild(clr);
  const ok=keyButton('✓','ok');ok.onclick=close;line.appendChild(ok);grid.appendChild(line);
}
function openFor(el){
  if(!eligible(el))return;
  active=el;const shell=document.getElementById('mws-touch-keyboard');if(!shell)return;
  shell.classList.add('open');render();syncTriggers();
  setTimeout(()=>{try{el.scrollIntoView({block:'center',behavior:'smooth'});el.focus({preventScroll:true})}catch{}},0);
}
function createTrigger(el){
  const b=document.createElement('button');
  b.type='button';b.className='mws-keyboard-trigger mws-keyboard-trigger-field';b.title='Άνοιγμα πληκτρολογίου οθόνης';b.setAttribute('aria-label','Άνοιγμα πληκτρολογίου οθόνης');b.innerHTML='<span aria-hidden="true">⌨</span>';
  b.addEventListener('pointerdown',e=>e.preventDefault());
  b.addEventListener('click',e=>{e.preventDefault();e.stopPropagation();openFor(el)});
  document.body.appendChild(b);fieldTriggers.set(el,b);return b;
}
function positionOne(el,b){
  if(!eligible(el)||!el.isConnected){b.remove();fieldTriggers.delete(el);return}
  const r=el.getBoundingClientRect();
  const hidden=r.width<=0||r.height<=0||r.bottom<0||r.top>window.innerHeight||r.right<0||r.left>window.innerWidth;
  b.hidden=hidden;if(hidden)return;
  const size=34,gap=4;
  let left=r.right+gap;
  if(left+size>window.innerWidth-4)left=Math.max(4,r.right-size-4);
  const top=Math.min(window.innerHeight-size-4,Math.max(4,r.top+(r.height-size)/2));
  b.style.left=`${left}px`;b.style.top=`${top}px`;
}
function syncTriggers(){
  const focused=eligible(document.activeElement)?document.activeElement:null;
  [...fieldTriggers.entries()].forEach(([el,b])=>{if(el!==focused){b.remove();fieldTriggers.delete(el)}});
  if(!focused)return;
  const trigger=fieldTriggers.get(focused)||createTrigger(focused);
  positionOne(focused,trigger);
}
function scheduleSync(){requestAnimationFrame(syncTriggers)}

let inventoryMenu=null,longPressTimer=null,longPressStart=null;
function ensureInventoryMenu(){
  if(inventoryMenu)return inventoryMenu;
  const style=document.createElement('style');
  style.textContent=`#mws-inventory-context{position:fixed;z-index:2147483600;min-width:285px;max-width:min(390px,92vw);background:#fff;border:1px solid #9fb3c6;border-radius:9px;box-shadow:0 18px 55px rgba(0,0,0,.28);padding:6px;color:#17324b;font-family:inherit}#mws-inventory-context[hidden]{display:none!important}#mws-inventory-context .mws-ctx-title{padding:9px 10px;border-bottom:1px solid #d7e0e8;font-weight:900;color:#123b5d;white-space:normal}#mws-inventory-context button{display:flex;width:100%;align-items:center;gap:9px;border:0;background:#fff;color:#17324b;padding:9px 10px;text-align:left;border-radius:6px;font:inherit;font-weight:750;cursor:pointer}#mws-inventory-context button:hover{background:#edf5fb}#mws-inventory-context button:disabled{opacity:.45;cursor:not-allowed}#mws-inventory-context .mws-ctx-info{display:grid;grid-template-columns:auto 1fr;gap:5px 10px;padding:9px 10px;border-top:1px solid #e1e8ef;font-size:12px}#mws-inventory-context .mws-ctx-info b{color:#49647d}`;
  document.head.appendChild(style);
  inventoryMenu=document.createElement('div');inventoryMenu.id='mws-inventory-context';inventoryMenu.hidden=true;document.body.appendChild(inventoryMenu);return inventoryMenu;
}
function inventoryRowCells(row){return [...row.children].map(x=>(x.textContent||'').trim())}
function closeInventoryMenu(){if(inventoryMenu)inventoryMenu.hidden=true}
function clickInventoryAction(row,kind){
  closeInventoryMenu();
  if(kind==='edit'){row.querySelector('.ia-edit button')?.click();return}
  if(kind==='delivery'){
    row.click();
    const button=[...document.querySelectorAll('.ia-toolbar button')].find(b=>/e.?Delivery/i.test(b.textContent||''));
    button?.click();return;
  }
  if(kind==='order'){
    row.click();
    const button=[...document.querySelectorAll('.ia-toolbar button')].find(b=>/Παραγγελία/i.test(b.textContent||''));
    button?.click();return;
  }
  if(kind==='print'){row.click();window.print()}
}
function openInventoryMenu(row,x,y){
  if(!row?.classList?.contains('data')||!row.closest('.ia-shell'))return;
  row.click();
  const c=inventoryRowCells(row),menu=ensureInventoryMenu();
  const sku=c[2]||'—',barcode=c[3]||'—',name=c[4]||'Είδος',sale=c[7]||'—',stock=c[10]||'—',supplier=c[16]||'—',vat=c[17]||'—',category=c[18]||'—',subcategory=c[19]||'—';
  menu.innerHTML=`<div class="mws-ctx-title">${name}</div>
    <button type="button" data-action="edit">✎ Διόρθωση είδους</button>
    <button type="button" data-action="edit">€ Αλλαγή λιανικής</button>
    <button type="button" data-action="edit">▣ Διόρθωση αποθήκης (απογραφή)</button>
    <button type="button" data-action="order">☷ Παραγγελία / Αγορές</button>
    <button type="button" data-action="delivery">▣ e‑Delivery</button>
    <button type="button" data-action="print">▤ Εκτύπωση</button>
    <div class="mws-ctx-info"><b>Κωδικός</b><span>${sku}</span><b>Barcode</b><span>${barcode}</span><b>Λιανική</b><span>${sale}</span><b>Stock</b><span>${stock}</span><b>Προμηθευτής</b><span>${supplier}</span><b>ΦΠΑ</b><span>${vat}</span><b>Κατηγορία</b><span>${category}</span><b>Υποκατηγορία</b><span>${subcategory}</span></div>`;
  menu.querySelectorAll('button[data-action]').forEach(b=>b.addEventListener('click',()=>clickInventoryAction(row,b.dataset.action)));
  menu.hidden=false;
  const rect=menu.getBoundingClientRect();
  menu.style.left=`${Math.max(6,Math.min(x,window.innerWidth-rect.width-6))}px`;
  menu.style.top=`${Math.max(6,Math.min(y,window.innerHeight-rect.height-6))}px`;
}
function mountInventoryContext(){
  document.addEventListener('contextmenu',e=>{
    const row=e.target.closest?.('.ia-row.data');if(!row||!row.closest('.ia-shell'))return;
    e.preventDefault();openInventoryMenu(row,e.clientX,e.clientY);
  },true);
  document.addEventListener('pointerdown',e=>{
    const row=e.target.closest?.('.ia-row.data');
    if(!row||!row.closest('.ia-shell')||e.pointerType==='mouse')return;
    longPressStart={x:e.clientX,y:e.clientY,row};
    clearTimeout(longPressTimer);longPressTimer=setTimeout(()=>openInventoryMenu(row,e.clientX,e.clientY),650);
  },true);
  document.addEventListener('pointermove',e=>{
    if(!longPressStart)return;
    if(Math.hypot(e.clientX-longPressStart.x,e.clientY-longPressStart.y)>12){clearTimeout(longPressTimer);longPressStart=null}
  },true);
  document.addEventListener('pointerup',()=>{clearTimeout(longPressTimer);longPressStart=null},true);
  document.addEventListener('pointercancel',()=>{clearTimeout(longPressTimer);longPressStart=null},true);
  document.addEventListener('pointerdown',e=>{if(inventoryMenu&&!inventoryMenu.hidden&&!inventoryMenu.contains(e.target))closeInventoryMenu()},true);
  document.addEventListener('keydown',e=>{if(e.key==='Escape')closeInventoryMenu()});
  window.addEventListener('scroll',closeInventoryMenu,true);window.addEventListener('resize',closeInventoryMenu);
}
function mount(){
  if(document.getElementById('mws-touch-keyboard'))return;
  const shell=document.createElement('div');shell.id='mws-touch-keyboard';shell.setAttribute('role','dialog');shell.setAttribute('aria-label','Πληκτρολόγιο οθόνης');
  shell.innerHTML='<div class="mws-keyboard-panel"><div class="mws-key-grid"></div></div>';
  document.body.appendChild(shell);
  syncTriggers();mountInventoryContext();
  const observer=new MutationObserver(scheduleSync);observer.observe(document.body,{childList:true,subtree:true,attributes:true,attributeFilter:['disabled','readonly','type','style','class']});
  document.addEventListener('focusin',e=>{if(!eligible(e.target))return;syncTriggers();if(TOUCH_CAPABLE())openFor(e.target)},true);
  document.addEventListener('focusout',()=>setTimeout(syncTriggers,0),true);
  document.addEventListener('pointerdown',e=>{if(eligible(e.target)&&TOUCH_CAPABLE())openFor(e.target);if(shell.classList.contains('open')&&!shell.contains(e.target)&&!e.target.closest?.('.mws-keyboard-trigger'))close()},true);
  window.addEventListener('resize',scheduleSync);window.addEventListener('scroll',scheduleSync,true);
  document.addEventListener('keydown',e=>{if(e.key==='Escape')close()});
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',mount);else mount();
