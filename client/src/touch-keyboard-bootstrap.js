const TOUCH_CAPABLE=()=>window.matchMedia?.('(pointer: coarse)').matches||navigator.maxTouchPoints>0;
const TEXT_TYPES=new Set(['text','search','email','password','url','tel']);
const NUMERIC_TYPES=new Set(['number','range']);
const GREEK=[['1','2','3','4','5','6','7','8','9','0','⌫'],['%','ς','Ε','Ρ','Τ','Υ','Θ','Ι','Ο','Π'],['Α','Σ','Δ','Φ','Γ','Η','Ξ','Κ','Λ','-'],['Ζ','Χ','Ψ','Ω','Β','Ν','Μ',',','.','/','@']];
const ENGLISH=[['1','2','3','4','5','6','7','8','9','0','⌫'],['Q','W','E','R','T','Y','U','I','O','P'],['A','S','D','F','G','H','J','K','L','-'],['Z','X','C','V','B','N','M',',','.','/','@']];
const NUMERIC=[['7','8','9'],['4','5','6'],['1','2','3'],['0',',','⌫']];
let active=null,language='EL';

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
function makeTrigger(el){
  const b=document.createElement('button');
  b.type='button';b.className='mws-keyboard-trigger mws-keyboard-trigger-inline';b.title='Άνοιγμα πληκτρολογίου οθόνης';b.setAttribute('aria-label','Άνοιγμα πληκτρολογίου οθόνης');b.innerHTML='<span aria-hidden="true">⌨</span>';
  b.addEventListener('pointerdown',e=>e.preventDefault());
  b.addEventListener('click',e=>{e.preventDefault();e.stopPropagation();openFor(el)});
  return b;
}
function hasTrigger(el){
  const next=el.nextElementSibling;
  return !!(next&&next.classList?.contains('mws-keyboard-trigger-inline')&&next.dataset?.mwsFor===el.dataset?.mwsKeyboardId);
}
let seq=0;
function decorateField(el){
  if(!eligible(el)||hasTrigger(el))return;
  if(!el.dataset.mwsKeyboardId)el.dataset.mwsKeyboardId=`mws-kb-${++seq}`;
  const trigger=makeTrigger(el);trigger.dataset.mwsFor=el.dataset.mwsKeyboardId;
  el.insertAdjacentElement('afterend',trigger);
}
function decorateAll(root=document){
  if(root.nodeType===1&&eligible(root))decorateField(root);
  root.querySelectorAll?.('input,textarea').forEach(decorateField);
}
function mount(){
  if(document.getElementById('mws-touch-keyboard'))return;
  const shell=document.createElement('div');shell.id='mws-touch-keyboard';shell.setAttribute('role','dialog');shell.setAttribute('aria-label','Πληκτρολόγιο οθόνης');
  shell.innerHTML='<div class="mws-keyboard-panel"><div class="mws-key-grid"></div></div>';
  document.body.appendChild(shell);
  decorateAll(document);
  const refresh=()=>decorateAll(document);
  const observer=new MutationObserver(()=>requestAnimationFrame(refresh));
  observer.observe(document.body,{childList:true,subtree:true});
  setInterval(refresh,1200);
  document.addEventListener('focusin',e=>{if(eligible(e.target)&&TOUCH_CAPABLE())openFor(e.target)},true);
  document.addEventListener('pointerdown',e=>{if(eligible(e.target)&&TOUCH_CAPABLE()){openFor(e.target);return}if(shell.classList.contains('open')&&!shell.contains(e.target)&&!e.target.closest?.('.mws-keyboard-trigger-inline'))close()},true);
  document.addEventListener('keydown',e=>{if(e.key==='Escape')close()});
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',mount);else mount();
