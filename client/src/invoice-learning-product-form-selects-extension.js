const PATH='/platform-admin/invoice-learning-lab';
if(window.location.pathname.replace(/\/+$/,'')===PATH){
  const STATE_KEY='mws_invoice_learning_lab_v1';
  const META_KEY='mws_invoice_learning_taxonomy_v1';
  const parse=(v,f)=>{try{return JSON.parse(v||'')||f}catch{return f}};
  const norm=v=>String(v||'').trim();
  const unitOptions=['ΤΜΧ','PCS','PACK','BOX','GR','KG','ML','LT'];
  const headers=()=>({Authorization:`Bearer ${localStorage.getItem('token')||''}`});

  async function centralTaxonomy(){
    try{
      const r=await fetch('/api/platform/invoice-learning/product-knowledge',{headers:headers()});
      const d=await r.json().catch(()=>({}));
      if(!r.ok)return [];
      return Array.isArray(d.products)?d.products:[];
    }catch{return []}
  }

  async function taxonomy(){
    const cats=new Set(),subs=new Map();
    const add=(cat,sub)=>{cat=norm(cat);sub=norm(sub);if(!cat)return;cats.add(cat);if(!subs.has(cat))subs.set(cat,new Set());if(sub)subs.get(cat).add(sub)};
    const state=parse(localStorage.getItem(STATE_KEY),{documents:[],master:[]});
    const meta=parse(localStorage.getItem(META_KEY),{});
    for(const x of state.master||[])add(x.category||x.categoryName,x.subcategory||x.subcategoryName);
    for(const d of state.documents||[])for(const l of d.lines||[])add(l.category,l.subcategory);
    for(const m of Object.values(meta||{}))add(m?.category,m?.subcategory);
    for(const x of await centralTaxonomy()){const k=x.knowledge&&typeof x.knowledge==='object'?x.knowledge:{};add(k.category,k.subcategory)}
    return {categories:[...cats].sort((a,b)=>a.localeCompare(b,'el')),subs};
  }

  function replaceWithSelect(input,values,{blank='—',newLabel='+ Νέα...',onNew,onChange}={}){
    if(!input||input.tagName==='SELECT')return input;
    const current=norm(input.value),select=document.createElement('select');
    for(const attr of input.attributes)select.setAttribute(attr.name,attr.value);
    select.innerHTML='';
    const addOption=(value,text=value)=>{const o=document.createElement('option');o.value=value;o.textContent=text;select.appendChild(o)};
    addOption('',blank);
    const unique=[...new Set(values.map(norm).filter(Boolean))];if(current&&!unique.includes(current))unique.unshift(current);
    unique.forEach(v=>addOption(v));
    if(newLabel)addOption('__NEW__',newLabel);
    select.value=current;
    select.addEventListener('change',()=>{
      if(select.value==='__NEW__'){
        const v=window.prompt(onNew||'Νέα τιμή:','')?.trim()||'';
        if(!v){select.value=current;return}
        const o=document.createElement('option');o.value=v;o.textContent=v;select.insertBefore(o,select.lastElementChild);select.value=v;
      }
      select.dispatchEvent(new Event('input',{bubbles:true}));
      onChange?.(select.value,select);
    });
    input.replaceWith(select);return select;
  }

  async function install(modal){
    if(!modal||modal.dataset.mwsProductSelects==='1')return;
    const catInput=modal.querySelector('[data-f="category"]'),subInput=modal.querySelector('[data-f="subcategory"]');
    if(!catInput||!subInput)return;
    modal.dataset.mwsProductSelects='1';
    const t=await taxonomy();
    let subSelect;
    const fillSubs=cat=>{
      const values=cat?[...(t.subs.get(cat)||[])]:[...new Set([...t.subs.values()].flatMap(s=>[...s]))];
      const old=norm(subSelect?.value||subInput.value);
      if(subSelect){const fresh=document.createElement('input');for(const a of subSelect.attributes)fresh.setAttribute(a.name,a.value);fresh.value=old;subSelect.replaceWith(fresh);subSelect=fresh}
      subSelect=replaceWithSelect(subSelect||subInput,values,{blank='Χωρίς υποκατηγορία',onNew:'Νέα Υποκατηγορία:'});
    };
    const catSelect=replaceWithSelect(catInput,t.categories,{blank='— Επιλογή —',onNew:'Νέα Κατηγορία:',onChange:value=>fillSubs(value)});
    fillSubs(catSelect.value);
    replaceWithSelect(modal.querySelector('[data-f="stockUnit"]'),unitOptions,{blank:'— Επιλογή —',newLabel:null});
    replaceWithSelect(modal.querySelector('[data-f="invoiceUnit"]'),unitOptions,{blank:'— Επιλογή —',newLabel:null});
  }

  const scan=()=>document.querySelectorAll('.pb-modal').forEach(m=>install(m));
  new MutationObserver(scan).observe(document.documentElement,{childList:true,subtree:true});scan();
}
