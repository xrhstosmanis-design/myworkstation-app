import React from "react";
const quantity=value=>Number(value).toLocaleString("el-GR",{maximumFractionDigits:3});
const unitLabels={PIECE:"τεμάχια",KG:"κιλά",LITER:"λίτρα",PACKAGE:"συσκευασίες"};
const readTime=value=>{const date=new Date(value);return Number.isFinite(date.getTime())?date.toLocaleString("el-GR",{timeZone:"Europe/Athens",hour12:false}):"—"};
export default function StockAssistantEvidence({evidence=[]}){
  return evidence.filter(report=>report.kind==="product_stock").map((report,index)=><section className="mws-stock-evidence" key={index} aria-label="Στοιχεία από Ανάλυση αποθήκης">
    <h3>Στοιχεία από Ανάλυση αποθήκης</h3>
    <p>{report.companyName&&`${report.companyName} · `}{report.storeName} · Αναζήτηση: {report.productQuery} · Ανάγνωση: {readTime(report.observedAt)} · ώρα Ελλάδας</p>
    <p>Τρέχον καταγεγραμμένο απόθεμα στην αποθήκη. Δεν αποτελεί φυσική καταμέτρηση ή ιστορικό απόθεμα.</p>
    {report.result==="matched"&&<div style={{overflowX:"auto"}}><table><thead><tr><th>Είδος</th><th>SKU</th><th>Καταγεγραμμένο απόθεμα</th><th>Μονάδα</th></tr></thead><tbody>{report.rows.map(row=><tr key={row.productId}><td>{row.name}</td><td>{row.sku||"—"}</td><td>{quantity(row.currentStock)}</td><td>{unitLabels[row.unit]||row.unit}</td></tr>)}</tbody></table></div>}
    {report.result==="ambiguous"&&<><p>Βρέθηκαν περισσότερα ή μη μοναδικά είδη. Επίλεξε πλήρη ονομασία ή συσκευασία από τη λίστα· δεν εμφανίζεται ποσότητα ή άθροισμα. Μπορείς προαιρετικά να χρησιμοποιήσεις SKU.</p><ul>{report.candidates.map((row,i)=><li key={i}>{row.name} · {row.sku||"χωρίς SKU"}</li>)}</ul></>}
    {report.result==="no_match"&&<p>Δεν βρέθηκε αντίστοιχη ενεργή εγγραφή στην αναφορά αποθήκης του επιλεγμένου καταστήματος. Έλεγξε περιγραφή ή SKU. Αυτό δεν αποδεικνύει μηδενικό απόθεμα ή ανύπαρκτο είδος.</p>}
    {report.truncated&&<p>Η πηγή ή η λίστα έφτασε το όριο εμφάνισης. Ζήτησε στενότερο φίλτρο· δεν μπορεί να εξαχθεί ασφαλές αποτέλεσμα.</p>}
    <small>Για διασταύρωση: Αναφορές → Στατιστικά αποθήκης, ίδιο κατάστημα και είδος / SKU, στήλη «Απόθεμα» και νέα αναζήτηση. Οι ημερομηνίες εκεί αφορούν κινήσεις / πωλήσεις περιόδου, όχι την τρέχουσα ποσότητα.</small>
    <style>{`.mws-stock-evidence{margin-top:18px;padding:14px;background:#f4f8fc;border-radius:12px}.mws-stock-evidence table{width:100%;border-collapse:collapse}.mws-stock-evidence th,.mws-stock-evidence td{padding:10px;text-align:left;border-bottom:1px solid #cbd8e5;white-space:nowrap}`}</style>
  </section>);
}
