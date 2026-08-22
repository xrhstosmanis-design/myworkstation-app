const PATH='/platform-admin/invoice-learning-lab';
if(window.location.pathname.replace(/\/+$/,'')===PATH){
  const KEY='mws_invoice_learning_lab_v1';
  const META_KEY='mws_invoice_learning_taxonomy_v1';
  const parse=(v,f)=>{try{return JSON.parse(v||'')||f}catch{return f}};
  let meta=parse(localStorage.getItem(META_KEY),{});
  const saveMeta=()=>localStorage.setItem(META_KEY,JSON.stringify(meta));
  const docParts=()=>{
    const s=(id)=>document.querySelector(id)?.value?.trim()||'';
    return [s('#supplierTaxId'),s('#invoiceNo'),s('#invoiceDate'),s('#supplierName')];
  };
  const docKey=()=>docParts().join('|')||'CURRENT';
  const lineNo=tr=>tr.querySelector('td')?.textContent?.trim()||'';
  const supplierCode=tr=>tr.querySelector('[data-k="supplierItemCode"]')?.value?.trim()||'';
  const rowKey=tr=>`${docKey()}|${lineNo(tr)}|${supplierCode(tr)}`;
  const savedLineFor=tr=>{
    const state=parse(localStorage.getItem(KEY),{documents:[]});
    const parts=docParts();
    const docs=Array.isArray(state.documents)?state.documents:[];
    const d=docs.find(x=>[x.supplierTaxId||'',x.invoiceNumber||'',x.invoiceDate||'',x.supplierName||''].join('|')===parts.join('|'));
    return d?.lines?.find(x=>String(x.lineNo||'')===lineNo(tr)&&String(x.supplierItemCode||'')===supplierCode(tr))||null;
  };
  const valuesFor=tr=>{
    const line=savedLineFor(tr)||{};
    return {...line,...(meta[rowKey(tr)]||{})};
  };
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot',"'":'&#039;'}[c]));
  const unitOptions=['','PCS','PACK','BOX','GR','KG','ML','LT'];
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
      `<input data-tax="category" placeholder="Κατηγορία" value="${esc(v.category||'')}">`,
      `<input data-tax="subcategory" placeholder="Υποκατηγορία" value="${esc(v.subcategory||'')}">`,
      `<select data-tax="unit">${unitOptions.map(x=>`<option value="${x}" ${String(v.unit||'')===x?'selected':''}>${x||'—'}</option>`).join('')}</select>`,
      `<input data-tax="packaging" placeholder="π.χ. 12 x 500ML" value="${esc(v.packaging||'')}">`
    ];
    for(const html of defs){const td=document.createElement('td');td.innerHTML=html;tr.insertBefore(td,statusTd)}
    const vat=tr.querySelector('[data-k="vatRate"]');
    if(vat&&vat.tagName==='INPUT'&&!vat.dataset.taxonomyVat){
      const select=document.createElement('select');select.dataset.k='vatRate';select.dataset.taxonomyVat='1';
      const current=String(vat.value||v.vatRate||'');select.innerHTML=vatOptions.map(x=>`<option value="${x}" ${current===x?'selected':''}>${x?x+'%':'—'}</option>`).join('');vat.replaceWith(select);
    }
    tr.querySelectorAll('[data-tax]').forEach(el=>el.addEventListener('change',()=>{
      const key=rowKey(tr),cur=meta[key]||{};cur[el.dataset.tax]=el.value;cur.vatRate=tr.querySelector('[data-k="vatRate"]')?.value||'';meta[key]=cur;saveMeta();
    }));
    tr.querySelector('[data-k="vatRate"]')?.addEventListener('change',()=>{
      const key=rowKey(tr);meta[key]={...(meta[key]||{}),vatRate:tr.querySelector('[data-k="vatRate"]')?.value||''};saveMeta();
    });
    tr.dataset.taxonomyReady='1';
  }

  function scan(){ensureHeader();document.querySelectorAll('#lines tr').forEach(enrichRow)}

  function captureVisible(){
    document.querySelectorAll('#lines tr').forEach(tr=>{
      const key=rowKey(tr),cur=meta[key]||{};
      tr.querySelectorAll('[data-tax]').forEach(el=>cur[el.dataset.tax]=el.value);
      cur.vatRate=tr.querySelector('[data-k="vatRate"]')?.value||'';meta[key]=cur;
    });saveMeta();
  }

  function mergeIntoMainState(){
    const state=parse(localStorage.getItem(KEY),{documents:[],profiles:{},master:[]});
    const docs=Array.isArray(state.documents)?state.documents:[];
    for(const d of docs){
      const dk=[d.supplierTaxId||'',d.invoiceNumber||'',d.invoiceDate||'',d.supplierName||''].join('|');
      if(!Array.isArray(d.lines))continue;
      for(const line of d.lines){
        const m=meta[`${dk}|${line.lineNo||''}|${line.supplierItemCode||''}`];if(!m)continue;
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
    if(!e.target.closest('#saveDraft,#learn'))return;
    captureVisible();setTimeout(mergeIntoMainState,180);
  },true);
}
