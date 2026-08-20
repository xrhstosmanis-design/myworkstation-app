import {installBackofficeColumnFilters} from "../../backoffice-column-filters.js";

const TEXT_TYPES=new Set(["text","search","email","tel","password","url"]);
const NUMERIC_TYPES=new Set(["number"]);
let activeInput=null,lastTouchAt=0,lang="EL",shift=false,activeButton=null;

const editable=el=>{if(!(el instanceof HTMLElement)||el.disabled||el.readOnly||el.dataset?.keyboard==="off")return false;if(el.matches("textarea,[contenteditable='true']"))return true;if(!(el instanceof HTMLInputElement))return false;const type=(el.type||"text").toLowerCase();return TEXT_TYPES.has(type)||NUMERIC_TYPES.has(type)};
const isNumeric=input=>input instanceof HTMLInputElement&&(NUMERIC_TYPES.has((input.type||"").toLowerCase())||input.dataset.mwsNumeric==="1");
const isTouchLikePointer=pointerType=>pointerType==="touch"||pointerType==="pen";
const labels={EL:["ς","ε","ρ","τ","υ","θ","ι","ο","π","α","σ","δ","φ","γ","η","ξ","κ","λ","ζ","χ","ψ","ω","β","ν","μ"],EN:["q","w","e","r","t","y","u","i","o","p","a","s","d","f","g","h","j","k","l","z","x","c","v","b","n","m"]};
const rows={EL:[9,9,7],EN:[10,9,7]};

