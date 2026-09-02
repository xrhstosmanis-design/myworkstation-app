const PATH='/platform-admin/invoice-learning-lab';
if(window.location.pathname.replace(/\/+$/,'')===PATH){
  const KEY='mws_invoice_learning_lab_v1';
  const META_KEY='mws_invoice_learning_taxonomy_v1';
  const parse=(v,f)=>{try{return JSON.parse(v||'')||f}catch{return f}};
  let meta=parse(localStorage.getItem(META_KEY),{});
  const saveMeta=()=>localStorage.setItem(META_KEY,JSON.stringify(meta));
  const docParts=()=>{const s=id=>document.querySelector(id)?.value?.trim()||'';return [s('#supplierTaxId'),s('#invoiceNo'),s('#invoiceDate'),s('#supplierName')]};
  const docKey=()=>docParts().join('|')||'CURRENT';
  const lineNo=tr=>tr.querySelector('td')?.textContent?.trim()||'';
  const supplierCode=tr=>tr.querySelector('[data-k="supplierItemCode"]')?.value?.trim()||'';
  const rowKey=tr=>`${docKey()}|${lineNo(tr)}|${supplierCode(tr)}`;
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));
  const unitOptions=['','PCS','PACK','BOX','GR','KG','ML','LT'];
  const vatOptions=['','0','6','13','24'];

  const getState=()=>parse(localStorage.getItem(KEY),{documents:[],profiles:{},master:[]});
  const savedLineFor=tr=>{
    const state=getState(),parts=docParts(),docs=Array.isArray(state.documents)?state.documents:[];
    const d=docs.find(x=>[x.supplierTaxId||'',x.invoiceNo||x.invoiceNumber||'',x.invoiceDate||'',x.supplierName||''].join('|')===parts.join('|'));
    return d?.lines?.find(x=>String(x.lineNo||'')===lineNo(tr)&&String(x.supplierItemCode||'')===supplierCode(tr))||null;
  };
  const valuesFor=tr=>({...savedLineFor(tr),...(meta[rowKey(tr)]||{})});

  function taxonomy(){
    const state=getState();const cats=new Set(),subsByCat=new Map();
    const add=(cat,sub)=>{cat=String(cat||'').trim();sub=String(sub||'').trim();if(cat){cats.add(cat);if(!subsByCat.has(cat))subsByCat.set(cat,new Set());if(sub)subsByCat.get(cat).add(sub)}};
    for(const x of Array.isArray(state.master)?state.master:[])add(x.category||x.categoryName,x.subcategory||x.subcategoryName);
    for(const d of Array.isArray(state.documents)?state.documents:[])for(const l of Array.isArray(d.lines)?d.lines:[])add(l.category,l.subcategory);
    for(const m of Object.values(meta||{}))add(m?.category,m?.subcategory);
    return {categories:[...cats].sort((a,b)=>a.localeCompare(b,'el')),subsByCat};
  }

  const optionHtml=(values,current,blank='—')=>`<option value="">${blank}</option>`+values.map(x=>`<option value="${esc(x)}" ${String(current||'')===String(x)?'selected':''}>${esc(x)}</option>`).join('')+`<option value="__NEW__">+ Νέα...</option>`;

  function ensureHeader(){
    const head=document.querySelector('#review thead tr');if(!head||head.dataset.taxonomyReady)return;
    const status=head.lastElementChild;
    for(const text of ['Κατηγορία','Υποκατηγορία','Μονάδα','Συσκευασία']){const th=document.createElement('th');th.textContent=text;head.insertBefore(th,status)}
    head.dataset.taxonomyReady='1';
  }

  function persist(tr){
    const key=rowKey(tr),cur=meta[key]||{};
    tr.querySelectorAll('[data-tax]').forEach(el=>cur[el.dataset.tax]=el.value);
    cur.vatRate=tr.querySelector('[data-k="vatRate"]')?.value||'';meta[key]=cur;saveMeta();
  }

  function handleNew(select,label,tr){
    if(select.value!=='__NEW__')return false;
    const value=window.prompt(`Νέα ${label}:`,'')?.trim()||'';
    if(!value){select.value='';return true}
    const opt=document.createElement('option');opt.value=value;opt.textContent=value;select.insertBefore(opt,select.lastElementChild);select.value=value;persist(tr);return true;
  }

  function refillSubcategory(tr,selected=''){
    const cat=tr.querySelector('[data-tax="category"]')?.value||'';
    const sub=tr.querySelector('[data-tax="subcategory"]');if(!sub)return;
    const t=taxonomy();const values=cat?[...(t.subsByCat.get(cat)||[])].sort((a,b)=>a.localeCompare(b,'el')):[...new Set([...t.subsByCat.values()].flatMap(s=>[...s]))].sort((a,b)=>a.localeCompare(b,'el'));
    const keep=selected||sub.value;sub.innerHTML=optionHtml(values,keep);
    if(keep&&!values.includes(keep)){const opt=document.createElement('option');opt.value=keep;opt.textContent=keep;sub.insertBefore(opt,sub.lastElementChild);sub.value=keep}
  }

  function enrichRow(tr){
    if(tr.dataset.taxonomyReady)return;const statusTd=tr.lastElementChild;if(!statusTd)return;
    const v=valuesFor(tr),t=taxonomy();
    const defs=[
      `<select data-tax="category">${optionHtml(t.categories,v.category)}</select>`,
      `<select data-tax="subcategory"></select>`,
      `<select data-tax="unit">${unitOptions.map(x=>`<option value="${x}" ${String(v.unit||'')===x?'selected':''}>${x||'—'}</option>`).join('')}</select>`,
      `<input data-tax="packaging" placeholder="π.χ. 12 x 500ML" value="${esc(v.packaging||'')}">`
    ];
    for(const html of defs){const td=document.createElement('td');td.innerHTML=html;tr.insertBefore(td,statusTd)}
    refillSubcategory(tr,v.subcategory||'');

    const vat=tr.querySelector('[data-k="vatRate"]');
    if(vat&&vat.tagName==='INPUT'&&!vat.dataset.taxonomyVat){const select=document.createElement('select');select.dataset.k='vatRate';select.dataset.taxonomyVat='1';const current=String(vat.value||v.vatRate||'');select.innerHTML=vatOptions.map(x=>`<option value="${x}" ${current===x?'selected':''}>${x?x+'%':'—'}</option>`).join('');vat.replaceWith(select)}

    const cat=tr.querySelector('[data-tax="category"]'),sub=tr.querySelector('[data-tax="subcategory"]');
    cat?.addEventListener('change',()=>{if(handleNew(cat,'Κατηγορία',tr)){refillSubcategory(tr,v.subcategory||'');return}persist(tr);refillSubcategory(tr,'')});
    sub?.addEventListener('change',()=>{if(handleNew(sub,'Υποκατηγορία',tr))return;persist(tr)});
    tr.querySelectorAll('[data-tax="unit"],[data-tax="packaging"]').forEach(el=>el.addEventListener('change',()=>persist(tr)));
    tr.querySelector('[data-k="vatRate"]')?.addEventListener('change',()=>persist(tr));
    tr.dataset.taxonomyReady='1';
  }

  function scan(){ensureHeader();document.querySelectorAll('#lines tr').forEach(enrichRow)}
  function captureVisible(){document.querySelectorAll('#lines tr').forEach(persist)}
  function mergeIntoMainState(){
    const state=getState(),docs=Array.isArray(state.documents)?state.documents:[];
    for(const d of docs){const dk=[d.supplierTaxId||'',d.invoiceNo||d.invoiceNumber||'',d.invoiceDate||'',d.supplierName||''].join('|');if(!Array.isArray(d.lines))continue;for(const line of d.lines){const m=meta[`${dk}|${line.lineNo||''}|${line.supplierItemCode||''}`];if(!m)continue;line.category=m.category||line.category||'';line.subcategory=m.subcategory||line.subcategory||'';line.unit=m.unit||line.unit||'';line.packaging=m.packaging||line.packaging||'';if(m.vatRate!==undefined&&m.vatRate!=='')line.vatRate=Number(m.vatRate)}}
    localStorage.setItem(KEY,JSON.stringify(state));
  }
  const obs=new MutationObserver(scan);obs.observe(document.documentElement,{subtree:true,childList:true});scan();
  document.addEventListener('click',e=>{if(!e.target.closest('#saveDraft,#learn'))return;captureVisible();setTimeout(mergeIntoMainState,180)},true);
}

