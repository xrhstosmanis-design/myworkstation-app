import React,{useEffect,useRef} from "react";
import "./installation-support-profile.css";

const present=value=>typeof value==="string"&&value.trim()?value.trim():"Μη καταχωρημένο";

export default function InstallationSupportProfile({company,store,onClose}){
  const closeRef=useRef(null);
  useEffect(()=>{
    const previous=document.activeElement;
    closeRef.current?.focus();
    return ()=>{if(previous?.isConnected&&typeof previous.focus==="function")previous.focus()};
  },[]);
  const onKeyDown=event=>{
    if(event.key==="Escape"){event.stopPropagation();onClose();return}
    if(event.key==="Tab"){event.preventDefault();closeRef.current?.focus()}
  };
  return <div className="install-support-overlay">
    <section className="install-support-profile" role="dialog" aria-modal="true" aria-labelledby="install-support-title" onKeyDown={onKeyDown}>
      <header className="install-support-head"><div><h2 id="install-support-title">Στοιχεία υποστήριξης καταστήματος</h2><p>Προβολή διαθέσιμων στοιχείων</p></div><button ref={closeRef} type="button" onClick={onClose} aria-label="Κλείσιμο στοιχείων υποστήριξης">Κλείσιμο</button></header>
      {company&&store?<>
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
