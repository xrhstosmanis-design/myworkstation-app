import React,{useState} from "react";
import {Building2,Store,Users,Search,Settings,Plus} from "lucide-react";

export default function PlatformCompanyWorkspace({companies=[],owners=[],loading=false,renderManagement,onNewOwnerCompany}){
 const [query,setQuery]=useState(""),[selectedId,setSelectedId]=useState(null),[choosingOwner,setChoosingOwner]=useState(false);
 const normalize=value=>String(value||"").normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLocaleLowerCase("el-GR").replace(/ς/g,"σ");
 const filtered=companies.filter(c=>normalize([c.name,c.taxId,c.owner?.fullName,c.owner?.email,...(c.stores||[]).map(s=>s.name)].join(" ")).includes(normalize(query.trim())));
 // A missing/filtered selection never silently changes to another company.
 const selected=filtered.find(c=>c.id===selectedId);
 return <section className="platform-workspace" aria-label="Εταιρείες πελατών">
  <div className="platform-workspace-heading"><div><h2>Εταιρείες πελατών</h2><p>Κάθε εταιρεία ξεχωριστά · επιλέξτε Διαχείριση για τις ενέργειές της.</p></div><button type="button" onClick={()=>setChoosingOwner(v=>!v)} aria-expanded={choosingOwner}><Plus/>Νέα εταιρεία / ΑΦΜ</button></div>
  {choosingOwner&&<section className="platform-owner-picker" aria-label="Επιλογή ιδιοκτήτη για νέα εταιρεία"><h3>Σε ποιον ιδιοκτήτη ανήκει η νέα εταιρεία;</h3>{owners.length?owners.map(owner=><button className="secondary" key={owner.id} onClick={()=>{setChoosingOwner(false);onNewOwnerCompany(owner)}}>{owner.fullName}<small>{owner.email}</small></button>):<p>Δημιουργήστε πρώτα νέο πελάτη από το επάνω κουμπί.</p>}<button className="secondary" onClick={()=>setChoosingOwner(false)}>Ακύρωση</button></section>}
  <label className="platform-company-search"><Search/><span className="platform-sr-only">Αναζήτηση εταιρείας, ΑΦΜ ή ιδιοκτήτη</span><input type="search" value={query} onChange={e=>setQuery(e.target.value)} placeholder="Αναζήτηση εταιρείας, ΑΦΜ ή ιδιοκτήτη"/></label>
  <div className="platform-workspace-columns"><div className="platform-company-cards" aria-label="Λίστα εταιρειών" aria-busy={loading}>
   {loading?<p className="platform-empty">Φόρτωση πλατφόρμας…</p>:filtered.length===0?<p className="platform-empty">{companies.length?"Δεν βρέθηκαν εταιρείες για αυτή την αναζήτηση.":"Δεν υπάρχουν ακόμη πελάτες."}</p>:filtered.map(company=><article key={company.id} className={`platform-company-card ${selected?.id===company.id?"selected":""}`}>
    <div className="platform-card-heading"><Building2/><div><h3>{company.name}</h3><p>ΑΦΜ: {company.taxId||"Εκκρεμεί"}</p></div><span className={`company-status ${company.active?"active":"inactive"}`}>{company.active?"ΕΝΕΡΓΗ":"ΑΝΕΝΕΡΓΗ"}</span></div>
    <p className="platform-card-owner"><Users/>{company.owner?.fullName||"Δεν έχει οριστεί ιδιοκτήτης"}</p>
    <div className="platform-card-footer"><span><Store/>{company.storeCount??company.stores?.length??0} καταστήματα</span><button type="button" aria-pressed={selected?.id===company.id} aria-label={`Διαχείριση ${company.name}`} onClick={()=>setSelectedId(company.id)}><Settings/>Διαχείριση</button></div>
   </article>)}
  </div><aside className="platform-company-detail" aria-label="Διαχείριση επιλεγμένης εταιρείας" aria-live="polite">
   {selected&&!loading?<React.Fragment key={selected.id}><header><small>Διαχείριση εταιρείας</small><h2>{selected.name}</h2><p>ΑΦΜ: {selected.taxId||"Εκκρεμεί"}</p></header>{renderManagement(selected)}</React.Fragment>:<div className="platform-detail-empty"><Building2/><h3>Επιλέξτε εταιρεία</h3><p>{selectedId?"Η προηγούμενη επιλογή δεν είναι διαθέσιμη στην τρέχουσα λίστα.":"Πατήστε Διαχείριση στην εταιρεία που θέλετε."}</p></div>}
  </aside></div>
 </section>;
}
