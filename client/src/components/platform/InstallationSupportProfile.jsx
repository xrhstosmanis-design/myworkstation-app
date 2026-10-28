import React,{useEffect,useRef,useState} from "react";
import "./installation-support-profile.css";

const present=value=>typeof value==="string"&&value.trim()?value.trim():"Μη καταχωρημένο";

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

export default function InstallationSupportProfile({company,store,onClose}){
  const closeRef=useRef(null),printRef=useRef(null),[printError,setPrintError]=useState(false);
  useEffect(()=>{
    const previous=document.activeElement;
    closeRef.current?.focus();
    return ()=>{if(previous?.isConnected&&typeof previous.focus==="function")previous.focus()};
  },[]);
  const onKeyDown=event=>{
    if(event.key==="Escape"){event.stopPropagation();onClose();return}
    if(event.key==="Tab"){
      const buttons=[closeRef.current,printRef.current].filter(Boolean);
      if(buttons.length===1){event.preventDefault();buttons[0]?.focus();return}
      const first=buttons[0],last=buttons[buttons.length-1];
      if(event.shiftKey&&document.activeElement===first){event.preventDefault();last.focus()}
      else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus()}
    }
  };
  return <div className="install-support-overlay">
    <section className="install-support-profile" role="dialog" aria-modal="true" aria-labelledby="install-support-title" onKeyDown={onKeyDown}>
      <header className="install-support-head"><div><h2 id="install-support-title">Στοιχεία υποστήριξης καταστήματος</h2><p>Προβολή διαθέσιμων στοιχείων</p></div><button ref={closeRef} type="button" onClick={onClose} aria-label="Κλείσιμο στοιχείων υποστήριξης">Κλείσιμο</button></header>
      {company&&store?<>
        <div className="install-support-guide"><button ref={printRef} type="button" onClick={()=>setPrintError(!printGuide())}>Εκτύπωση οδηγού βλάβης</button>{printError&&<p role="alert">Δεν άνοιξε η εκτύπωση. Επίτρεψε τα αναδυόμενα παράθυρα και προσπάθησε ξανά.</p>}</div>
        <dl className="install-support-fields">
          <div><dt>Εταιρεία</dt><dd>{present(company.name)}</dd></div>
          <div><dt>Κατάστημα</dt><dd>{present(store.name)}</dd></div>
          <div><dt>Πόλη</dt><dd>{present(store.city)}</dd></div>
          <div><dt>Διεύθυνση</dt><dd>{present(store.address)}</dd></div>
          <div><dt>Email υπευθύνου</dt><dd>{present(store.responsibleEmail)}</dd></div>
        </dl>
        <div className="install-support-unchecked"><h3>Στοιχεία που δεν έχουν επιβεβαιωθεί εδώ</h3><dl><div><dt>Υπολογιστές και εξοπλισμός</dt><dd>Δεν έχει ελεγχθεί</dd></div><div><dt>Τεχνικός</dt><dd>Δεν έχει ελεγχθεί</dd></div><div><dt>Απομακρυσμένη σύνδεση</dt><dd>Δεν έχει ελεγχθεί</dd></div><div><dt>Αντίγραφα ασφαλείας</dt><dd>Δεν έχει ελεγχθεί</dd></div></dl></div>
      </>:<p role="status">Το επιλεγμένο κατάστημα δεν είναι πλέον διαθέσιμο. Κλείσε την προβολή και επίλεξε κατάστημα ξανά.</p>}
    </section>
  </div>;
}
