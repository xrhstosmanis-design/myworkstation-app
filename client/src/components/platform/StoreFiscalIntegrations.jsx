import React,{useState} from "react";
import {KeyRound,ShieldCheck,X} from "lucide-react";

const definitions=[
  {kind:"MYDATA",title:"myDATA / Ηλεκτρονική τιμολόγηση",account:"User ID / Αναγνωριστικό",secret:"Κωδικός / Subscription key"},
  {kind:"VAT_LOOKUP",title:"Εύρεση επιχείρησης μέσω ΑΦΜ",account:"User ID / Client ID",secret:"Κωδικός / API key"}
];

export default function StoreFiscalIntegrations({manager,request,onClose,onChanged}){
  const [saving,setSaving]=useState("");
  const [error,setError]=useState("");
  const current=kind=>manager.integrations.find(row=>row.kind===kind);
  const submit=kind=>async event=>{
    event.preventDefault();setSaving(kind);setError("");const form=new FormData(event.currentTarget);
    try{
      await request(`/api/platform/companies/${manager.company.id}/stores/${manager.store.id}/integrations/${kind}`,{method:"PUT",body:JSON.stringify({providerName:form.get("providerName"),environment:form.get("environment"),accountId:form.get("accountId"),secret:form.get("secret"),enabled:true})});
      event.currentTarget.reset();await onChanged();
    }catch(err){setError(err.message)}finally{setSaving("")}
  };
  const toggle=async row=>{
    setSaving(row.kind);setError("");
    try{await request(`/api/platform/companies/${manager.company.id}/stores/${manager.store.id}/integrations/${row.kind}/status`,{method:"PATCH",body:JSON.stringify({enabled:!row.enabled})});await onChanged()}
    catch(err){setError(err.message)}finally{setSaving("")}
  };
  return <div className="platform-modal"><section className="platform-security-dialog fiscal-integrations-dialog"><button type="button" className="modal-close" onClick={onClose}><X/></button><h2>Ασφαλείς διασυνδέσεις καταστήματος</h2><p>{manager.company.name} · <b>{manager.store.name}</b></p><div className="terminal-explainer"><ShieldCheck/><span>Οι κωδικοί κρυπτογραφούνται στον server, δεν επιστρέφονται ποτέ στην οθόνη και δεν αποθηκεύονται στον κώδικα ή στο GitHub.</span></div>{error&&<div className="platform-error">{error}</div>}<div className="fiscal-integrations-grid">{definitions.map(def=>{const row=current(def.kind);return <form key={def.kind} onSubmit={submit(def.kind)}><div className="fiscal-integration-heading"><KeyRound/><div><h3>{def.title}</h3><span className={row?.enabled?"configured":""}>{row?`${row.enabled?"ΕΝΕΡΓΗ":"ΑΝΕΝΕΡΓΗ"} · ${row.accountHint}`:"ΔΕΝ ΕΧΕΙ ΡΥΘΜΙΣΤΕΙ"}</span></div></div><label>Πάροχος / Υπηρεσία<input name="providerName" defaultValue={row?.providerName||""} placeholder="π.χ. AADE ή όνομα παρόχου" required/></label><label>Περιβάλλον<select name="environment" defaultValue={row?.environment||"PRODUCTION"}><option value="PRODUCTION">Παραγωγή</option><option value="SANDBOX">Δοκιμαστικό</option></select></label><label>{def.account}<input name="accountId" autoComplete="off" required/></label><label>{def.secret}<input name="secret" type="password" autoComplete="new-password" required/></label><small>Για αλλαγή κωδικών συμπλήρωσε ξανά και τα δύο μυστικά πεδία. Οι προηγούμενες τιμές δεν εμφανίζονται.</small><div className="platform-form-actions">{row&&<button type="button" className="secondary" onClick={()=>toggle(row)} disabled={saving===def.kind}>{row.enabled?"Απενεργοποίηση":"Ενεργοποίηση"}</button>}<button disabled={saving===def.kind}>{saving===def.kind?"Αποθήκευση…":row?"Αλλαγή κωδικών":"Ασφαλής αποθήκευση"}</button></div></form>})}</div></section></div>;
}
