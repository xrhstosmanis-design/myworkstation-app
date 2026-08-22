const PATH='/platform-admin/invoice-learning-lab';
if(window.location.pathname.replace(/\/+$/,'')===PATH){
  const KEY='mws_invoice_learning_lab_v1';
  const META_KEY='mws_invoice_learning_taxonomy_v1';
  const parse=(v,f)=>{try{return JSON.parse(v||'')||f}catch{return f}};
  let meta=parse(localStorage.getItem(META_KEY),{});
  const saveMeta=()=>localStorage.setItem(META_KEY,JSON.stringify(meta));
  const docKey=()=>{
    const s=(id)=>document.querySelector(id)?.value?.trim()||'';
    return [s('#supplierTaxId'),s('#invoiceNo'),s('#invoiceDate'),s('#supplierName')].join('|')||'CURRENT';
  };
  const rowKey=(tr)=>`${docKey()}|${tr.querySelector('td')?.textContent?.trim()||''}|${tr.querySelector('[data-k="supplierItemCode"]')?.value?.trim()||''}`;
  const valuesFor=tr=>meta[rowKey(tr)]||{};
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));
  const unitOptions=['PCS','PACK','BOX','GR','KG','ML','LT'];
  const vatOptions=['','0','6','13','24'];

  function ensureHeader(){
    const head=document.querySelector('#review thead tr');if(!head||head.dataset.taxonomyReady)return;
    const status=head.lastElementChild;
    for(const text of ['Κατηγορία','Υποκατηγορία','Μονάδα','Συσκευασία']){
      const th=document.createElement('th');th.textContent=text;head.insertBefore(th,status);
    }
    head.dataset.taxonomyReady='1';
  }

  function enrichRow(tr){
    if(tr.dataset.taxonomyReady)return;
    const statusTd=tr.lastElementChild;if(!statusTd)return;
    const v=valuesFor(tr);
    const defs=[
      ['category',`<input data-tax="category" placeholder="Κατηγορία" value="${esc(v.category||'')}">`],
      ['subcategory',`<input data-tax="subcategory" placeholder="Υποκατηγορία" value="${esc(v.subcategory||'')}">`],
      ['unit',`<select data-tax="unit">${unitOptions.map(x=>`<option ${String(v.unit||'')===x?'selected':''}>${x}</option>`).join('')}</select>`],
      ['packaging',`<input data-tax="packaging" placeholder="π.χ. 12 x 500ML" value="${esc(v.packaging||'')}">`]
    ];
    for(const [,html] of defs){const td=document.createElement('td');td.innerHTML=html;tr.insertBefore(td,statusTd)}
    const vat=tr.querySelector('[data-k="vatRate"]');
    if(vat&&vat.tagName==='INPUT'&&!vat.dataset.taxonomyVat){
      const select=document.createElement('select');select.dataset.k='vatRate';select.dataset.taxonomyVat='1';
      const current=String(vat.value||v.vatRate||'');select.innerHTML=vatOptions.map(x=>`<option value="${x}" ${current===x?'selected':''}>${x?x+'%':'—'}</option>`).join('');vat.replaceWith(select);
    }
    tr.querySelectorAll('[data-tax]').forEach(el=>el.addEventListener('change',()=>{
      const key=rowKey(tr);const cur=meta[key]||{};cur[el.dataset.tax]=el.value;cur.vatRate=tr.querySelector('[data-k="vatRate"]')?.value||'';meta[key]=cur;saveMeta();
    }));
    tr.querySelector('[data-k="vatRate"]')?.addEventListener('change',()=>{
      const key=rowKey(tr);meta[key]={...(meta[key]||{}),vatRate:tr.querySelector('[data-k="vatRate"]')?.value||''};saveMeta();
    });
    tr.dataset.taxonomyReady='1';
  }

  function scan(){ensureHeader();document.querySelectorAll('#lines tr').forEach(enrichRow)}

  function mergeIntoMainState(){
    const state=parse(localStorage.getItem(KEY),{documents:[],profiles:{},master:[]});
    const docs=Array.isArray(state.documents)?state.documents:[];
    for(const d of docs){
      const dk=[d.supplierTaxId||'',d.invoiceNumber||'',d.invoiceDate||'',d.supplierName||''].join('|');
      if(!Array.isArray(d.lines))continue;
      for(const line of d.lines){
        const prefix=`${dk}|${line.lineNo||''}|${line.supplierItemCode||''}`;
        const m=meta[prefix];if(!m)continue;
        line.category=m.category||line.category||'';
        line.subcategory=m.subcategory||line.subcategory||'';
        line.unit=m.unit||line.unit||'';
        line.packaging=m.packaging||line.packaging||'';
        if(m.vatRate!==undefined&&m.vatRate!=='')line.vatRate=Number(m.vatRate);
      }
    }
    localStorage.setItem(KEY,JSON.stringify(state));
  }

  const obs=new MutationObserver(scan);obs.observe(document.documentElement,{subtree:true,childList:true});scan();
  document.addEventListener('click',e=>{
    const b=e.target.closest('#saveDraft,#learn');if(!b)return;
    document.querySelectorAll('#lines tr').forEach(tr=>{
      const key=rowKey(tr),cur=meta[key]||{};
      tr.querySelectorAll('[data-tax]').forEach(el=>cur[el.dataset.tax]=el.value);
      cur.vatRate=tr.querySelector('[data-k="vatRate"]')?.value||'';meta[key]=cur;
    });saveMeta();setTimeout(mergeIntoMainState,120);
  },true);
}
