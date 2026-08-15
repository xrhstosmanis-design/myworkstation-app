const norm=s=>String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toUpperCase().replace(/[^A-ZΑ-Ω0-9 ]/g,' ').replace(/\s+/g,' ').trim();
const stop=new Set(['ΑΕ','Α','Ε','ΙΚΕ','ΜΟΝ','ΕΠΕ','ΟΕ','ΕΕ','BEER','SUPPLIES','SUPPLY','THE','AND']);
const tokens=s=>norm(s).split(' ').filter(x=>x.length>=3&&!stop.has(x));
const setNative=(el,value)=>{const set=Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,'value')?.set;if(set)set.call(el,value);else el.value=value;el.dispatchEvent(new Event('change',{bubbles:true}));};
function scoreNames(a,b){const A=tokens(a),B=tokens(b);if(!A.length||!B.length)return 0;const sa=new Set(A),sb=new Set(B);let common=0;for(const x of sa)if(sb.has(x))common++;const contain=norm(a).includes(norm(b))||norm(b).includes(norm(a));return contain?1:common/Math.min(sa.size,sb.size);}
function tryMatch(panel){
  const box=panel.querySelector('.mws-new-supplier');
  if(!box||box.style.display==='none')return;
  const candidate=panel.querySelector('.mws-sup-name')?.value?.trim()||'';
  const tax=(panel.querySelector('.mws-sup-tax')?.value||'').replace(/\D/g,'');
  if(!candidate&&!tax)return;
  const form=panel.closest('.pos-payment-form');
  const select=form?.querySelector('select');
  if(!select)return;
  let best=null,bestScore=0;
  for(const option of [...select.options]){
    if(!option.value)continue;
    const text=option.textContent||'';
    const digits=text.replace(/\D/g,'');
    if(tax&&tax.length>=9&&digits.includes(tax)){best=option;bestScore=2;break;}
    const score=scoreNames(candidate,text);
    if(score>bestScore){best=option;bestScore=score;}
  }
  if(best&&bestScore>=0.5){
    setNative(select,best.value);
    box.style.display='none';
    const status=panel.querySelector('.mws-invoice-status');
    if(status){const current=status.innerHTML;status.innerHTML=current.replace(/Προμηθευτής:\s*<b>.*?<\/b>/i,`Προμηθευτής: <b>${best.textContent}</b>`);}
    panel.dataset.mwsExistingSupplierMatch=best.value;
  }
}
function scan(){document.querySelectorAll('.pos-invoice-scan-v2').forEach(tryMatch)}
new MutationObserver(scan).observe(document.documentElement,{subtree:true,childList:true,characterData:true,attributes:true});
setInterval(scan,500);scan();
