import React from "react";
const money=value=>Number(value).toLocaleString("el-GR",{style:"currency",currency:"EUR"});
const quantity=value=>Number(value).toLocaleString("el-GR",{maximumFractionDigits:3});
export default function SalesAssistantEvidence({evidence=[]}){
  return evidence.filter(report=>report.kind==="product_sales").map((report,index)=><section className="mws-sales-evidence" key={index} aria-label="Στοιχεία από Στατιστικά πωλήσεων">
    <h3>Στοιχεία από Στατιστικά πωλήσεων</h3>
    <p>{report.storeName} · {report.from} έως και {report.to} · ώρα Ελλάδας · Αναζήτηση: {report.productQuery}</p>
    <p>Ολοκληρωμένες μη πιστωτικές πωλήσεις. Η ποσότητα και η αξία συνυπολογίζουν καταχωρημένες επιστροφές και ακυρώσεις. Μη φορολογική ανάλυση.</p>
    {report.result==="matched"&&<div style={{overflowX:"auto"}}><table><thead><tr><th>Είδος</th><th>SKU</th><th>Ποσότητα</th><th>Τζίρος με ΦΠΑ</th><th>Καθαρή αξία</th><th>ΦΠΑ</th><th>Επιστροφές / ακυρώσεις</th></tr></thead><tbody>{report.rows.map(row=><tr key={row.productId}><td>{row.name}</td><td>{row.sku||"—"}</td><td>{quantity(row.salesQuantity)}</td><td>{money(row.grossSales)}</td><td>{money(row.netSales)}</td><td>{money(row.vatValue)}</td><td>{row.reversalCount} · {money(row.returnGrossValue)}</td></tr>)}</tbody></table></div>}
    {report.result==="ambiguous"&&<><p>Βρέθηκαν περισσότερα ή μη μοναδικά είδη. Γράψε το συγκεκριμένο SKU· δεν εμφανίζεται άθροισμα.</p><ul>{report.candidates.map((row,i)=><li key={i}>{row.name} · {row.sku||"χωρίς SKU"}</li>)}</ul></>}
    {report.result==="no_match"&&<p>Δεν βρέθηκαν αντίστοιχες καταχωρημένες πωλήσεις σε αυτό το διάστημα. Έλεγξε περιγραφή, SKU και ημερομηνίες.</p>}
    {report.truncated&&<p>Η πηγή ή η λίστα έφτασε το όριο εμφάνισης. Ζήτησε στενότερο φίλτρο· δεν συμπεραίνεται πλήρες σύνολο.</p>}
    <small>Για διασταύρωση: Αναφορές → Στατιστικά πωλήσεων, ίδιο κατάστημα / είδος / ημερομηνίες και επιλογή «Ώρα Ελλάδας».</small>
    <style>{`.mws-sales-evidence{margin-top:18px;padding:14px;background:#f4f8fc;border-radius:12px}.mws-sales-evidence table{width:100%;border-collapse:collapse}.mws-sales-evidence th,.mws-sales-evidence td{padding:10px;text-align:left;border-bottom:1px solid #cbd8e5;white-space:nowrap}`}</style>
  </section>);
}
