const state={overlay:null,pill:null,header:null,minButton:null,watcher:null,minimized:false,overlayStyles:null,blockers:[],lastStatus:'💳 Πληρωμή σε εξέλιξη'};

const exactText=(el,text)=>String(el?.textContent||'').replace(/\s+/g,' ').trim()===text;
const rectCoversViewport=el=>{const r=el.getBoundingClientRect();return r.width>=window.innerWidth*.72&&r.height>=window.innerHeight*.72};
const isPosRootLike=el=>{const t=String(el?.textContent||'');return el?.id==='root'||t.includes('OPERATOR POS')||t.includes('Νέα συναλλαγή')||t.includes('Barcode, SKU')};

function commonAncestor(a,b){if(!a||!b)return null;const parents=new Set();let n=a;while(n&&n!==document.body){parents.add(n);n=n.parentElement}n=b;while(n&&n!==document.body){if(parents.has(n))return n;n=n.parentElement}return null}

function findPaymentOverlay(){
  const titles=[...document.querySelectorAll('h1,h2,h3,h4,div,span')].filter(el=>exactText(el,'Πληρωμές'));
  for(const title of titles){
    let supplierText=null,probe=title.parentElement;
    for(let i=0;i<8&&probe&&!supplierText;i++,probe=probe.parentElement){supplierText=[...probe.querySelectorAll('button,div,span')].find(el=>exactText(el,'Πληρωμή προμηθευτή'))||null}
    if(!supplierText)continue;
    let root=commonAncestor(title,supplierText);if(!root)continue;
    let best=root;
    for(let i=0;i<7&&best.parentElement&&best.parentElement!==document.body;i++){
      const parent=best.parentElement,txt=String(parent.textContent||'');
      if(parent.id==='root'||isPosRootLike(parent)||!txt.includes('Πληρωμές')||!txt.includes('Πληρωμή προμηθευτή')||!txt.includes('Λοιπά έξοδα'))break;
      best=parent;
    }
    if(best&&best!==document.body&&best.id!=='root')return best;
  }
  return null;
}

function paymentHeader(overlay){
  const title=[...overlay.querySelectorAll('h1,h2,h3,h4,div,span')].find(el=>exactText(el,'Πληρωμές'));
  if(!title)return overlay.firstElementChild||overlay;
  let node=title.parentElement;
  for(let i=0;i<5&&node;i++){if(node.querySelector('button')&&node.getBoundingClientRect().height<190)return node;node=node.parentElement}
  return title.parentElement||overlay;
}

function ensurePill(){
  if(state.pill?.isConnected)return state.pill;
  const pill=document.createElement('button');pill.type='button';pill.dataset.mwsPaymentRestore='1';
  pill.style.cssText='position:fixed;right:20px;bottom:20px;z-index:2147483647;border:0;border-radius:999px;padding:13px 18px;background:#0b5d46;color:#fff;font-weight:900;font-size:16px;box-shadow:0 10px 30px rgba(0,0,0,.28);cursor:pointer;display:none';
  pill.textContent=state.lastStatus;pill.addEventListener('click',restorePayment);document.body.appendChild(pill);state.pill=pill;return pill;
}

function statusLabel(){
  const overlay=state.overlay?.isConnected?state.overlay:findPaymentOverlay();
  if(!overlay)return state.lastStatus||'💳 Πληρωμή σε εξέλιξη';
  const panel=overlay.querySelector('.pos-invoice-scan-v2');
  if(!panel)return '💳 Πληρωμή σε εξέλιξη';
  const submit=panel.querySelector('.mws-submit-invoice');
  const status=String(panel.querySelector('.mws-invoice-status')?.textContent||'');
  const file=panel.querySelector('.mws-invoice-file');
  if(/Αυτόματος επανέλεγχος|επανέλεγχος με AI|Διαβάζω|επεξεργασία|OCR.*(?:<|κάτω)|AI.*(?:έλεγχ|αναλύ)/i.test(status))return '⏳ Τιμολόγιο σε επεξεργασία';
  if(submit&&!submit.disabled)return '✅ Η πληρωμή είναι έτοιμη';
  if(file?.files?.length||status.trim())return '💳 Πληρωμή σε αναμονή';
  return '💳 Πληρωμή σε εξέλιξη';
}
function refreshPill(){state.lastStatus=statusLabel();if(state.pill)state.pill.textContent=state.lastStatus}

function collectBlockers(overlay){
  const found=[];
  let node=overlay.parentElement;
  while(node&&node!==document.body&&node.id!=='root'){
    const s=getComputedStyle(node);
    if((s.position==='fixed'||s.position==='absolute')&&rectCoversViewport(node)&&!isPosRootLike(node))found.push(node);
    node=node.parentElement;
  }
  for(const el of document.querySelectorAll('body > div, #root > div')){
    if(el===overlay||el.contains(overlay)||overlay.contains(el)||el.id==='root'||isPosRootLike(el))continue;
    const s=getComputedStyle(el),txt=String(el.textContent||'').trim();
    if(s.position==='fixed'&&rectCoversViewport(el)&&txt.length<120)found.push(el);
  }
  return [...new Set(found)];
}

