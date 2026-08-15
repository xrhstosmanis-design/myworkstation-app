const state={overlay:null,shell:null,shellDisplay:null,pill:null,header:null,minButton:null,watcher:null};

const exactText=(el,text)=>String(el?.textContent||'').replace(/\s+/g,' ').trim()===text;

function commonAncestor(a,b){
  if(!a||!b)return null;
  const parents=new Set();let n=a;
  while(n&&n!==document.body){parents.add(n);n=n.parentElement}
  n=b;while(n&&n!==document.body){if(parents.has(n))return n;n=n.parentElement}
  return null;
}

function findPaymentOverlay(){
  const titles=[...document.querySelectorAll('h1,h2,h3,h4,div,span')].filter(el=>exactText(el,'Πληρωμές'));
  for(const title of titles){
    let supplierText=null;
    let probe=title.parentElement;
    for(let i=0;i<8&&probe&&!supplierText;i++,probe=probe.parentElement){
      supplierText=[...probe.querySelectorAll('button,div,span')].find(el=>exactText(el,'Πληρωμή προμηθευτή'))||null;
    }
    if(!supplierText)continue;
    let root=commonAncestor(title,supplierText);if(!root)continue;
    let best=root;
    for(let i=0;i<8&&best.parentElement&&best.parentElement!==document.body;i++){
      const parent=best.parentElement,txt=String(parent.textContent||'');
      if(parent.id==='root'||!txt.includes('Πληρωμές')||!txt.includes('Πληρωμή προμηθευτή')||!txt.includes('Λοιπά έξοδα'))break;
      best=parent;
    }
    if(best&&best!==document.body&&best.id!=='root')return best;
  }
  return null;
}

function findModalShell(overlay){
  if(!overlay)return null;
  let node=overlay,best=overlay;
  while(node&&node!==document.body&&node.id!=='root'){
    const style=getComputedStyle(node),rect=node.getBoundingClientRect();
    const coversViewport=rect.width>=window.innerWidth*.78&&rect.height>=window.innerHeight*.78;
    const dialogLike=node.getAttribute('role')==='dialog'||node.getAttribute('aria-modal')==='true';
    const fixedLike=style.position==='fixed'&&coversViewport;
    if(dialogLike||fixedLike||/modal|overlay|backdrop/i.test(String(node.className||'')))best=node;
    node=node.parentElement;
  }
  return best;
}

function paymentHeader(overlay){
  const title=[...overlay.querySelectorAll('h1,h2,h3,h4,div,span')].find(el=>exactText(el,'Πληρωμές'));
  if(!title)return overlay.firstElementChild||overlay;
  let node=title.parentElement;
  for(let i=0;i<5&&node;i++){
    if(node.querySelector('button')&&node.getBoundingClientRect().height<190)return node;
    node=node.parentElement;
  }
  return title.parentElement||overlay;
}

function ensurePill(){
  if(state.pill?.isConnected)return state.pill;
  const pill=document.createElement('button');pill.type='button';pill.dataset.mwsPaymentRestore='1';
  pill.style.cssText='position:fixed;right:20px;bottom:20px;z-index:2147483647;border:0;border-radius:999px;padding:13px 18px;background:#0b5d46;color:#fff;font-weight:900;font-size:16px;box-shadow:0 10px 30px rgba(0,0,0,.28);cursor:pointer;display:none';
  pill.textContent='💳 Πληρωμή σε εξέλιξη';pill.addEventListener('click',restorePayment);document.body.appendChild(pill);state.pill=pill;return pill;
}

function statusLabel(){
  if(!state.overlay)return '💳 Πληρωμή σε εξέλιξη';
  const panel=state.overlay.querySelector('.pos-invoice-scan-v2');
  if(!panel)return '💳 Πληρωμή σε εξέλιξη';
  const submit=panel.querySelector('.mws-submit-invoice');
  const status=String(panel.querySelector('.mws-invoice-status')?.textContent||'');
  const file=panel.querySelector('.mws-invoice-file');
  if(/Αυτόματος επανέλεγχος|επανέλεγχος με AI|Διαβάζω|επεξεργασία|OCR.*(?:<|κάτω)|AI.*(?:έλεγχ|αναλύ)/i.test(status))return '⏳ Τιμολόγιο σε επεξεργασία';
  if(submit&&!submit.disabled)return '✅ Η πληρωμή είναι έτοιμη';
  if(file?.files?.length||status.trim())return '💳 Πληρωμή σε αναμονή';
  return '💳 Πληρωμή σε εξέλιξη';
}
function refreshPill(){if(state.pill)state.pill.textContent=statusLabel()}

function minimizePayment(){
  const overlay=state.overlay||findPaymentOverlay();if(!overlay)return;
  state.overlay=overlay;
  const shell=findModalShell(overlay);state.shell=shell;
  state.shellDisplay=shell.style.display;
  shell.style.setProperty('display','none','important');
  document.documentElement.style.removeProperty('overflow');
  document.body.style.removeProperty('overflow');
  const pill=ensurePill();pill.style.display='block';refreshPill();
}

function restorePayment(){
  const shell=state.shell;
  if(!state.overlay?.isConnected||!shell?.isConnected){if(state.pill)state.pill.style.display='none';state.overlay=null;state.shell=null;return}
  shell.style.removeProperty('display');
  if(state.shellDisplay)shell.style.display=state.shellDisplay;
  if(state.pill)state.pill.style.display='none';
}

function install(overlay){
  if(!overlay)return;
  state.overlay=overlay;const header=paymentHeader(overlay);state.header=header;
  if(!overlay.querySelector('[data-mws-payment-minimize-button="1"]')){
    const btn=document.createElement('button');btn.type='button';btn.dataset.mwsPaymentMinimizeButton='1';btn.title='Ελαχιστοποίηση πληρωμής';btn.setAttribute('aria-label','Ελαχιστοποίηση πληρωμής');btn.textContent='—';
    btn.style.cssText='min-width:50px;width:50px;height:50px;border:0;border-radius:12px;background:rgba(255,255,255,.16);color:#fff;font-size:30px;line-height:1;font-weight:900;cursor:pointer;margin-right:8px';
    btn.addEventListener('click',e=>{e.preventDefault();e.stopPropagation();minimizePayment()});
    const close=[...overlay.querySelectorAll('button')].find(b=>/×|✕|✖/.test(String(b.textContent||''))||/close|κλείσιμο/i.test(b.getAttribute('aria-label')||''));
    if(close){const host=close.parentElement||header;host.insertBefore(btn,close)}else header.appendChild(btn);
    state.minButton=btn;
  }
  if(overlay.dataset.mwsPaymentMinimize!=='1'){
    overlay.dataset.mwsPaymentMinimize='1';state.watcher?.disconnect();state.watcher=new MutationObserver(refreshPill);state.watcher.observe(overlay,{subtree:true,childList:true,characterData:true,attributes:true});
  }
}

function scan(){
  const overlay=findPaymentOverlay();if(overlay)install(overlay);
  if(state.overlay&&!state.overlay.isConnected){if(state.pill)state.pill.style.display='none';state.overlay=null;state.shell=null}
}
new MutationObserver(scan).observe(document.documentElement,{subtree:true,childList:true});
setInterval(()=>{scan();refreshPill()},500);scan();
