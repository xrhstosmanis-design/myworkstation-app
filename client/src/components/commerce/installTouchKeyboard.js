const TEXT_TYPES=new Set(["text","search","email","tel","password","url"]);
const NUMERIC_TYPES=new Set(["number"]);
let activeInput=null,lastTouchAt=0,lang="EL",shift=false,activeButton=null;

const fire=input=>{input.dispatchEvent(new Event("input",{bubbles:true}));input.dispatchEvent(new Event("change",{bubbles:true}))};
const editable=el=>{
  if(!(el instanceof HTMLElement)||el.disabled||el.readOnly||el.dataset?.keyboard==="off")return false;
  if(el.matches("textarea,[contenteditable='true']"))return true;
  if(!(el instanceof HTMLInputElement))return false;
  const type=(el.type||"text").toLowerCase();
  return TEXT_TYPES.has(type)||NUMERIC_TYPES.has(type);
};
const isNumeric=input=>input instanceof HTMLInputElement&&(NUMERIC_TYPES.has((input.type||"").toLowerCase())||input.dataset.mwsNumeric==="1");
const isTouchLikePointer=pointerType=>pointerType==="touch"||pointerType==="pen";
const labels={EL:["ς","ε","ρ","τ","υ","θ","ι","ο","π","α","σ","δ","φ","γ","η","ξ","κ","λ","ζ","χ","ψ","ω","β","ν","μ"],EN:["q","w","e","r","t","y","u","i","o","p","a","s","d","f","g","h","j","k","l","z","x","c","v","b","n","m"]};
const rows={EL:[9,9,7],EN:[10,9,7]};

