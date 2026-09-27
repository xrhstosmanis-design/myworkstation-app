import React,{useState} from "react";
import {X} from "lucide-react";

export default function StoreLabelSettingsManager({company,store,initialSettings,request,onClose,onSaved}){
  const [settings,setSettings]=useState(initialSettings),[busy,setBusy]=useState(false),[error,setError]=useState("");
  const save=async(event)=>{
    event.preventDefault();setBusy(true);setError("");
    try{
      const result=await request(`/api/platform/companies/${company.id}/stores/${store.id}/label-settings`,{method:"PUT",body:JSON.stringify({widthMm:Number(settings.widthMm),heightMm:Number(settings.heightMm),printerName:settings.printerName.trim()})});
      onSaved(result.settings);onClose();
    }catch(err){setError(err.message)}finally{setBusy(false)}
  };
  return <div className="platform-modal"><form className="small" onSubmit={save}><button type="button" className="modal-close" onClick={onClose}><X/></button><h2>Ετικέτες προϊόντων</h2><p>{store.name} · ρυθμίσεις μόνο Super Admin</p><label>Πλάτος ετικέτας (mm)<input type="number" min="30" max="100" step="1" required value={settings.widthMm} onChange={e=>setSettings({...settings,widthMm:e.target.value})}/></label><label>Ύψος ετικέτας (mm)<input type="number" min="25" max="80" step="1" required value={settings.heightMm} onChange={e=>setSettings({...settings,heightMm:e.target.value})}/></label><label>Προτεινόμενος εκτυπωτής<input maxLength="120" value={settings.printerName} onChange={e=>setSettings({...settings,printerName:e.target.value})} placeholder="π.χ. Brother QL-800"/></label><p>Στην προεπισκόπηση εμφανίζονται επωνυμία καταστήματος, προϊόν, EAN‑13 και τιμή. Το όνομα εκτυπωτή είναι υπενθύμιση: τον πραγματικό προορισμό επιλέγετε στο παράθυρο εκτύπωσης του browser. Ορίστε εκεί χαρτί ίδιων διαστάσεων, κλίμακα 100% και χωρίς περιθώρια.</p>{error&&<div className="store-pos-alert error">{error}</div>}<div className="platform-form-actions"><button type="button" className="secondary" onClick={onClose}>Πίσω</button><button disabled={busy}>{busy?"Αποθήκευση…":"Αποθήκευση"}</button></div></form></div>;
}
