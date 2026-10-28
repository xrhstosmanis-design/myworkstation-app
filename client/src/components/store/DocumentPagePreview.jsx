import React,{useEffect,useState} from "react";
const previewCss=`.document-page-preview{flex:0 0 100%;min-width:0;max-width:100%;margin-top:4px}
.document-page-preview>button,.document-page-preview__controls button{min-height:48px;min-width:48px;padding:8px 12px;border:1px solid #8bbcac;border-radius:8px;background:#fff;color:#124c3d;font:inherit;font-weight:700;cursor:pointer}
.document-page-preview>button{width:100%}
.document-page-preview button:disabled{opacity:.5;cursor:default}
.document-page-preview button:focus-visible,.document-page-preview__viewport:focus-visible{outline:3px solid #007c58;outline-offset:2px}
.document-page-preview__body{min-width:0;padding-top:8px}
.document-page-preview__controls{display:flex;flex-wrap:wrap;align-items:center;gap:6px;margin-bottom:8px}
.document-page-preview__controls output{min-width:48px;text-align:center}
.document-page-preview__viewport{max-height:65vh;max-width:100%;overflow:auto;overscroll-behavior:contain;background:#e6eeea;border:1px solid #8bbcac;border-radius:6px}
.document-page-preview__viewport img{display:block;max-width:none!important;height:auto!important;object-fit:contain;margin:0}
`;

// Inspect only bytes already retained by this form. Never fetch a URL or reread a file.
export default function DocumentPagePreview({page,index=0,scopeKey}){
  const source=page?.originalDataUrl||page?.dataUrl||"";
  const supported=typeof source==="string"&&/^data:image\/(?:jpeg|png|webp|gif|bmp);base64,/i.test(source);
  const [view,setView]=useState(null);
  useEffect(()=>{setView(null)},[source,scopeKey]);
  const open=supported&&view?.source===source&&view?.scopeKey===scopeKey;
  const zoom=open?view.zoom:1;
  const changeZoom=next=>setView(current=>current&&({...current,zoom:Math.max(.5,Math.min(4,next))}));
  if(!supported)return null;
  return <section className="document-page-preview" aria-label={`Προεπισκόπηση σελίδας ${index+1}`}>
    <style>{previewCss}</style>
    <button type="button" aria-expanded={Boolean(open)} onClick={()=>setView(open?null:{source,scopeKey,zoom:1,failed:false})}>
      {open?"Κλείσιμο προεπισκόπησης":`Προεπισκόπηση σελίδας ${index+1}`}
    </button>
    {open&&<div className="document-page-preview__body">
      <div className="document-page-preview__controls" role="group" aria-label="Μεγέθυνση εικόνας">
        <button type="button" aria-label="Σμίκρυνση εικόνας" disabled={zoom<=.5} onClick={()=>changeZoom(zoom-.5)}>−</button>
        <output aria-live="polite">{Math.round(zoom*100)}%</output>
        <button type="button" aria-label="Μεγέθυνση εικόνας" disabled={zoom>=4} onClick={()=>changeZoom(zoom+.5)}>+</button>
        <button type="button" onClick={()=>changeZoom(1)}>Προσαρμογή πλάτους</button>
      </div>
      {view.failed?<p role="alert">Δεν προβλήθηκε η εικόνα. Το επιλεγμένο αρχείο παραμένει στη φόρμα.</p>:<div className="document-page-preview__viewport" tabIndex={0} role="region" aria-label={`Πρωτότυπη εικόνα σελίδας ${index+1}. Κύλιση για ολόκληρη τη σελίδα.`}>
        <img src={source} alt={`Πρωτότυπη σελίδα ${index+1}`} style={{width:`${zoom*100}%`}} onError={()=>setView(current=>current?.source===source&&current?.scopeKey===scopeKey?{...current,failed:true}:current)}/>
      </div>}
    </div>}
  </section>;
}