function ensure(){
  let root=document.getElementById("mws-touch-keyboard");if(root)return root;
  root=document.createElement("section");root.id="mws-touch-keyboard";root.className="mws-touch-keyboard";root.hidden=true;root.setAttribute("aria-label","Πληκτρολόγιο αφής MyWorkStation");document.body.appendChild(root);
  root.addEventListener("pointerdown",event=>event.preventDefault());
  root.addEventListener("click",event=>{const key=event.target.closest("button[data-key]");if(!key||!activeInput)return;handle(key.dataset.key)});
  return root;
}
function render(){
  const root=ensure();if(!activeInput){root.hidden=true;return}root.hidden=false;
  if(isNumeric(activeInput)){
    root.innerHTML=`<div class="mws-touch-head"><b>Αριθμητικό πληκτρολόγιο</b><button data-key="CLOSE">✕</button></div><div class="mws-touch-numeric">${["7","8","9","4","5","6","1","2","3",",","0","BACK"].map(k=>`<button data-key="${k}">${k==="BACK"?"⌫":k}</button>`).join("")}</div><div class="mws-touch-actions"><button data-key="MINUS">−</button><button data-key="CLEAR">Καθαρισμός</button><button class="enter" data-key="ENTER">Enter ↵</button></div>`;return;
  }
  const chars=labels[lang],sizes=rows[lang];let cursor=0;
  const line=s=>{const part=chars.slice(cursor,cursor+s);cursor+=s;return `<div class="mws-touch-row">${part.map(ch=>`<button data-key="${ch}">${shift?ch.toLocaleUpperCase(lang==="EL"?"el-GR":"en-US"):ch}</button>`).join("")}</div>`};
  root.innerHTML=`<div class="mws-touch-head"><b>Πληκτρολόγιο οθόνης</b><span>${lang==="EL"?"Ελληνικά":"English"}</span><button data-key="CLOSE">✕</button></div>${sizes.map(line).join("")}<div class="mws-touch-row mws-touch-special"><button data-key="SHIFT">⇧</button><button data-key="LANG">${lang==="EL"?"EN":"ΕΛ"}</button><button data-key="@">@</button><button data-key="SPACE" class="space">κενό</button><button data-key=".">.</button><button data-key="BACK">⌫</button><button data-key="ENTER" class="enter">↵</button></div>`;
}
function insertText(text){
  const input=activeInput;if(!input)return;
  if(input.isContentEditable){document.execCommand("insertText",false,text);fire(input);return}
  const value=input.value||"",start=input.selectionStart??value.length,end=input.selectionEnd??start;input.value=value.slice(0,start)+text+value.slice(end);const next=start+text.length;try{input.setSelectionRange(next,next)}catch{}fire(input)
}
function handle(key){
  if(!activeInput)return;if(key==="CLOSE"){close();return}if(key==="LANG"){lang=lang==="EL"?"EN":"EL";shift=false;render();return}if(key==="SHIFT"){shift=!shift;render();return}if(key==="SPACE"){insertText(" ");return}if(key==="CLEAR"){if(activeInput.isContentEditable)activeInput.textContent="";else activeInput.value="";fire(activeInput);return}if(key==="MINUS"){insertText("-");return}
  if(key==="BACK"){const input=activeInput;if(input.isContentEditable){document.execCommand("delete");fire(input);return}const value=input.value||"",start=input.selectionStart??value.length,end=input.selectionEnd??start;if(start!==end){input.value=value.slice(0,start)+value.slice(end);try{input.setSelectionRange(start,start)}catch{}}else if(start>0){input.value=value.slice(0,start-1)+value.slice(end);try{input.setSelectionRange(start-1,start-1)}catch{}}fire(input);return}
  if(key==="ENTER"){const input=activeInput;fire(input);input.dispatchEvent(new KeyboardEvent("keydown",{key:"Enter",code:"Enter",bubbles:true}));if(input.tagName!=="TEXTAREA")close();return}
  let text=key;if(isNumeric(activeInput)&&key===",")text=".";else if(shift)text=key.toLocaleUpperCase(lang==="EL"?"el-GR":"en-US");insertText(text);if(shift){shift=false;render()}
}
function prepareInput(input){
  if(!(input instanceof HTMLInputElement))return;
  const type=(input.type||"text").toLowerCase();if(NUMERIC_TYPES.has(type))input.dataset.mwsNumeric="1";
  if(!input.dataset.mwsOriginalInputmode)input.dataset.mwsOriginalInputmode=input.getAttribute("inputmode")??"__none__";
  input.setAttribute("inputmode","none");
}
function removeButton(){if(activeButton){activeButton.remove();activeButton=null}document.querySelectorAll('.mws-touch-field-trigger').forEach(b=>b.remove())}
function makeButton(input){
  removeButton();
  const button=document.createElement("button");button.type="button";button.className="mws-touch-field-trigger";button.title="Άνοιγμα πληκτρολογίου οθόνης";button.setAttribute("aria-label","Άνοιγμα πληκτρολογίου οθόνης");button.textContent="⌨";
  button.addEventListener("pointerdown",event=>event.preventDefault());button.addEventListener("click",event=>{event.preventDefault();event.stopPropagation();open(input)});document.body.appendChild(button);activeButton=button;positionButton(input,button);return button;
}
function positionButton(input,button=activeButton){
  if(!button||!editable(input)||!input.isConnected){removeButton();return}
  const rect=input.getBoundingClientRect();const hidden=rect.width<=0||rect.height<=0||rect.bottom<0||rect.top>window.innerHeight||rect.right<0||rect.left>window.innerWidth;
  button.hidden=hidden;if(hidden)return;
  const size=Math.max(28,Math.min(34,rect.height-6));
  const left=Math.max(rect.left+2,rect.right-size-4),top=Math.max(3,Math.min(window.innerHeight-size-3,rect.top+(rect.height-size)/2));
  button.style.left=`${left}px`;button.style.top=`${top}px`;button.style.width=`${size}px`;button.style.height=`${size}px`;
}
function syncButton(){
  const focused=editable(document.activeElement)?document.activeElement:null;
  if(!focused){removeButton();return}
  if(!activeButton)makeButton(focused);else positionButton(focused,activeButton);
}
function open(input){if(!editable(input))return;activeInput=input;input.dataset.mwsTouchKeyboard="1";prepareInput(input);render();if(!activeButton)makeButton(input);setTimeout(()=>input.focus({preventScroll:true}),0)}
function close(){if(activeInput instanceof HTMLInputElement&&activeInput.dataset.mwsOriginalInputmode){const old=activeInput.dataset.mwsOriginalInputmode;if(old==="__none__")activeInput.removeAttribute("inputmode");else activeInput.setAttribute("inputmode",old);delete activeInput.dataset.mwsOriginalInputmode;delete activeInput.dataset.mwsNumeric}activeInput=null;shift=false;ensure().hidden=true;syncButton()}
function scheduleSync(){requestAnimationFrame(syncButton)}
export function installTouchKeyboard(){
  ensure();removeButton();
  const observer=new MutationObserver(scheduleSync);observer.observe(document.documentElement,{childList:true,subtree:true,attributes:true,attributeFilter:["class","style","disabled","readonly","type"]});
  document.addEventListener("pointerdown",event=>{if(isTouchLikePointer(event.pointerType)){lastTouchAt=Date.now();const el=event.target;if(editable(el))prepareInput(el)}},true);
  document.addEventListener("focusin",event=>{const el=event.target;if(!editable(el)){removeButton();return}makeButton(el);if(Date.now()-lastTouchAt<1800)open(el)},true);
  document.addEventListener("focusout",()=>setTimeout(syncButton,0),true);
  document.addEventListener("pointerdown",event=>{if(!activeInput)return;if(event.target.closest("#mws-touch-keyboard,.mws-touch-field-trigger"))return;if(event.target===activeInput)return;if(!editable(event.target))close()},true);
  window.addEventListener("resize",scheduleSync);window.addEventListener("scroll",scheduleSync,true);
}
