import React,{useState} from "react";
import {Building2,Store,Users,Search,Settings,Plus,ChevronDown,ChevronRight} from "lucide-react";

export default function PlatformCompanyWorkspace({companies=[],owners=[],loading=false,renderManagement,onNewOwnerCompany}){
 const [query,setQuery]=useState(""),[selectedId,setSelectedId]=useState(null),[choosingOwner,setChoosingOwner]=useState(false),[openOwner,setOpenOwner]=useState(null);
 const normalize=value=>String(value||"").normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLocaleLowerCase("el-GR").replace(/ς/g,"σ");
 const filtered=companies.filter(c=>normalize([c.name,c.taxId,c.owner?.fullName,c.owner?.email,...(c.stores||[]).map(s=>s.name)].join(" ")).includes(normalize(query.trim())));
 // Identity comes from the existing relationships, never from a display name.
 const groups=new Map(owners.filter(o=>o.id).map(o=>[o.id,{id:o.id,owner:o,companies:[]}]));
 for(const company of companies){
  const ownerId=company.owner?.id;
  const linked=ownerId?[ownerId]:owners.filter(o=>o.companyId===company.id||o.companyIds?.includes(company.id)).map(o=>o.id);
  const ids=linked.length?[...new Set(linked)]:["unassigned"];
  for(const id of ids){
   if(!groups.has(id))groups.set(id,{id,owner:company.owner?.id===id?company.owner:null,companies:[]});
   groups.get(id).companies.push(company);
  }
 }
 const term=normalize(query.trim());
 const visibleGroups=[...groups.values()].map(group=>{
  const ownerMatch=normalize([group.owner?.fullName,group.owner?.email,group.id==="unassigned"?"Χωρίς ιδιοκτήτη":""].join(" ")).includes(term);
  return {...group,companies:ownerMatch?group.companies:group.companies.filter(c=>filtered.includes(c))};
 }).filter(group=>!term||group.companies.length||normalize([group.owner?.fullName,group.owner?.email].join(" ")).includes(term));
 // A missing/filtered selection never silently changes to another company.
 const selected=visibleGroups.find(g=>g.id===openOwner)?.companies.find(c=>c.id===selectedId);
 return <section className="platform-workspace" aria-label="Ιδιοκτήτες και καταστήματα">
  <div className="platform-workspace-heading"><div><h2>Ιδιοκτήτες και καταστήματα</h2><p>Επίλεξε ιδιοκτήτη για να δεις τις εταιρείες και τα καταστήματά του.</p></div><button type="button" onClick={()=>setChoosingOwner(v=>!v)} aria-expanded={choosingOwner}><Plus/>Νέα εταιρεία / ΑΦΜ</button></div>
  {choosingOwner&&<section className="platform-owner-picker" aria-label="Επιλογή ιδιοκτήτη για νέα εταιρεία"><h3>Σε ποιον ιδιοκτήτη ανήκει η νέα εταιρεία;</h3>{owners.length?owners.map(owner=><button className="secondary" key={owner.id} onClick={()=>{setChoosingOwner(false);onNewOwnerCompany(owner)}}>{owner.fullName}<small>{owner.email}</small></button>):<p>Δημιουργήστε πρώτα νέο πελάτη από το επάνω κουμπί.</p>}<button className="secondary" onClick={()=>setChoosingOwner(false)}>Ακύρωση</button></section>}
  <label className="platform-company-search"><Search/><span className="platform-sr-only">Αναζήτηση ιδιοκτήτη, εταιρείας, ΑΦΜ ή καταστήματος</span><input type="search" value={query} onChange={e=>setQuery(e.target.value)} placeholder="Αναζήτηση ιδιοκτήτη, εταιρείας, ΑΦΜ ή καταστήματος"/></label>
  <div className="platform-workspace-columns"><div className="platform-company-cards" aria-label="Λίστα ιδιοκτητών" aria-busy={loading}>
   {loading?<p className="platform-empty">Φόρτωση πλατφόρμας…</p>:visibleGroups.length===0?<p className="platform-empty">{companies.length?"Δεν βρέθηκαν εταιρείες για αυτή την αναζήτηση.":"Δεν υπάρχουν ακόμη πελάτες."}</p>:visibleGroups.map((group,index)=><section className="platform-owner-group" key={group.id}>
    <button type="button" className="platform-owner-toggle" aria-expanded={openOwner===group.id} aria-controls={`platform-owner-companies-${index}`} onClick={()=>{setOpenOwner(openOwner===group.id?null:group.id);setSelectedId(null)}}>
     <Users/><span><strong>{group.owner?.fullName||"Χωρίς ιδιοκτήτη"}</strong>{group.owner?.email&&<small>{group.owner.email}</small>}<small>{group.companies.length} εταιρείες · {group.companies.reduce((sum,c)=>sum+(c.storeCount??c.stores?.length??0),0)} καταστήματα</small></span>{openOwner===group.id?<ChevronDown/>:<ChevronRight/>}
    </button>
    {openOwner===group.id&&<div id={`platform-owner-companies-${index}`} className="platform-owner-companies">{group.companies.length===0?<p className="platform-empty">Δεν υπάρχουν ακόμη εταιρείες για αυτόν τον ιδιοκτήτη.</p>:group.companies.map(company=><article key={company.id} className={`platform-company-card ${selected?.id===company.id?"selected":""}`}>
    <div className="platform-card-heading"><Building2/><div><h3>{company.name}</h3><p>ΑΦΜ: {company.taxId||"Εκκρεμεί"}</p></div><span className={`company-status ${company.active?"active":"inactive"}`}>{company.active?"ΕΝΕΡΓΗ":"ΑΝΕΝΕΡΓΗ"}</span></div>
    <ul className="platform-owner-stores">{(company.stores||[]).map(store=><li key={store.id}><Store/>{store.name}</li>)}</ul>
    <div className="platform-card-footer"><span><Store/>{company.storeCount??company.stores?.length??0} καταστήματα</span><button type="button" aria-pressed={selected?.id===company.id} aria-label={`Διαχείριση ${company.name}`} onClick={()=>setSelectedId(company.id)}><Settings/>Διαχείριση</button></div>
   </article>)}</div>}
   </section>)}
  </div><aside className="platform-company-detail" aria-label="Διαχείριση επιλεγμένης εταιρείας" aria-live="polite">
   {selected&&!loading?<React.Fragment key={selected.id}><header><small>Διαχείριση εταιρείας</small><h2>{selected.name}</h2><p>ΑΦΜ: {selected.taxId||"Εκκρεμεί"}</p></header>{renderManagement(selected)}</React.Fragment>:<div className="platform-detail-empty"><Building2/><h3>Επιλέξτε εταιρεία</h3><p>{selectedId?"Η προηγούμενη επιλογή δεν είναι διαθέσιμη στην τρέχουσα λίστα.":"Πατήστε Διαχείριση στην εταιρεία που θέλετε."}</p></div>}
  </aside></div>
 </section>;
}
