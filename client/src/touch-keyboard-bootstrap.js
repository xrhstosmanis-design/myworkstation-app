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
function close(){document.getElementById('mws-touch-keyboard')?.classList.remove('open');active=null}
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
  shell.classList.add('open');render();
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
  document.querySelectorAll('input,textarea').forEach(el=>{if(eligible(el)&&!fieldTriggers.has(el))createTrigger(el)});
  [...fieldTriggers.entries()].forEach(([el,b])=>positionOne(el,b));
}
function scheduleSync(){requestAnimationFrame(syncTriggers)}
function mount(){
  if(document.getElementById('mws-touch-keyboard'))return;
  const shell=document.createElement('div');shell.id='mws-touch-keyboard';shell.setAttribute('role','dialog');shell.setAttribute('aria-label','Πληκτρολόγιο οθόνης');
  shell.innerHTML='<div class="mws-keyboard-panel"><div class="mws-key-grid"></div></div>';
  document.body.appendChild(shell);
  syncTriggers();
  const observer=new MutationObserver(scheduleSync);observer.observe(document.body,{childList:true,subtree:true,attributes:true,attributeFilter:['disabled','readonly','type','style','class']});
  document.addEventListener('focusin',e=>{if(!eligible(e.target))return;if(TOUCH_CAPABLE())openFor(e.target)},true);
  document.addEventListener('pointerdown',e=>{if(eligible(e.target)&&TOUCH_CAPABLE())openFor(e.target);if(shell.classList.contains('open')&&!shell.contains(e.target)&&!e.target.closest?.('.mws-keyboard-trigger'))close()},true);
  window.addEventListener('resize',scheduleSync);window.addEventListener('scroll',scheduleSync,true);
  document.addEventListener('keydown',e=>{if(e.key==='Escape')close()});
  setInterval(syncTriggers,1200);
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',mount);else mount();
