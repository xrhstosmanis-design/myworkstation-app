const CACHE_KEY='mws:pending-invoice-payment-v1';
const norm=s=>String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toUpperCase().replace(/[^A-ZΑ-Ω0-9 ]/g,' ').replace(/\s+/g,' ').trim();
const stop=new Set(['ΑΕ','Α','Ε','ΙΚΕ','ΜΟΝ','ΕΠΕ','ΟΕ','ΕΕ','BEER','SUPPLIES','SUPPLY','THE','AND']);
const tokens=s=>norm(s).split(' ').filter(x=>x.length>=3&&!stop.has(x));
const setNative=(el,value)=>{const set=Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,'value')?.set;if(set)set.call(el,value);else el.value=value;el.dispatchEvent(new Event('change',{bubbles:true}));};
const writeCache=data=>{try{const old=JSON.parse(sessionStorage.getItem(CACHE_KEY)||'{}');sessionStorage.setItem(CACHE_KEY,JSON.stringify({...old,...data,updatedAt:Date.now()}))}catch{}};
function scoreNames(a,b){const A=tokens(a),B=tokens(b);if(!A.length||!B.length)return 0;const sa=new Set(A),sb=new Set(B);let common=0;for(const x of sa)if(sb.has(x))common++;const contain=norm(a).includes(norm(b))||norm(b).includes(norm(a));return contain?1:common/Math.min(sa.size,sb.size);}
function candidateName(panel){
  const field=panel.querySelector('.mws-sup-name')?.value?.trim();
  if(field)return field;
  const status=panel.querySelector('.mws-invoice-status')?.textContent||'';
  const match=status.match(/Προμηθευτής:\s*(.+?)(?:\s*·\s*Αρ\.|\s*·\s*Σύνολο:|$)/i);
  return match?.[1]?.trim()||'';
}
function findExisting(panel){
  const candidate=candidateName(panel);
  const tax=(panel.querySelector('.mws-sup-tax')?.value||'').replace(/\D/g,'');
  if(!candidate&&!tax)return null;
  const form=panel.closest('.pos-payment-form');
  const select=form?.querySelector('select');
  if(!select)return null;
  let best=null,bestScore=0;
  for(const option of [...select.options]){
    if(!option.value)continue;
    const text=option.textContent||'';
    const digits=text.replace(/\D/g,'');
    if(tax&&tax.length>=9&&digits.includes(tax)){best=option;bestScore=2;break;}
    const score=scoreNames(candidate,text);
    if(score>bestScore){best=option;bestScore=score;}
  }
  return best&&bestScore>=0.67?{option:best,score:bestScore,select}:null;
}
function applyMatch(panel,match){
  if(!match)return false;
  setNative(match.select,match.option.value);
  const supplierText=match.option.textContent?.trim()||'';
  writeCache({supplier:supplierText,supplierValue:match.option.value});
  const box=panel.querySelector('.mws-new-supplier');
  if(box)box.style.display='none';
  const status=panel.querySelector('.mws-invoice-status');
  if(status){
    const current=status.innerHTML||status.textContent||'';
    if(/Προμηθευτής:/i.test(current))status.innerHTML=current.replace(/Προμηθευτής:\s*<b>.*?<\/b>/i,`Προμηθευτής: <b>${supplierText}</b>`);
  }
  panel.dataset.mwsExistingSupplierMatch=match.option.value;
  return true;
}
function tryMatch(panel){applyMatch(panel,findExisting(panel));}
function scan(){document.querySelectorAll('.pos-invoice-scan-v2').forEach(tryMatch)}

document.addEventListener('click',event=>{
  const button=event.target?.closest?.('.mws-save-supplier');
  if(!button)return;
  const panel=button.closest('.pos-invoice-scan-v2');
  if(!panel)return;
  const match=findExisting(panel);
  if(!match)return;
  event.preventDefault();event.stopPropagation();event.stopImmediatePropagation();applyMatch(panel,match);
},{capture:true});

new MutationObserver(scan).observe(document.documentElement,{subtree:true,childList:true,characterData:true});
setInterval(scan,750);scan();
