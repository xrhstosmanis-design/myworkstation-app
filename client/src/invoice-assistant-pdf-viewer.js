import {getDocument,GlobalWorkerOptions} from "pdfjs-dist/build/pdf.mjs";
import workerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";

GlobalWorkerOptions.workerSrc=workerUrl;

// One physical page in the existing review pane, without a thumbnail sidebar.
export async function mountInvoicePdfViewer(host,dataUrl){
  host.innerHTML='<div style="display:flex;gap:6px;align-items:center;flex-wrap:wrap;padding:8px;background:#153e5a;color:white"><button type="button" data-prev aria-label="Προηγούμενη σελίδα">‹</button><span data-page></span><button type="button" data-next aria-label="Επόμενη σελίδα">›</button><button type="button" data-minus aria-label="Σμίκρυνση PDF">−</button><span data-zoom></span><button type="button" data-plus aria-label="Μεγέθυνση PDF">+</button><button type="button" data-fit>Προσαρμογή</button><button type="button" data-turn aria-label="Περιστροφή PDF">↻</button></div><div data-pdf-scroll style="height:68vh;overflow:auto;background:#dce5ea;touch-action:none"><canvas style="display:block;margin:8px auto;cursor:grab" aria-label="Πρωτότυπο τιμολογίου"></canvas></div><div data-pdf-status role="status"></div>';
  const canvas=host.querySelector('canvas'),viewport=host.querySelector('[data-pdf-scroll]'),status=host.querySelector('[data-pdf-status]');
  const raw=atob(String(dataUrl).split(',').pop()),bytes=Uint8Array.from(raw,ch=>ch.charCodeAt(0));
  const loading=getDocument({data:bytes});
  let document;
  try{document=await loading.promise}catch(error){await loading.destroy();throw error}
  let pageNumber=1,zoom=1,rotation=0,revision=0,disposed=false,renderTask=null,queue=Promise.resolve(),drag=null;
  const refresh=()=>{
    const requested=++revision;
    renderTask?.cancel();
    queue=queue.catch(()=>{}).then(async()=>{
      if(disposed||requested!==revision)return;
      status.textContent='';
      const page=await document.getPage(pageNumber);
      if(disposed||requested!==revision)return;
      const base=page.getViewport({scale:1,rotation:page.rotate+rotation});
      const scale=Math.max(100,viewport.clientWidth-20)/base.width*zoom;
      const view=page.getViewport({scale,rotation:page.rotate+rotation});
      canvas.width=Math.ceil(view.width);canvas.height=Math.ceil(view.height);
      canvas.style.width=`${view.width}px`;canvas.style.height=`${view.height}px`;
      host.querySelector('[data-page]').textContent=`${pageNumber} / ${document.numPages}`;
      host.querySelector('[data-zoom]').textContent=`${Math.round(zoom*100)}%`;
      host.querySelector('[data-prev]').disabled=pageNumber===1;
      host.querySelector('[data-next]').disabled=pageNumber===document.numPages;
      renderTask=page.render({canvasContext:canvas.getContext('2d'),viewport:view});
      try{await renderTask.promise}catch(error){if(error.name!=='RenderingCancelledException'&&!disposed)status.textContent='Η σελίδα PDF δεν εμφανίστηκε. Δοκίμασε Προσαρμογή.'}finally{renderTask=null}
    }).catch(()=>{if(!disposed)status.textContent='Η σελίδα PDF δεν εμφανίστηκε. Δοκίμασε Προσαρμογή.'});
  };
  host.querySelector('[data-prev]').onclick=()=>{if(pageNumber>1){pageNumber--;viewport.scrollTop=0;refresh()}};
  host.querySelector('[data-next]').onclick=()=>{if(pageNumber<document.numPages){pageNumber++;viewport.scrollTop=0;refresh()}};
  const changeZoom=delta=>{zoom=Math.min(4,Math.max(.5,zoom+delta));refresh()};
  host.querySelector('[data-minus]').onclick=()=>changeZoom(-.25);
  host.querySelector('[data-plus]').onclick=()=>changeZoom(.25);
  host.querySelector('[data-fit]').onclick=()=>{zoom=1;viewport.scrollLeft=0;viewport.scrollTop=0;refresh()};
  host.querySelector('[data-turn]').onclick=()=>{rotation=(rotation+90)%360;refresh()};
  viewport.addEventListener('wheel',event=>{event.preventDefault();changeZoom(event.deltaY<0?.15:-.15)},{passive:false});
  canvas.onpointerdown=event=>{if(event.button!==0)return;event.preventDefault();drag={id:event.pointerId,x:event.clientX,y:event.clientY,left:viewport.scrollLeft,top:viewport.scrollTop};canvas.setPointerCapture(event.pointerId);canvas.style.cursor='grabbing'};
  canvas.onpointermove=event=>{if(!drag||drag.id!==event.pointerId)return;viewport.scrollLeft=drag.left-event.clientX+drag.x;viewport.scrollTop=drag.top-event.clientY+drag.y};
  canvas.onpointerup=canvas.onpointercancel=event=>{drag=null;canvas.style.cursor='grab';if(canvas.hasPointerCapture(event.pointerId))canvas.releasePointerCapture(event.pointerId)};
  const observer=new ResizeObserver(refresh);observer.observe(viewport);refresh();
  return ()=>{disposed=true;observer.disconnect();renderTask?.cancel();void loading.destroy()};
}
