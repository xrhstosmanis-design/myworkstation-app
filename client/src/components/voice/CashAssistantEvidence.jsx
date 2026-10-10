import React from "react";

const money=value=>value===null||value===undefined?"—":Number(value).toLocaleString("el-GR",{style:"currency",currency:"EUR"});
const at=value=>value?new Intl.DateTimeFormat("el-GR",{dateStyle:"short",timeStyle:"short",timeZone:"Europe/Athens"}).format(new Date(value)):"—";
const ruleLabel=rule=>rule?.mode==="DIFFERENCE_ONLY"?"Μόνο διαφορά μετρητών":rule?.mode==="POS_EFTPOS_ONLY"?"Μόνο POS–EFTPOS":rule?.mode==="FULL"?"Πλήρης έλεγχος":"Δες τον κανόνα της αναφοράς";

export default function CashAssistantEvidence({evidence=[]}){
  return evidence.map((report,index)=><section key={index} className="mws-cash-evidence" aria-label="Πραγματικά στοιχεία ελέγχου ταμείων">
    <h3>Στοιχεία από τον Έλεγχο Ταμείων</h3>
    <p>{report.date} · {report.fromTime}–{report.toTime} · ώρα Ελλάδας · κλεισμένες βάρδιες · {report.scope==="OWNER_SELECTED_STORE"?`μόνο ${report.storeName||"το επιλεγμένο κατάστημα"}`:"όλα τα καταστήματα (Super Admin)"}.</p>
    {report.truncated&&<p role="status">Εμφανίζονται {report.rows.length} από {report.totalRows} βάρδιες. Οι υπόλοιπες δεν περιλαμβάνονται στην απάντηση του βοηθού· δες τον κανονικό έλεγχο για ολόκληρη την αναφορά.</p>}
    {!report.rows.length?<p>Δεν βρέθηκαν κλεισμένες βάρδιες για αυτή την ημερομηνία. Αυτό δεν επιβεβαιώνει συμφωνία στα ανοικτά ταμεία.</p>:<div style={{overflowX:"auto"}}><table>
      <thead><tr><th>Εταιρεία / Κατάστημα</th><th>Βάρδια / POS</th><th>Κλείσιμο</th><th>Αναμενόμενα</th><th>Καταμετρημένα</th><th>Διαφορά μετρητών</th><th>Διαφορά POS–EFTPOS</th><th>Κανόνας</th></tr></thead>
      <tbody>{report.rows.map(row=><tr key={row.sessionId}><td>{row.companyName}<br/>{row.storeName}</td><td>{row.shiftLabel}<br/>{row.terminalPos}<small style={{display:"block"}}>ID: {row.sessionId}</small></td><td>{at(row.closedAt)}</td><td>{money(row.expectedOperational)}</td><td>{money(row.actualOperational)}</td><td>{row.auditRule?.mode==="POS_EFTPOS_ONLY"?"Δεν ελέγχεται":money(row.variance)}</td><td>{row.auditRule?.posEftposEnabled===false?"Δεν ελέγχεται":money(row.cardVariance)}</td><td>{ruleLabel(row.auditRule)}</td></tr>)}</tbody>
    </table></div>}
    <small>Τα ποσά προέρχονται από την κανονική αναφορά και δεν υπολογίζονται από το AI. Διαφορά ή εύρημα χρειάζεται έλεγχο· δεν αποδεικνύει αιτία ή ευθύνη εργαζομένου.</small>
    <style>{`.mws-cash-evidence{padding:16px;border:1px solid #cad9e6;border-radius:12px;margin-top:16px;background:#fff}.mws-cash-evidence table{width:100%;border-collapse:collapse;min-width:800px}.mws-cash-evidence th,.mws-cash-evidence td{padding:10px;text-align:left;border-bottom:1px solid #e2e8f0;vertical-align:top}.mws-cash-evidence th{background:#f1f5f9}.mws-cash-evidence small{display:block;margin-top:10px;color:#526276}`}</style>
  </section>);
}

