const queueState={files:[],active:null};

function fileInputFor(modal,file){
  if(!modal||!file)return null;
  return file.type==='application/pdf'?modal.querySelector('[data-pdf-file]'):modal.querySelector('[data-image-file]');
}

function setSingleFile(input,file){
  if(!input||!file)return false;
  const dt=new DataTransfer();
  dt.items.add(file);
  input.files=dt.files;
  input.dataset.multiQueueBypass='1';
  input.dispatchEvent(new Event('change',{bubbles:true}));
  delete input.dataset.multiQueueBypass;
  return true;
}

function queueHost(modal){
  let host=modal.querySelector('[data-invoice-multi-queue]');
  if(host)return host;
  const status=modal.querySelector('[data-invoice-status]');
  const panel=status?.parentElement;
  if(!panel)return null;
  host=document.createElement('div');
  host.dataset.invoiceMultiQueue='1';
  host.style.cssText='margin-top:8px;padding:9px 10px;border:1px solid #b7cfe0;border-radius:8px;background:#fff;color:#143f61;font-size:12px';
  status.after(host);
  return host;
}

function renderQueue(modal){
  const host=queueHost(modal);if(!host)return;
  const pending=queueState.files.length;
  const active=queueState.active;
  if(!active&&!pending){host.hidden=true;host.innerHTML='';return}
  host.hidden=false;
  const pendingNames=queueState.files.slice(0,5).map((f,i)=>`<div style="display:flex;gap:6px;align-items:center"><span>${i+1}.</span><b style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${String(f.name||'αρχείο')}</b></div>`).join('');
  host.innerHTML=`<div style="font-weight:900;margin-bottom:4px">📚 Πολλαπλά τιμολόγια</div>${active?`<div>Τρέχον: <b>${String(active.name||'αρχείο')}</b></div>`:''}<div style="margin-top:3px">Σε αναμονή: <b>${pending}</b></div>${pendingNames?`<div style="margin-top:5px;display:grid;gap:2px">${pendingNames}</div>`:''}${pending?'<div style="margin-top:6px;color:#64748b">Κάθε αρχείο παραμένει ξεχωριστό τιμολόγιο. Μετά τη δημιουργία του τρέχοντος, άνοιξε «Νέα παραγγελία» και θα φορτωθεί αυτόματα το επόμενο.</div>':''}`;
}

function feedNext(modal){
  if(!modal||!queueState.files.length)return false;
  const inputReady=modal.querySelector('[data-pdf-file]')&&modal.querySelector('[data-image-file]');
  if(!inputReady)return false;
  const file=queueState.files.shift();
  queueState.active=file;
  renderQueue(modal);
  return setSingleFile(fileInputFor(modal,file),file);
}

function rememberSelection(modal,input){
  input.multiple=true;
  if(input.dataset.multiInvoiceInstalled)return;
  input.dataset.multiInvoiceInstalled='1';
  input.addEventListener('change',event=>{
    if(input.dataset.multiQueueBypass==='1')return;
    const files=[...(event.target.files||[])];
    if(files.length<=1){if(files[0])queueState.active=files[0];renderQueue(modal);return}
    event.stopImmediatePropagation();
    queueState.active=files[0];
    queueState.files.push(...files.slice(1));
    renderQueue(modal);
    setSingleFile(input,files[0]);
  },true);
}

function install(modal){
  if(!modal)return false;
  const form=modal.querySelector('form[data-new-order]');
  const pdf=modal.querySelector('[data-pdf-file]');
  const image=modal.querySelector('[data-image-file]');
  const status=modal.querySelector('[data-invoice-status]');
  if(!form||!pdf||!image||!status)return false;

  rememberSelection(modal,pdf);
  rememberSelection(modal,image);
  modal.dataset.multiInvoiceQueueInstalled='1';
  renderQueue(modal);

  if(!queueState.active&&queueState.files.length)setTimeout(()=>feedNext(modal),120);

  const create=modal.querySelector('[data-create-invoice]');
  if(create&&!create.dataset.multiQueueInstalled){
    create.dataset.multiQueueInstalled='1';
    create.addEventListener('click',()=>{
      const current=queueState.active;
      if(!current)return;
      setTimeout(()=>{
        if(!document.documentElement.contains(modal))queueState.active=null;
      },900);
    },true);
  }
  return true;
}

function scan(){
  document.querySelectorAll('.po-modal').forEach(modal=>{
    const title=modal.querySelector('.po-modal-title h2')?.textContent||'';
    if(/Νέα παραγγελία/i.test(title))install(modal);
  });
}

let scheduled=false;
function scheduleScan(){
  if(scheduled)return;
  scheduled=true;
  requestAnimationFrame(()=>{scheduled=false;scan();});
}

new MutationObserver(()=>{
  scheduleScan();
  const modal=[...document.querySelectorAll('.po-modal')].find(m=>/Νέα παραγγελία/i.test(m.querySelector('.po-modal-title h2')?.textContent||''));
  if(modal&&!queueState.active&&queueState.files.length)setTimeout(()=>feedNext(modal),180);
}).observe(document.documentElement,{childList:true,subtree:true});
scan();
