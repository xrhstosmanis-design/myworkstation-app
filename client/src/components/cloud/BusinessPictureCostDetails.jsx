import React from 'react';
const money=value=>Number(value||0).toLocaleString('el-GR',{style:'currency',currency:'EUR'});
export default function BusinessPictureCostDetails({data,period,storeName,onClose}){
 const products=new Map();
 for(const row of data?.missingCostDetails||[]){
  if(period.day?row.day!==period.day:period.month?row.month!==period.month:false)continue;
  const id=JSON.stringify([row.storeId,row.productId,row.productId?null:row.name,row.reason]),current=products.get(id)||{...row,lines:0,quantity:0,salesGross:0,salesNet:0};
  for(const field of ['lines','quantity','salesGross','salesNet'])current[field]+=Number(row[field]||0);products.set(id,current);
 }
 const rows=[...products.values()].sort((a,b)=>b.salesGross-a.salesGross||a.name.localeCompare(b.name));
 return <section className="business-expense-panel business-cost-panel" role="dialog" aria-label="Είδη χωρίς κόστος"><header><div><h3>Είδη χωρίς κόστος</h3><p>{storeName||'Επιλεγμένη αναφορά'} · {period.day||period.month||`${data?.calendarFrom} έως ${data?.calendarTo}`} · {rows.length} εγγραφές ειδών</p></div><button type="button" onClick={onClose}>Επιστροφή στην αναφορά</button></header><div className="business-expense-content"><p>Συμπλήρωσε το σωστό κόστος ανά μονάδα στην καρτέλα του είδους στην Αποθήκη ή μέσω της κανονικής καταχώρισης αγοράς. Η αναφορά δεν αλλάζει προϊόντα, τιμολόγια ή απόθεμα. Τα ποσά με «≈ Εκτίμηση» παραμένουν προσωρινά μέχρι να υπάρχει πλήρες κόστος.</p><div className="business-expense-table"><table><thead><tr>{['Είδος','Κωδικός','Κατάστημα','Γραμμές','Ποσότητα','Πωλήσεις (με ΦΠΑ)','Εκκρεμότητα'].map(label=><th key={label}>{label}</th>)}</tr></thead><tbody>{rows.map(row=><tr key={JSON.stringify([row.storeId,row.productId,row.name,row.reason])}><td>{row.name}</td><td>{row.sku||'—'}</td><td>{row.storeName||storeName||'—'}</td><td>{row.lines}</td><td>{row.quantity.toLocaleString('el-GR')}</td><td>{money(row.salesGross)}</td><td>{row.reason==='UNSAFE_ORIGINAL'?'Έλεγχος αρχικής πώλησης / προσήμων':'Δεν υπάρχει διαθέσιμο κόστος πώλησης'}</td></tr>)}</tbody></table></div>{!rows.length&&<p>Δεν υπάρχουν διαθέσιμες εγγραφές ειδών χωρίς κόστος στην επιλεγμένη περίοδο.</p>}</div></section>;
}
