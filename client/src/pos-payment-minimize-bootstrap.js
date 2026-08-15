const state={overlay:null,display:null,pill:null,header:null,minButton:null,watcher:null};

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
    const supplierText=[...document.querySelectorAll('button,div,span')].find(el=>exactText(el,'Πληρωμή προμηθευτή'));
    if(!supplierText)continue;
    let root=commonAncestor(title,supplierText);
    if(!root)continue;
    // Climb until the complete payment modal is included, but never use body/root app.
    let best=root;
    for(let i=0;i<6&&best.parentElement&&best.parentElement!==document.body;i++){
      const parent=best.parentElement,txt=String(parent.textContent||'');
      if(!txt.includes('Πληρωμές')||!txt.includes('Πληρωμή προμηθευτή')||!txt.includes('Λοιπά έξοδα'))break;
      if(parent.id==='root')break;
      best=parent;
      const rect=best.getBoundingClientRect();
      if(rect.width>500&&rect.height>350)break;
    }
    if(best&&best!==document.body&&best.id!=='root')return best;
  }
  return null;
}

function paymentHeader(overlay){
  const title=[...overlay.querySelectorAll('h1,h2,h3,h4,div,span')].find(el=>exactText(el,'Πληρωμές'));
  if(!title)return overlay.firstElementChild||overlay;
  let node=title.parentElement;
  for(let i=0;i<4&&node;i++){
    if(node.querySelector('button')&&node.getBoundingClientRect().height<180)return node;
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
function statusLabel(){if(!state.overlay)return'💳 Πληρωμή σε εξέλιξη';const text=String(state.overlay.textContent||'');if(/Η πληρωμή είναι έτοιμη|Καταχώριση τιμολογίου για έλεγχο/i.test(text))return'✅ Η πληρωμή είναι έτοιμη';if(/Αυτόματος επανέλεγχος με AI|Διαβάζω|OCR|AI/i.test(text))return'⏳ Τιμολόγιο σε επεξεργασία';return'💳 Πληρωμή σε εξέλιξη'}
function refreshPill(){if(state.pill)state.pill.textContent=statusLabel()}
function minimizePayment(){const overlay=state.overlay||findPaymentOverlay();if(!overlay)return;state.overlay=overlay;state.display=overlay.style.display;overlay.style.setProperty('display','none','important');const pill=ensurePill();pill.style.display='block';refreshPill()}
function restorePayment(){if(!state.overlay?.isConnected){if(state.pill)state.pill.style.display='none';state.overlay=null;return}state.overlay.style.removeProperty('display');if(state.display)state.overlay.style.display=state.display;if(state.pill)state.pill.style.display='none'}

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
function scan(){const overlay=findPaymentOverlay();if(overlay)install(overlay);if(state.overlay&&!state.overlay.isConnected){if(state.pill)state.pill.style.display='none';state.overlay=null}}
new MutationObserver(scan).observe(document.documentElement,{subtree:true,childList:true});setInterval(()=>{scan();refreshPill()},500);scan();
