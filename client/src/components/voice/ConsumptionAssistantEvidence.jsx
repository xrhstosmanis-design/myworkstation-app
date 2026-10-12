import React from "react";
import {assistantMoney} from "./presentAssistantAnswer.js";

export default function ConsumptionAssistantEvidence({evidence=[]}){
 return evidence.filter(r=>r.kind==="consumption").map((r,i)=><section key={i} className="mws-consumption-evidence" aria-label="Καταχωρημένα συμβάντα ιδιοκατανάλωσης">
  <h3>{r.consumptionKind==="PRODUCT_DESTRUCTION"?"Καταστροφή προϊόντων":"Ιδιοκατανάλωση"}</h3>
  <p>{r.companyName} · {r.storeName} · {r.from} έως {r.to} · ώρα Ελλάδας · μόνο το επιλεγμένο κατάστημα</p>
  {r.incompletePeriod&&<p>Η περίοδος δεν έχει ολοκληρωθεί. Στοιχεία έως {new Date(r.asOf).toLocaleString("el-GR",{timeZone:"Europe/Athens",hour12:false})}.</p>}
  {r.result==="source_limited"?<p role="status">{r.reason} Δεν εμφανίζεται πλήρες σύνολο.</p>:r.result==="no_records"?<p>Δεν βρέθηκαν καταχωρημένα συμβάντα για αυτό το κατάστημα και διάστημα{r.productQuery?` με φίλτρο «${r.productQuery}»`:""}.</p>:r.result==="matched"&&<>
   <div style={{overflowX:"auto"}}><table><thead><tr><th>Ημερομηνία</th><th>Είδος</th><th>Ποσότητα</th><th>Αξία αναφοράς</th><th>Χειριστής καταχώρισης</th></tr></thead><tbody>{r.rows.map((row,n)=><tr key={`${row.eventId}:${row.line}:${n}`}><td>{new Date(row.recordedAt).toLocaleString("el-GR",{timeZone:"Europe/Athens",hour12:false})}</td><td>{row.name}{row.sku?` · ${row.sku}`:""}</td><td>{Number(row.quantity).toLocaleString("el-GR",{maximumFractionDigits:20})}</td><td>{row.referenceValue===null?"Μη καταγεγραμμένη":assistantMoney(row.referenceValue)}</td><td>{row.operatorName||"Μη καταγεγραμμένος"}</td></tr>)}</tbody></table></div>
   {r.totals&&<p><b>Συνολική αξία αναφοράς: {assistantMoney(r.totals.referenceValue)}</b></p>}
  </>}
  <small>Πηγή: Συμβάντα POS. Η αξία αναφοράς αφορά τα καταχωρημένα είδη· δεν είναι τζίρος, πληρωμή ή κόστος αγοράς. Η ποσότητα εμφανίζεται ανά γραμμή χωρίς άθροισμα διαφορετικών μονάδων. Ο χειριστής είναι αυτός που καταχώρισε το συμβάν.</small>
  <style>{".mws-consumption-evidence{margin-top:18px;padding:14px;background:#f4f8fc;border-radius:12px}.mws-consumption-evidence table{width:100%;border-collapse:collapse}.mws-consumption-evidence th,.mws-consumption-evidence td{padding:10px;text-align:left;border-bottom:1px solid #cbd8e5;white-space:nowrap}"}</style>
 </section>);
}