function setDomValue(input,value){
  if(!input)return;
  if(input.isContentEditable){input.textContent=value;input.dispatchEvent(new InputEvent("input",{bubbles:true,inputType:"insertText",data:null}));return}
  const proto=input instanceof HTMLTextAreaElement?HTMLTextAreaElement.prototype:HTMLInputElement.prototype;
  const setter=Object.getOwnPropertyDescriptor(proto,"value")?.set;
  if(setter)setter.call(input,value);else input.value=value;
  input.dispatchEvent(new InputEvent("input",{bubbles:true,inputType:"insertText",data:null}));
  input.dispatchEvent(new Event("change",{bubbles:true}));
}
function ensure(){
  let root=document.getElementById("mws-touch-keyboard");if(root)return root;
  root=document.createElement("div");root.id="mws-touch-keyboard";root.className="mws-touch-keyboard";root.hidden=true;root.setAttribute("aria-label","Πληκτρολόγιο αφής MyWorkStation");document.body.appendChild(root);
  root.addEventListener("pointerdown",event=>{if(event.target===root){event.preventDefault();close()}});
  return root;
}
function bindKeys(root){
  root.querySelectorAll("button[data-key]").forEach(button=>{
    const run=event=>{event.preventDefault();event.stopPropagation();if(!activeInput&&button.dataset.key!=="CLOSE")return;handle(button.dataset.key)};
    button.addEventListener("pointerdown",run,{passive:false});
  });
}
function render(){
  const root=ensure();if(!activeInput){root.hidden=true;return}root.hidden=false;
  if(isNumeric(activeInput)){
    root.innerHTML=`<section class="mws-touch-dialog"><header><div><small>MYWORKSTATION STANDARD POS</small><h2>Αριθμητικό πληκτρολόγιο</h2></div><button type="button" data-key="CLOSE" aria-label="Κλείσιμο">✕</button></header><main><div class="mws-touch-numeric">${["7","8","9","4","5","6","1","2","3",",","0","BACK"].map(k=>`<button type="button" data-key="${k}">${k==="BACK"?"⌫":k}</button>`).join("")}</div><div class="mws-touch-actions"><button type="button" data-key="MINUS">−</button><button type="button" data-key="CLEAR">Καθαρισμός</button><button type="button" class="enter" data-key="ENTER">Enter ↵</button></div></main></section>`;
    bindKeys(root);return;
  }
  const chars=labels[lang],sizes=rows[lang];let cursor=0;
  const line=s=>{const part=chars.slice(cursor,cursor+s);cursor+=s;return `<div class="mws-touch-row">${part.map(ch=>`<button type="button" data-key="${ch}">${shift?ch.toLocaleUpperCase(lang==="EL"?"el-GR":"en-US"):ch}</button>`).join("")}</div>`};
  const numbers=["1","2","3","4","5","6","7","8","9","0","BACK"];
  root.innerHTML=`<section class="mws-touch-dialog"><header><div><small>MYWORKSTATION STANDARD POS</small><h2>Πληκτρολόγιο οθόνης <span>${lang==="EL"?"Ελληνικά":"English"}</span></h2></div><button type="button" data-key="CLOSE" aria-label="Κλείσιμο">✕</button></header><main><div class="mws-touch-number-row">${numbers.map(k=>`<button type="button" data-key="${k}">${k==="BACK"?"⌫":k}</button>`).join("")}</div>${sizes.map(line).join("")}<div class="mws-touch-row mws-touch-special"><button type="button" data-key="SHIFT">⇧</button><button type="button" data-key="LANG">${lang==="EL"?"EN":"ΕΛ"}</button><button type="button" data-key="@">@</button><button type="button" data-key="SPACE" class="space">κενό</button><button type="button" data-key=".">.</button><button type="button" data-key=",">,</button><button type="button" data-key="ENTER" class="enter">↵</button></div></main></section>`;
  bindKeys(root);
}
function insertText(text){
  const input=activeInput;if(!input)return;
  if(input.isContentEditable){setDomValue(input,(input.textContent||"")+text);return}
  const value=input.value||"",start=input.selectionStart??value.length,end=input.selectionEnd??start,nextValue=value.slice(0,start)+text+value.slice(end),next=start+text.length;
  setDomValue(input,nextValue);try{input.focus({preventScroll:true});input.setSelectionRange(next,next)}catch{}
}
function handle(key){
  if(key==="CLOSE"){close();return}
  if(!activeInput)return;
  if(key==="LANG"){lang=lang==="EL"?"EN":"EL";shift=false;render();return}
  if(key==="SHIFT"){shift=!shift;render();return}
  if(key==="SPACE"){insertText(" ");return}
  if(key==="CLEAR"){setDomValue(activeInput,"");try{activeInput.focus({preventScroll:true})}catch{}return}
  if(key==="MINUS"){insertText("-");return}
  if(key==="BACK"){
    const input=activeInput;if(input.isContentEditable){setDomValue(input,(input.textContent||"").slice(0,-1));return}
    const value=input.value||"",start=input.selectionStart??value.length,end=input.selectionEnd??start;
    if(start!==end){setDomValue(input,value.slice(0,start)+value.slice(end));try{input.focus({preventScroll:true});input.setSelectionRange(start,start)}catch{}}
    else if(start>0){setDomValue(input,value.slice(0,start-1)+value.slice(end));try{input.focus({preventScroll:true});input.setSelectionRange(start-1,start-1)}catch{}}
    return;
  }
  if(key==="ENTER"){const input=activeInput;input.dispatchEvent(new KeyboardEvent("keydown",{key:"Enter",code:"Enter",bubbles:true}));input.dispatchEvent(new KeyboardEvent("keyup",{key:"Enter",code:"Enter",bubbles:true}));if(input.tagName!=="TEXTAREA")close();return}
  let text=key;if(isNumeric(activeInput)&&key===",")text=".";else if(shift)text=key.toLocaleUpperCase(lang==="EL"?"el-GR":"en-US");insertText(text);if(shift){shift=false;render()}
}
function prepareInput(input){if(!(input instanceof HTMLInputElement))return;const type=(input.type||"text").toLowerCase();if(NUMERIC_TYPES.has(type))input.dataset.mwsNumeric="1";if(!input.dataset.mwsOriginalInputmode)input.dataset.mwsOriginalInputmode=input.getAttribute("inputmode")??"__none__";input.setAttribute("inputmode","none")}
function removeButton(){if(activeButton){activeButton.remove();activeButton=null}document.querySelectorAll('.mws-touch-field-trigger').forEach(b=>b.remove())}
function makeButton(input){removeButton();const button=document.createElement("button");button.type="button";button.className="mws-touch-field-trigger";button.title="Άνοιγμα πληκτρολογίου οθόνης";button.setAttribute("aria-label","Άνοιγμα πληκτρολογίου οθόνης");button.textContent="⌨";button.addEventListener("pointerdown",event=>{event.preventDefault();event.stopPropagation();open(input)},{passive:false});document.body.appendChild(button);activeButton=button;positionButton(input,button);return button}
function positionButton(input,button=activeButton){if(!button||!editable(input)||!input.isConnected){removeButton();return}const rect=input.getBoundingClientRect();const hidden=rect.width<=0||rect.height<=0||rect.bottom<0||rect.top>window.innerHeight||rect.right<0||rect.left>window.innerWidth;button.hidden=hidden;if(hidden)return;const size=Math.max(28,Math.min(34,rect.height-6));const left=Math.max(rect.left+2,rect.right-size-4),top=Math.max(3,Math.min(window.innerHeight-size-3,rect.top+(rect.height-size)/2));button.style.left=`${left}px`;button.style.top=`${top}px`;button.style.width=`${size}px`;button.style.height=`${size}px`}
function syncButton(){const focused=editable(document.activeElement)?document.activeElement:null;if(!focused){removeButton();return}if(!activeButton)makeButton(focused);else positionButton(focused,activeButton)}
function open(input){if(!editable(input))return;activeInput=input;input.dataset.mwsTouchKeyboard="1";prepareInput(input);try{input.focus({preventScroll:true})}catch{}render();if(!activeButton)makeButton(input)}
function close(){if(activeInput instanceof HTMLInputElement&&activeInput.dataset.mwsOriginalInputmode){const old=activeInput.dataset.mwsOriginalInputmode;if(old==="__none__")activeInput.removeAttribute("inputmode");else activeInput.setAttribute("inputmode",old);delete activeInput.dataset.mwsOriginalInputmode;delete activeInput.dataset.mwsNumeric}activeInput=null;shift=false;ensure().hidden=true;removeButton()}
function scheduleSync(){requestAnimationFrame(syncButton)}
export function installTouchKeyboard(){
  installBackofficeColumnFilters();ensure();removeButton();
  const observer=new MutationObserver(scheduleSync);observer.observe(document.documentElement,{childList:true,subtree:true,attributes:true,attributeFilter:["class","style","disabled","readonly","type"]});
  document.addEventListener("pointerdown",event=>{
    const el=event.target;
    if(editable(el)){
      prepareInput(el);
      if(isTouchLikePointer(event.pointerType)){
        lastTouchAt=Date.now();
        event.preventDefault();
        open(el);
        return;
      }
    }
    if(!activeInput)return;
    if(el.closest?.("#mws-touch-keyboard,.mws-touch-field-trigger"))return;
    if(el===activeInput)return;
    if(!editable(el))close();
  },true);
  document.addEventListener("focusin",event=>{
    const el=event.target;
    if(!editable(el)){removeButton();return}
    prepareInput(el);makeButton(el);
    if(Date.now()-lastTouchAt<2200)open(el);
  },true);
  document.addEventListener("focusout",()=>setTimeout(syncButton,0),true);
  window.addEventListener("resize",scheduleSync);
  window.addEventListener("scroll",scheduleSync,true);
}
