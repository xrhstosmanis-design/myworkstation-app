import React from "react";
import {assistantMoney,assistantQuantity,assistantUnit} from "./presentAssistantAnswer.js";
const amounts=items=>(items||[]).map(q=>q.quantity===null?"Ποσότητα χωρίς καταγεγραμμένη μονάδα":`${assistantQuantity(q.quantity)} ${assistantUnit(q.unit)}`).join(" · ")||"Δεν καταγράφηκαν πωλήσεις";
export default function SalesStoresEvidence({evidence=[]}){
  return evidence.filter(r=>r.kind==="sales_by_store").map((r,i)=><section key={i} className="mws-sales-stores-evidence" aria-label="Πωλήσεις ανά κατάστημα">
    <h3>Πωλήσεις ανά κατάστημα</h3><p>{r.from} έως και {r.to} · ώρα Ελλάδας · {r.mode==="offers"?"Εφαρμοσμένες προσφορές":(r.names||[]).join(" · ")}</p>
    {r.incompletePeriod&&<p>Η περίοδος δεν έχει ολοκληρωθεί. Καταχωρημένα στοιχεία έως {r.asOf}.</p>}
    {r.result==="ambiguous"&&<><p>Επίλεξε πλήρη ονομασία ή συσκευασία για «{r.unresolvedName}». Δεν απαιτείται SKU.</p><ul>{(r.candidates||[]).map((name,j)=><li key={j}>{name}</li>)}</ul></>}
    {r.result==="no_match"&&<p>Δεν βρέθηκε αντίστοιχη ονομασία / κατηγορία ή διαθέσιμο εξουσιοδοτημένο κατάστημα. Δεν αποδεικνύεται μηδενική πώληση.</p>}
    {r.result==="source_limited"&&<p>{r.reason||"Η πηγή έφτασε το όριο. Επίλεξε στενότερο φίλτρο ή λιγότερα καταστήματα. Δεν εμφανίζεται πλήρες σύνολο."}</p>}
    {["matched","no_sales"].includes(r.result)&&<><div style={{overflowX:"auto"}}><table><thead><tr><th>Εταιρεία</th><th>Κατάστημα</th><th>Ποσότητα ανά μονάδα</th><th>Τζίρος με ΦΠΑ</th></tr></thead><tbody>{(r.stores||[]).map(s=><tr key={s.storeId}><td>{s.companyName}</td><td>{s.storeName}</td><td>{s.result==="complete"?amounts(s.quantities):"Δεν αντιστοιχεί η ονομασία στον κατάλογο"}</td><td>{s.grossSales===null?"Μη διαθέσιμο":assistantMoney(s.grossSales)}</td></tr>)}</tbody></table></div>
    {r.totals?<p><b>Σύνολο: {assistantMoney(r.totals.grossSales)}</b> · {amounts(r.totals.quantities)}</p>:<p>Δεν υπάρχει πλήρες σύνολο: λείπει τουλάχιστον μία απαιτούμενη πηγή.</p>}
    {(r.rows||[]).length>0&&<div style={{overflowX:"auto"}}><table><thead><tr><th>Κατάστημα</th><th>Είδος</th>{r.mode==="offers"&&<th>Εφαρμοσμένη προσφορά</th>}<th>Ποσότητα</th><th>Τζίρος με ΦΠΑ</th><th>Καθαρή αξία</th><th>ΦΠΑ</th></tr></thead><tbody>{r.rows.map((row,j)=><tr key={j}><td>{row.companyName} · {row.storeName}</td><td>{row.name}</td>{r.mode==="offers"&&<td>{row.promotionName||(row.promotionType==="GIFT"?"Προσφορά δώρου":"Προσφορά τιμής")} · {row.promotionId}</td>}<td>{assistantQuantity(row.salesQuantity)} {assistantUnit(row.unit)}</td><td>{assistantMoney(row.grossSales)}</td><td>{assistantMoney(row.netSales)}</td><td>{assistantMoney(row.vatValue)}</td></tr>)}</tbody></table></div>}</>}
    {(r.unavailable||[]).length>0&&<><h4>Μη διαθέσιμες πηγές</h4><ul>{r.unavailable.map((s,j)=><li key={j}>{s.companyName} · {s.storeName}: {s.reason}</li>)}</ul></>}
    {r.mode==="family"&&<p>Όλες οι καταγεγραμμένες συσκευασίες/παραλλαγές που ταιριάζουν στην ονομασία, με χωριστή γραμμή ανά είδος.</p>}
    <small>Πηγή: κανονικά Στατιστικά πωλήσεων, ίδια περίοδος / κατάστημα, Ώρα Ελλάδας. Επιστροφές και ακυρώσεις συνυπολογισμένες. Μη φορολογική ανάλυση. {r.mode==="offers"&&"Μόνο καταγεγραμμένες εφαρμοσμένες προσφορές, όχι αναδρομική απόδοση."}</small>
    <style>{".mws-sales-stores-evidence{margin-top:18px;padding:14px;background:#f4f8fc;border-radius:12px}.mws-sales-stores-evidence table{width:100%;border-collapse:collapse}.mws-sales-stores-evidence th,.mws-sales-stores-evidence td{padding:10px;text-align:left;border-bottom:1px solid #cbd8e5;white-space:nowrap}"}</style>
  </section>);
}
