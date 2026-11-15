import React,{useEffect,useRef,useState} from "react";
import "./installation-support-profile.css";

import {installationSupportRows, installationSupportTitle} from "../../../../shared/installation-support-profile.mjs";

const guideSteps=[
  "Σημείωσε την ώρα, το τερματικό και τι ακριβώς συνέβη.",
  "Κατέγραψε το μήνυμα που εμφανίζεται, χωρίς κωδικούς, PIN ή άλλα μυστικά.",
  "Ενημέρωσε τον υπεύθυνο του καταστήματος και δώσε του τις πληροφορίες.",
  "Ακολούθησε τις οδηγίες του υπευθύνου ή του εξουσιοδοτημένου τεχνικού."
];

function printGuide(){
  let page;
  try{
    page=window.open("", "_blank");
    if(!page) return false;
    // Construct a new document from fixed text only: no application DOM or store data.
    page.opener=null;
    const doc=page.document;
    doc.title="Σε περίπτωση βλάβης";
    doc.documentElement.lang="el";
    const style=doc.createElement("style");
    style.textContent="@page{size:A4;margin:20mm}body{font-family:Arial,sans-serif;color:#111;font-size:14pt;line-height:1.5}h1{font-size:22pt}li{margin:0 0 12pt}p{margin-top:20pt}";
    doc.head.appendChild(style);
    const title=doc.createElement("h1");title.textContent="Σε περίπτωση βλάβης";doc.body.appendChild(title);
    const list=doc.createElement("ol");
    for(const step of guideSteps){const item=doc.createElement("li");item.textContent=step;list.appendChild(item)}
    doc.body.appendChild(list);
    const note=doc.createElement("p");note.textContent="Η εκτύπωση αυτού του οδηγού δεν καταχωρεί βλάβη.";doc.body.appendChild(note);
    page.focus();page.print();
    return true;
  }catch(error){try{page?.close()}catch{}return false}
}

export default function InstallationSupportProfile({company,store,onClose,request}){
  const closeRef=useRef(null),printRef=useRef(null),[printError,setPrintError]=useState(false);
  const pdfRef=useRef(null),xlsxRef=useRef(null);
  const [downloadError,setDownloadError]=useState("");
  const [downloading,setDownloading]=useState(false);
  const rows=company&&store?installationSupportRows(company,store):[];
  const selection=useRef(null);
  const selectionKey=company&&store?JSON.stringify([company.id,store.id]):null;
  useEffect(()=>{
    selection.current=selectionKey;
    return ()=>{selection.current=null};
  },[selectionKey]);
  async function download(format){
    setDownloading(true);
    setDownloadError("");
    try{
      const path=`/api/platform/companies/${encodeURIComponent(company.id)}/stores/${encodeURIComponent(store.id)}/installation-support-export/${format}`;
      const blob=await request(path,{downloadBlob:true});
      if(selection.current!==selectionKey)return;
      const url=URL.createObjectURL(blob);
      const link=document.createElement("a");
      link.href=url;
      link.download=`installation-support.${format}`;
      document.body.appendChild(link);
      try{link.click()}finally{link.remove();setTimeout(()=>URL.revokeObjectURL(url),1000)}
    }catch(error){
      if(selection.current===selectionKey)setDownloadError(error.message||"Η λήψη απέτυχε.");
    }finally{
      setDownloading(false);
    }
  }
  useEffect(()=>{
    const previous=document.activeElement;
    closeRef.current?.focus();
    return ()=>{if(previous?.isConnected&&typeof previous.focus==="function")previous.focus()};
  },[]);
  const onKeyDown=event=>{
    if(event.key==="Escape"){event.stopPropagation();onClose();return}
    if(event.key==="Tab"){
      const buttons=[closeRef.current,pdfRef.current,xlsxRef.current,printRef.current].filter(button=>button&&!button.disabled);
      if(buttons.length===1){event.preventDefault();buttons[0]?.focus();return}
      const first=buttons[0],last=buttons[buttons.length-1];
      if(event.shiftKey&&document.activeElement===first){event.preventDefault();last.focus()}
      else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus()}
    }
  };
  return <div className="install-support-overlay">
    <section className="install-support-profile" role="dialog" aria-modal="true" aria-labelledby="install-support-title" onKeyDown={onKeyDown}>
      <header className="install-support-head"><div><h2 id="install-support-title">{installationSupportTitle}</h2><p>Προβολή διαθέσιμων στοιχείων</p></div><button ref={closeRef} type="button" onClick={onClose} aria-label="Κλείσιμο στοιχείων υποστήριξης">Κλείσιμο</button></header>
      {company&&store?<>
        <div className="install-support-guide">
          <button ref={pdfRef} type="button" disabled={downloading} onClick={()=>download("pdf")}>Λήψη PDF</button>
          <button ref={xlsxRef} type="button" disabled={downloading} onClick={()=>download("xlsx")}>Λήψη Excel</button>
          {downloadError&&<p role="alert">{downloadError}</p>}
        </div>
        <div className="install-support-guide"><button ref={printRef} type="button" onClick={()=>setPrintError(!printGuide())}>Εκτύπωση οδηγού βλάβης</button>{printError&&<p role="alert">Δεν άνοιξε η εκτύπωση. Επίτρεψε τα αναδυόμενα παράθυρα και προσπάθησε ξανά.</p>}</div>
        <dl className="install-support-fields">
          {rows.slice(0,5).map(([label,value])=><div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}
        </dl>
        <div className="install-support-unchecked">
          <h3>Στοιχεία που δεν έχουν επιβεβαιωθεί εδώ</h3>
          <dl>{rows.slice(5).map(([label,value])=><div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>
        </div>
      </>:<p role="status">Το επιλεγμένο κατάστημα δεν είναι πλέον διαθέσιμο. Κλείσε την προβολή και επίλεξε κατάστημα ξανά.</p>}
    </section>
  </div>;
}
