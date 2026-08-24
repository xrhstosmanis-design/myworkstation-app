const PATH='/platform-admin/invoice-learning-lab';
if(window.location.pathname.replace(/\/+$/,'')===PATH){
  const STATE_KEY='mws_invoice_learning_lab_v1';
  const META_KEY='mws_invoice_learning_taxonomy_v1';
  const parse=function(v,f){try{return JSON.parse(v||'')||f}catch(e){return f}};
  const norm=function(v){return String(v||'').trim()};
  const unitOptions=['ΤΜΧ','PCS','PACK','BOX','GR','KG','ML','LT'];
  const headers=function(){return {Authorization:'Bearer '+(localStorage.getItem('token')||'')}};

  async function centralTaxonomy(){
    try{
      const r=await fetch('/api/platform/invoice-learning/product-knowledge',{headers:headers()});
      const d=await r.json().catch(function(){return {}});
      if(!r.ok)return [];
      return Array.isArray(d.products)?d.products:[];
    }catch(e){return []}
  }

  async function taxonomy(){
    const cats=new Set();
    const subs=new Map();
    function add(cat,sub){
      cat=norm(cat);sub=norm(sub);if(!cat)return;
      cats.add(cat);if(!subs.has(cat))subs.set(cat,new Set());if(sub)subs.get(cat).add(sub);
    }
    const state=parse(localStorage.getItem(STATE_KEY),{documents:[],master:[]});
    const meta=parse(localStorage.getItem(META_KEY),{});
    (state.master||[]).forEach(function(x){add(x.category||x.categoryName,x.subcategory||x.subcategoryName)});
    (state.documents||[]).forEach(function(d){(d.lines||[]).forEach(function(l){add(l.category,l.subcategory)})});
    Object.values(meta||{}).forEach(function(m){add(m&&m.category,m&&m.subcategory)});
    const central=await centralTaxonomy();
    central.forEach(function(x){const k=(x.knowledge&&typeof x.knowledge==='object')?x.knowledge:{};add(k.category,k.subcategory)});
    return {categories:Array.from(cats).sort(function(a,b){return a.localeCompare(b,'el')}),subs:subs};
  }

  function makeSelect(input,values,opts){
    opts=opts||{};
    if(!input||input.tagName==='SELECT')return input;
    const current=norm(input.value);
    const select=document.createElement('select');
    Array.from(input.attributes).forEach(function(attr){select.setAttribute(attr.name,attr.value)});
    function addOption(value,text){const o=document.createElement('option');o.value=value;o.textContent=text;select.appendChild(o)}
    addOption('',opts.blank||'—');
    const unique=[];
    (values||[]).forEach(function(v){v=norm(v);if(v&&unique.indexOf(v)===-1)unique.push(v)});
    if(current&&unique.indexOf(current)===-1)unique.unshift(current);
    unique.forEach(function(v){addOption(v,v)});
    if(opts.newLabel!==null)addOption('__NEW__',opts.newLabel||'+ Νέα...');
    select.value=current;
    select.addEventListener('change',function(){
      if(select.value==='__NEW__'){
        const raw=window.prompt(opts.onNew||'Νέα τιμή:','');
        const v=raw?raw.trim():'';
        if(!v){select.value=current;return}
        const o=document.createElement('option');o.value=v;o.textContent=v;select.insertBefore(o,select.lastElementChild);select.value=v;
      }
      select.dispatchEvent(new Event('input',{bubbles:true}));
      if(typeof opts.onChange==='function')opts.onChange(select.value,select);
    });
    input.replaceWith(select);
    return select;
  }

  async function install(modal){
    if(!modal||modal.dataset.mwsProductSelects==='1')return;
    const catInput=modal.querySelector('[data-f="category"]');
    const subInput=modal.querySelector('[data-f="subcategory"]');
    if(!catInput||!subInput)return;
    modal.dataset.mwsProductSelects='1';
    const t=await taxonomy();
    let subSelect=null;
    function allSubs(){const out=[];t.subs.forEach(function(set){set.forEach(function(v){if(out.indexOf(v)===-1)out.push(v)})});return out}
    function fillSubs(cat){
      const values=cat&&t.subs.has(cat)?Array.from(t.subs.get(cat)):allSubs();
      let target=subSelect||subInput;
      const old=norm(target.value);
      if(subSelect){
        const fresh=document.createElement('input');
        Array.from(subSelect.attributes).forEach(function(a){fresh.setAttribute(a.name,a.value)});
        fresh.value=old;subSelect.replaceWith(fresh);target=fresh;
      }
      subSelect=makeSelect(target,values,{blank:'Χωρίς υποκατηγορία',onNew:'Νέα Υποκατηγορία:'});
    }
    const catSelect=makeSelect(catInput,t.categories,{blank:'— Επιλογή —',onNew:'Νέα Κατηγορία:',onChange:function(value){fillSubs(value)}});
    fillSubs(catSelect.value);
    makeSelect(modal.querySelector('[data-f="stockUnit"]'),unitOptions,{blank:'— Επιλογή —',newLabel:null});
    makeSelect(modal.querySelector('[data-f="invoiceUnit"]'),unitOptions,{blank:'— Επιλογή —',newLabel:null});
  }

  function scan(){document.querySelectorAll('.pb-modal').forEach(function(m){install(m)})}
  new MutationObserver(scan).observe(document.documentElement,{childList:true,subtree:true});
  scan();
}