function minimizePayment(){
  const overlay=state.overlay?.isConnected?state.overlay:findPaymentOverlay();if(!overlay)return;
  state.overlay=overlay;state.minimized=true;
  state.overlayStyles={visibility:overlay.style.visibility,pointerEvents:overlay.style.pointerEvents,opacity:overlay.style.opacity};
  overlay.style.setProperty('visibility','hidden','important');
  overlay.style.setProperty('pointer-events','none','important');
  overlay.style.setProperty('opacity','0','important');
  state.blockers=collectBlockers(overlay).map(el=>({el,background:el.style.background,backgroundColor:el.style.backgroundColor,backdropFilter:el.style.backdropFilter,pointerEvents:el.style.pointerEvents,opacity:el.style.opacity}));
  for(const b of state.blockers){
    b.el.style.setProperty('background','transparent','important');
    b.el.style.setProperty('background-color','transparent','important');
    b.el.style.setProperty('backdrop-filter','none','important');
    b.el.style.setProperty('pointer-events','none','important');
  }
  document.documentElement.style.removeProperty('overflow');document.body.style.removeProperty('overflow');
  const pill=ensurePill();pill.style.display='block';refreshPill();
}

function restoreStyles(){
  for(const b of state.blockers){if(!b.el?.isConnected)continue;b.el.style.background=b.background;b.el.style.backgroundColor=b.backgroundColor;b.el.style.backdropFilter=b.backdropFilter;b.el.style.pointerEvents=b.pointerEvents;b.el.style.opacity=b.opacity}
  state.blockers=[];
}

function restorePayment(){
  let overlay=state.overlay?.isConnected?state.overlay:findPaymentOverlay();
  restoreStyles();state.minimized=false;
  if(!overlay){if(state.pill)state.pill.style.display='none';state.overlay=null;return}
  state.overlay=overlay;
  overlay.style.removeProperty('visibility');overlay.style.removeProperty('pointer-events');overlay.style.removeProperty('opacity');
  if(state.overlayStyles){overlay.style.visibility=state.overlayStyles.visibility;overlay.style.pointerEvents=state.overlayStyles.pointerEvents;overlay.style.opacity=state.overlayStyles.opacity}
  if(state.pill)state.pill.style.display='none';
  window.dispatchEvent(new CustomEvent('mws-payment-restored'));
  setTimeout(()=>window.dispatchEvent(new CustomEvent('mws-payment-restored')),120);
  setTimeout(()=>window.dispatchEvent(new CustomEvent('mws-payment-restored')),450);
  overlay.scrollIntoView?.({block:'center',inline:'center'});
}

function install(overlay){
  if(!overlay)return;
  if(!state.minimized)state.overlay=overlay;
  const header=paymentHeader(overlay);state.header=header;
  if(!overlay.querySelector('[data-mws-payment-minimize-button="1"]')){
    const btn=document.createElement('button');btn.type='button';btn.dataset.mwsPaymentMinimizeButton='1';btn.title='Ελαχιστοποίηση πληρωμής';btn.setAttribute('aria-label','Ελαχιστοποίηση πληρωμής');btn.textContent='—';
    btn.style.cssText='min-width:50px;width:50px;height:50px;border:0;border-radius:12px;background:rgba(255,255,255,.16);color:#fff;font-size:30px;line-height:1;font-weight:900;cursor:pointer;margin-right:8px';
    btn.addEventListener('click',e=>{e.preventDefault();e.stopPropagation();minimizePayment()});
    const close=[...overlay.querySelectorAll('button')].find(b=>/×|✕|✖/.test(String(b.textContent||''))||/close|κλείσιμο/i.test(b.getAttribute('aria-label')||''));
    if(close){const host=close.parentElement||header;host.insertBefore(btn,close)}else header.appendChild(btn);state.minButton=btn;
  }
  if(overlay.dataset.mwsPaymentMinimize!=='1'){
    overlay.dataset.mwsPaymentMinimize='1';state.watcher?.disconnect();state.watcher=new MutationObserver(refreshPill);state.watcher.observe(overlay,{subtree:true,childList:true,characterData:true,attributes:true});
  }
}

function scan(){
  const overlay=findPaymentOverlay();if(overlay)install(overlay);
  if(state.minimized&&state.overlay&&!state.overlay.isConnected&&overlay)state.overlay=overlay;
}
new MutationObserver(scan).observe(document.documentElement,{subtree:true,childList:true});
setInterval(()=>{scan();refreshPill()},500);scan();
