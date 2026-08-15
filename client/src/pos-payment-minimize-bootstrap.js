const state={overlay:null,display:null,pill:null,header:null,minButton:null,watcher:null};

function findPaymentOverlay(){
  const nodes=[...document.querySelectorAll('h1,h2,h3,div,span')].filter(el=>String(el.textContent||'').trim()==='Πληρωμές');
  for(const title of nodes){
    let node=title;
    while(node&&node!==document.body){
      const style=getComputedStyle(node);
      const text=String(node.textContent||'');
      if((style.position==='fixed'||style.position==='absolute')&&text.includes('Πληρωμή προμηθευτή')&&text.includes('Λοιπά έξοδα'))return node;
      node=node.parentElement;
    }
  }
  return null;
}

function paymentHeader(overlay){
  const candidates=[...overlay.querySelectorAll('div,header,section')];
  return candidates.find(el=>String(el.textContent||'').includes('Πληρωμές')&&el.querySelector('button'))||overlay.firstElementChild||overlay;
}

function ensurePill(){
  if(state.pill?.isConnected)return state.pill;
  const pill=document.createElement('button');
  pill.type='button';
  pill.dataset.mwsPaymentRestore='1';
  pill.style.cssText='position:fixed;right:20px;bottom:20px;z-index:2147483647;border:0;border-radius:999px;padding:13px 18px;background:#0b5d46;color:#fff;font-weight:900;font-size:16px;box-shadow:0 10px 30px rgba(0,0,0,.28);cursor:pointer;display:none';
  pill.textContent='💳 Πληρωμή σε εξέλιξη';
  pill.addEventListener('click',restorePayment);
  document.body.appendChild(pill);state.pill=pill;return pill;
}

function statusLabel(){
  if(!state.overlay)return '💳 Πληρωμή σε εξέλιξη';
  const text=String(state.overlay.textContent||'');
  if(/AI_COMPLETE|έτοιμ|ολοκληρώθ|Καταχώριση τιμολογίου για έλεγχο/i.test(text))return '✅ Η πληρωμή είναι έτοιμη';
  if(/Αυτόματος επανέλεγχος με AI|Διαβάζω|OCR|AI/i.test(text))return '⏳ Τιμολόγιο σε επεξεργασία';
  return '💳 Πληρωμή σε εξέλιξη';
}

function refreshPill(){if(state.pill)state.pill.textContent=statusLabel()}

function minimizePayment(){
  const overlay=state.overlay||findPaymentOverlay();if(!overlay)return;
  state.overlay=overlay;state.display=overlay.style.display;
  overlay.style.setProperty('display','none','important');
  const pill=ensurePill();pill.style.display='block';refreshPill();
}

function restorePayment(){
  if(!state.overlay?.isConnected){state.pill&&(state.pill.style.display='none');state.overlay=null;return}
  state.overlay.style.removeProperty('display');
  if(state.display)state.overlay.style.display=state.display;
  if(state.pill)state.pill.style.display='none';
}

function install(overlay){
  if(!overlay||overlay.dataset.mwsPaymentMinimize==='1')return;
  overlay.dataset.mwsPaymentMinimize='1';state.overlay=overlay;
  const header=paymentHeader(overlay);state.header=header;
  const btn=document.createElement('button');btn.type='button';btn.dataset.mwsPaymentMinimize='1';btn.title='Ελαχιστοποίηση πληρωμής';btn.textContent='—';
  btn.style.cssText='margin-left:8px;min-width:48px;height:48px;border:0;border-radius:12px;background:rgba(255,255,255,.14);color:#fff;font-size:28px;font-weight:900;cursor:pointer';
  btn.addEventListener('click',e=>{e.preventDefault();e.stopPropagation();minimizePayment()});
  const close=[...header.querySelectorAll('button')].find(b=>/×|✕|κλεί/i.test(String(b.textContent||''))||/close/i.test(b.getAttribute('aria-label')||''));
  if(close)close.parentElement?.insertBefore(btn,close);else header.appendChild(btn);state.minButton=btn;
  state.watcher?.disconnect();state.watcher=new MutationObserver(refreshPill);state.watcher.observe(overlay,{subtree:true,childList:true,characterData:true,attributes:true});
}

const observer=new MutationObserver(()=>{const overlay=findPaymentOverlay();if(overlay)install(overlay);if(state.overlay&&!state.overlay.isConnected){state.pill&&(state.pill.style.display='none');state.overlay=null}});
observer.observe(document.documentElement,{subtree:true,childList:true});
setInterval(()=>{const overlay=findPaymentOverlay();if(overlay)install(overlay);refreshPill()},1000);
