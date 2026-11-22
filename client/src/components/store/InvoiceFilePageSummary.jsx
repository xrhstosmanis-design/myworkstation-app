import React,{useEffect,useRef,useState} from "react";
import {countInvoicePdfPages,invoiceFileSource,invoiceFileKind,sameInvoiceFileSources,
  invoiceFileCountLabel,invoiceFileCountModel} from "../../lib/invoice-file-page-count.js";

// Independent of FAST reading and settlement. A page count is NOT OCR coverage.
export default function InvoiceFilePageSummary({pages=[],scopeKey}){
  const incoming=pages.map(invoiceFileSource),stable=useRef(incoming);
  if(!sameInvoiceFileSources(stable.current,incoming))stable.current=incoming;
  const sources=stable.current;
  const [snapshot,setSnapshot]=useState(null);
  useEffect(()=>{
    let active=true;
    const controller=new AbortController(),counts=sources.map(source=>invoiceFileKind(source)==="pdf"?undefined:null);
    setSnapshot({scopeKey,sources,counts:[...counts]});
    // Count sequentially to bound worker usage; do not await this from OCR.
    void (async()=>{
      for(let index=0;index<sources.length;index++){
        if(!active)break;
        if(invoiceFileKind(sources[index])!=="pdf")continue;
        counts[index]=await countInvoicePdfPages(sources[index],{signal:controller.signal});
        if(active)setSnapshot({scopeKey,sources,counts:[...counts]});
      }
    })();
    return()=>{active=false;controller.abort()};
  },[scopeKey,sources]);
  // Hide obsolete counts during render, before effect cleanup can run.
  const current=snapshot?.scopeKey===scopeKey&&snapshot?.sources===sources;
  const model=invoiceFileCountModel(sources,current?snapshot.counts:[]);
  if(!sources.length)return null;
  return <section className="invoice-file-page-summary" aria-label="Αρχεία και φυσικές σελίδες PDF"
    style={{padding:"8px 10px",margin:"8px 0",border:"1px solid #b7d8cc",borderRadius:8,overflowWrap:"anywhere"}}>
    <div role="status" aria-live="polite">
      <b>{invoiceFileCountLabel(model.fileCount)}</b>
      {model.pdfCount>0&&<span> · {model.pdfCount} PDF</span>}
      {model.imageCount>0&&<span> · {model.imageCount} {model.imageCount===1?"εικόνα":"εικόνες"}</span>}
      <ul style={{margin:"5px 0",paddingInlineStart:22}}>
        {model.files.map(file=><li key={file.index}>Αρχείο {file.index+1}: {file.kind==="image"?"εικόνα (δεν επιβεβαιώνει πλήθος φυσικών σελίδων)":file.kind!=="pdf"?"μη διαθέσιμος τύπος αρχείου":file.state==="counted"?`${file.pages} ${file.pages===1?"φυσική σελίδα PDF":"φυσικές σελίδες PDF"}`:file.state==="pending"?"καταμέτρηση σελίδων PDF…":"άγνωστο πλήθος σελίδων PDF — έλεγξε το πρωτότυπο"}</li>)}
      </ul>
    </div>
    <small>Η καταμέτρηση δεν επιβεβαιώνει πλήρη ανάγνωση OCR ή κάλυψη όλων των γραμμών.</small>
  </section>;
}
