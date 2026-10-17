import React,{useEffect,useRef,useState} from 'react';
export default function CompanyIdentityEditor({company,request,onClose,onSaved}){
 const [busy,setBusy]=useState(false),[error,setError]=useState('');
 const alive=useRef(true);useEffect(()=>{alive.current=true;return()=>{alive.current=false}},[]);
 const submit=async event=>{
  event.preventDefault();if(busy)return;const form=new FormData(event.currentTarget);setBusy(true);setError('');
  try{
   const result=await request(`/api/platform/companies/${company.id}/identity`,{method:'PUT',body:JSON.stringify({name:form.get('name'),taxId:form.get('taxId'),expectedName:company.name,expectedTaxId:company.taxId||''})});
   if(alive.current)onSaved(result.company);
  }catch(err){if(alive.current)setError(err.message)}finally{if(alive.current)setBusy(false)}
 };
 return <div className="platform-modal"><form className="small" onSubmit={submit} role="dialog" aria-modal="true" aria-labelledby="company-identity-title"><h2 id="company-identity-title">Στοιχεία εταιρείας</h2><p>Τα καταστήματα και τα δεδομένα παραμένουν στην ίδια εταιρεία.</p><label>Επωνυμία εταιρείας<input name="name" defaultValue={company.name} minLength={2} maxLength={160} required autoFocus disabled={busy}/></label><label>ΑΦΜ<input name="taxId" defaultValue={company.taxId||''} inputMode="numeric" pattern="[0-9]{9}" minLength={9} maxLength={9} required readOnly={Boolean(company.taxId)} disabled={busy}/></label>{company.taxId?<p>Το ήδη καταχωρισμένο ΑΦΜ παραμένει σταθερό. Για διαφορετικό ΑΦΜ χρειάζεται ξεχωριστός έλεγχος.</p>:<label><input type="checkbox" required disabled={busy}/> Επιβεβαίωσα ότι το ΑΦΜ ανήκει σε αυτή την εταιρεία και στα καταστήματά της.</label>}{error&&<p role="alert">{error}</p>}<div className="platform-form-actions"><button type="button" className="secondary" onClick={onClose} disabled={busy}>Ακύρωση</button><button disabled={busy}>{busy?'Αποθήκευση…':'Αποθήκευση στοιχείων'}</button></div></form></div>;
}
