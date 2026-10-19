import React from "react";
const money=value=>Number(value).toLocaleString("el-GR",{style:"currency",currency:"EUR"});
const quantity=value=>Number(value).toLocaleString("el-GR",{maximumFractionDigits:3});
const units={PIECE:"τεμάχια",KG:"κιλά",LITER:"λίτρα",PACKAGE:"συσκευασίες"};
const unit=value=>value===null||value===undefined?"Μη καταγεγραμμένη":Object.hasOwn(units,value)?units[value]:value;
export default function SalesAssistantEvidence({evidence=[]}){
  return evidence.filter(report=>report.kind==="product_sales").map((report,index)=><section className="mws-sales-evidence" key={index} aria-label="Στοιχεία από Στατιστικά πωλήσεων">
    <h3>Στοιχεία από Στατιστικά πωλήσεων</h3>
    <p>{report.companyName&&`${report.companyName} · `}{report.storeName} · {report.from} έως και {report.to} · ώρα Ελλάδας · Αναζήτηση: {report.productQuery}</p>
    <p>Ολοκληρωμένες μη πιστωτικές πωλήσεις. Η ποσότητα και η αξία συνυπολογίζουν καταχωρημένες επιστροφές και ακυρώσεις. Μη φορολογική ανάλυση.</p>
    {report.result==="source_limited"&&<p role="status">{report.reason||"Περιορισμένη πηγή πωλήσεων."} Δεν εμφανίζονται ποσά από περιορισμένη πηγή.</p>}
    {report.sourceCoverageStatus==="UNKNOWN"&&<p role="status">Η πηγή δεν παρέχει επιβεβαίωση πληρότητας. Δεν επιβεβαιώνεται πλήρες σύνολο.</p>}
    {report.sourceCoverageStatus==="COMPLETE"&&<p>Πληρότητα πηγής: επιβεβαιώθηκαν όλες οι ομάδες πωλήσεων για το εφαρμοσμένο φίλτρο.</p>}
    {report.result==="matched"&&<div style={{overflowX:"auto"}}><table><thead><tr><th>Είδος</th><th>SKU</th><th>Μονάδα</th><th>Ποσότητα</th><th>Τζίρος με ΦΠΑ</th><th>Καθαρή αξία</th><th>ΦΠΑ</th><th>Επιστροφές / ακυρώσεις</th></tr></thead><tbody>{report.rows.map(row=><tr key={row.productId}><td>{row.name}</td><td>{row.sku||"—"}</td><td>{unit(row.unit)}</td><td>{quantity(row.salesQuantity)}</td><td>{money(row.grossSales)}</td><td>{money(row.netSales)}</td><td>{money(row.vatValue)}</td><td>{row.reversalCount} · {money(row.returnGrossValue)}</td></tr>)}</tbody></table></div>}
    {report.result==="ambiguous"&&<><p>Βρέθηκαν περισσότερα ή μη μοναδικά είδη. Επίλεξε πλήρη ονομασία ή συσκευασία από τη λίστα· δεν εμφανίζεται άθροισμα. Μπορείς προαιρετικά να χρησιμοποιήσεις SKU.</p><ul>{report.candidates.map((row,i)=><li key={i}>{row.name} · {row.sku||"χωρίς SKU"}</li>)}</ul></>}
    {report.result==="no_match"&&<p>Δεν βρέθηκαν αντίστοιχες καταχωρημένες πωλήσεις σε αυτό το διάστημα. Έλεγξε περιγραφή, SKU και ημερομηνίες.</p>}
    {report.truncated&&<p>Η πηγή ή η λίστα έφτασε το όριο εμφάνισης. Ζήτησε στενότερο φίλτρο· δεν συμπεραίνεται πλήρες σύνολο.</p>}
    <small>Για διασταύρωση: Αναφορές → Στατιστικά πωλήσεων, ίδιο κατάστημα / είδος / ημερομηνίες και επιλογή «Ώρα Ελλάδας».</small>
    <style>{`.mws-sales-evidence{margin-top:18px;padding:14px;background:#f4f8fc;border-radius:12px}.mws-sales-evidence table{width:100%;border-collapse:collapse}.mws-sales-evidence th,.mws-sales-evidence td{padding:10px;text-align:left;border-bottom:1px solid #cbd8e5;white-space:nowrap}`}</style>
  </section>);
}
