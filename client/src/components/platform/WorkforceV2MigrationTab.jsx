import React from "react";
import {Eye,ShieldCheck} from "lucide-react";
import {workforceMigrationStatusLabel} from "./workforce-v2-ui-utils.js";

export default function WorkforceV2MigrationTab({manager,store}){
  const {migration,migrationScope,setMigrationScope,setMigration,includeInactiveLegacy,setIncludeInactiveLegacy,busy,createMigrationPreview}=manager;
  return <section className="workforce-migration-card">
    <div className="workforce-migration-banner"><Eye/><div><b>ΠΡΟΕΠΙΣΚΟΠΗΣΗ ΜΟΝΟ — ΚΑΜΙΑ ΜΕΤΑΦΟΡΑ</b><span>Η ενέργεια διαβάζει το παλιό module και προτείνει αντιστοίχιση. Δεν δημιουργεί, δεν αλλάζει και δεν διαγράφει εργαζομένους.</span></div></div>
    <div className="workforce-migration-actions">
      <label>Πεδίο ελέγχου<select value={migrationScope} onChange={e=>{setMigrationScope(e.target.value);setMigration(null)}}><option value="STORE">Μόνο {store.name}</option><option value="COMPANY">Όλα τα καταστήματα με ενεργό BASIC</option></select></label>
      <label><input type="checkbox" checked={includeInactiveLegacy} onChange={e=>setIncludeInactiveLegacy(e.target.checked)}/>Να συμπεριληφθούν και ανενεργοί παλιοί εργαζόμενοι</label>
      <button onClick={createMigrationPreview} disabled={Boolean(busy)}><Eye/> {busy==="migration"?"Έλεγχος…":"Δημιουργία προεπισκόπησης"}</button>
    </div>
    {migration&&<>
      <div className="workforce-preview-summary">
        <div><b>{migration.summary.total}</b><span>σύνολο</span></div><div className="ok"><b>{migration.summary.ready}</b><span>έτοιμα</span></div>
        <div className="warn"><b>{migration.summary.needsReview}</b><span>για έλεγχο</span></div><div><b>{migration.summary.alreadyLinked}</b><span>ήδη συνδεδεμένα</span></div>
        <div className="error"><b>{migration.summary.blocked}</b><span>μπλοκαρισμένα</span></div>
      </div>
      <p className="workforce-preview-hash">Κωδικός προεπισκόπησης: <code>{migration.previewHash}</code></p>
      <div className="workforce-migration-table"><table><thead><tr><th>Παλιός εργαζόμενος</th><th>Κατάστημα</th><th>Ρόλος</th><th>Πρόταση</th><th>Κατάσταση</th></tr></thead><tbody>{migration.rows.map(row=><tr key={row.legacy.id}>
        <td><b>{row.legacy.fullName}</b><small>{row.legacy.email||row.legacy.phone||"Χωρίς στοιχεία επικοινωνίας"}</small></td><td>{row.legacy.storeName||"—"}</td>
        <td>{row.roleMapping.role?.name||row.roleMapping.proposedName||"Δεν ορίστηκε"}</td>
        <td><small>{row.proposed.maxDaysPerWeek} μέρες · {row.proposed.maxHoursPerWeek} ώρες<br/>{row.warnings.join(" · ")||"Χωρίς προειδοποιήσεις"}</small></td>
        <td><span className={`migration-status ${row.status.toLowerCase()}`}>{workforceMigrationStatusLabel[row.status]||row.status}</span></td>
      </tr>)}</tbody></table></div>
      <div className="workforce-no-apply"><ShieldCheck/> Δεν υπάρχει κουμπί εφαρμογής σε αυτό το checkpoint.</div>
    </>}
  </section>;
}
