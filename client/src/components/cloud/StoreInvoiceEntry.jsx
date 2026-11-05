import React,{useEffect,useState} from "react";
import CommerceHub from "../commerce/CommerceHub.jsx";

// This is an entry into the existing Backoffice, not a second invoice UI.
// The parent's session-bound API and the unchanged server guards authorize
// every request. Cached modules and an arbitrary/default store never suffice.
export default function StoreInvoiceEntry({api,storeId}){
  const selected=typeof storeId==="string"?storeId.trim():"";
  const [entry,setEntry]=useState(null);
  useEffect(()=>{
    let stopped=false,sequence=0;
    const load=async()=>{
      const current=++sequence;
      if(!selected){setEntry({storeId:selected,error:"Επίλεξε έγκυρο κατάστημα πριν ανοίξεις τη θυρίδα."});return;}
      try{
        const [stores,license]=await Promise.all([api("/api/stores"),api("/api/license/current")]);
        if(stopped||current!==sequence)return;
        const matches=Array.isArray(stores)?stores.filter(store=>store.id===selected&&store.active!==false):[];
        if(matches.length!==1)throw new Error("Το επιλεγμένο κατάστημα δεν είναι διαθέσιμο. Άνοιξέ το ξανά από τα καταστήματα.");
        if(!Array.isArray(license?.activeModules)||!license.activeModules.includes("DOCUMENTS"))throw new Error("Η θυρίδα τιμολογίων δεν είναι διαθέσιμη στην τρέχουσα άδεια.");
        setEntry({storeId:selected,store:matches[0],modules:license.activeModules});
      }catch(error){if(!stopped&&current===sequence)setEntry({storeId:selected,error:error.message||"Δεν επιβεβαιώθηκε η πρόσβαση στη θυρίδα."});}
    };
    const visible=()=>{if(document.visibilityState!=="hidden")load()};
    load();
    window.addEventListener("focus",load);
    window.addEventListener("pageshow",load);
    window.addEventListener("myworkstation:modules-updated",load);
    document.addEventListener("visibilitychange",visible);
    return()=>{stopped=true;sequence++;window.removeEventListener("focus",load);window.removeEventListener("pageshow",load);window.removeEventListener("myworkstation:modules-updated",load);document.removeEventListener("visibilitychange",visible)};
  },[api,selected]);
  if(!entry||entry.storeId!==selected)return <p role="status">Έλεγχος πρόσβασης στη θυρίδα του καταστήματος…</p>;
  if(entry.error)return <p role="alert">{entry.error}</p>;
  return <CommerceHub key={selected} api={api} stores={[entry.store]} activeStoreId={selected} initialTab="documents" initialActiveModules={entry.modules}/>;
}
