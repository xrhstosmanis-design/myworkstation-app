const TOUCH_CAPABLE=()=>window.matchMedia?.('(pointer: coarse)').matches||navigator.maxTouchPoints>0;
const TEXT_TYPES=new Set(['text','search','email','password','url','tel']);
const NUMERIC_TYPES=new Set(['number','range']);
const GREEK=[['1','2','3','4','5','6','7','8','9','0','⌫'],['%','ς','Ε','Ρ','Τ','Υ','Θ','Ι','Ο','Π'],['Α','Σ','Δ','Φ','Γ','Η','Ξ','Κ','Λ','-'],['Ζ','Χ','Ψ','Ω','Β','Ν','Μ',',','.','/','@']];
const ENGLISH=[['1','2','3','4','5','6','7','8','9','0','⌫'],['Q','W','E','R','T','Y','U','I','O','P'],['A','S','D','F','G','H','J','K','L','-'],['Z','X','C','V','B','N','M',',','.','/','@']];
const NUMERIC=[['7','8','9'],['4','5','6'],['1','2','3'],['0',',','⌫']];
let active=null,language='EL';

function eligible(el){
  if(!el||el.disabled||el.readOnly)return false;
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
function emit(el){
  el.dispatchEvent(new Event('input',{bubbles:true}));
  el.dispatchEvent(new Event('change',{bubbles:true}));
}
function replaceSelection(text){
  if(!active)return;
  const value=active.value??'';
  const start=active.selectionStart??value.length,end=active.selectionEnd??value.length;
  active.value=value.slice(0,start)+text+value.slice(end);
  const pos=start+text.length;
  try{active.setSelectionRange(pos,pos)}catch{}
  emit(active);
}
function backspace(){
  if(!active)return;
  const value=active.value??'';
  let start=active.selectionStart??value.length,end=active.selectionEnd??value.length;
  if(start===end&&start>0)start--;
  active.value=value.slice(0,start)+value.slice(end);
  try{active.setSelectionRange(start,start)}catch{}
  emit(active);
}
function clearValue(){if(active){active.value='';emit(active);active.focus({preventScroll:true})}}
function close(){document.getElementById('mws-touch-keyboard')?.classList.remove('open');active=null}
function keyButton(label,extra=''){
  const b=document.createElement('button');b.type='button';b.className=`mws-key ${extra}`;b.textContent=label;
  b.addEventListener('pointerdown',e=>e.preventDefault());
  b.addEventListener('click',()=>{if(label==='⌫')backspace();else replaceSelection(label==='SPACE'?' ':label);active?.focus({preventScroll:true})});
  return b;
}
function render(){
  const shell=document.getElementById('mws-touch-keyboard');if(!shell||!active)return;
  const grid=shell.querySelector('.mws-key-grid');grid.innerHTML='';
  const rows=isNumeric(active)?NUMERIC:(language==='EL'?GREEK:ENGLISH);
  shell.classList.toggle('numeric',isNumeric(active));
  rows.forEach(row=>{const line=document.createElement('div');line.className='mws-key-row';row.forEach(k=>line.appendChild(keyButton(k)));grid.appendChild(line)});
  if(!isNumeric(active)){
    const line=document.createElement('div');line.className='mws-key-row mws-key-actions';
    const lang=keyButton(language==='EL'?'ΕΛ / ENG':'ENG / ΕΛ','lang');lang.onclick=()=>{language=language==='EL'?'EN':'EL';render();active?.focus({preventScroll:true})};
    line.append(keyButton('✕','close'));line.lastChild.onclick=close;
    line.appendChild(lang);line.appendChild(keyButton('SPACE','space'));
    const clr=keyButton('Καθαρισμός','clear');clr.onclick=clearValue;line.appendChild(clr);
    const ok=keyButton('✓','ok');ok.onclick=close;line.appendChild(ok);grid.appendChild(line);
  }else{
    const line=document.createElement('div');line.className='mws-key-row mws-key-actions';
    const clr=keyButton('Καθαρισμός','clear');clr.onclick=clearValue;line.appendChild(clr);
    const ok=keyButton('✓','ok');ok.onclick=close;line.appendChild(ok);grid.appendChild(line);
  }
}
function openFor(el){
  active=el;const shell=document.getElementById('mws-touch-keyboard');if(!shell)return;
  shell.classList.add('open');render();
  setTimeout(()=>{try{el.scrollIntoView({block:'center',behavior:'smooth'});el.focus({preventScroll:true})}catch{}},0);
}
function mount(){
  if(document.getElementById('mws-touch-keyboard'))return;
  const shell=document.createElement('div');shell.id='mws-touch-keyboard';shell.setAttribute('role','dialog');shell.setAttribute('aria-label','Πληκτρολόγιο αφής');
  shell.innerHTML='<div class="mws-keyboard-panel"><div class="mws-keyboard-value"></div><div class="mws-key-grid"></div></div>';
  document.body.appendChild(shell);
  document.addEventListener('focusin',e=>{if(!TOUCH_CAPABLE()||!eligible(e.target))return;openFor(e.target)},true);
  document.addEventListener('pointerdown',e=>{
    if(!TOUCH_CAPABLE())return;
    if(eligible(e.target)){openFor(e.target);return}
    if(shell.classList.contains('open')&&!shell.contains(e.target)&&!e.target.closest?.('[data-keep-keyboard]'))close();
  },true);
  document.addEventListener('keydown',e=>{if(e.key==='Escape')close()});
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',mount);else mount();
