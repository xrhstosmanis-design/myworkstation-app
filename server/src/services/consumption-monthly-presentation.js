import {createHash} from 'node:crypto';
export const consumptionMonthlyFormat='MWS_MONTHLY_CONSUMPTION_V1';
export const consumptionTextHash=text=>createHash('sha256').update(text,'utf8').digest('hex');
const euro=new Intl.NumberFormat('el-GR',{style:'currency',currency:'EUR'});
const clean=value=>String(value??'—').replace(/[\u0000-\u001f\u007f]/g,' ').slice(0,500);
const money=value=>value===null?'Μη διαθέσιμη':euro.format(value);
export function consumptionMonthlySection(label,report){
  const lines=[label];
  if(!report)return [...lines,'Η πηγή δεν ήταν διαθέσιμη. Δεν εξάγεται μηδενικό ή τελικό σύνολο.'].join('\n');
  lines.push(report.purchaseBasis,report.saleBasis);
  if(!report.rows.length)lines.push('Δεν βρέθηκαν καταχωρίσεις στο συγκεκριμένο διάστημα.');
  if(report.truncated)lines.push(`Πάνω από ${report.limit} γραμμές — περιορισμένη ανάλυση, χωρίς πλήρη τελικά σύνολα.`);
  for(const r of report.rows)lines.push([
    new Date(r.createdAt).toLocaleString('el-GR',{timeZone:'Europe/Athens'}),clean(r.name),
    `${r.quantity} ${clean(r.unit)}`,`Αγορά ${money(r.purchaseTotal)}`,`Πώληση ${money(r.saleTotal)}`,
    `Χειριστής καταχώρισης: ${clean(r.operatorName)}`,`Αιτιολογία: ${clean(r.note)}`
  ].join(' · '));
  if(report.missingPurchase||report.missingSale)lines.push(`Ελλιπής αποτίμηση: ${report.missingPurchase} γραμμές χωρίς αγορά / ${report.missingSale} χωρίς πώληση. Δεν υπολογίζονται ως μηδέν.`);
  lines.push(`Τελικό σύνολο αγοράς: ${money(report.totalPurchase)}`,`Τελικό σύνολο πώλησης: ${money(report.totalSale)}`);
  return lines.join('\n');
}
export function validateConsumptionMonthly(value,{companyId,storeId,fromDay,toDay}){
  if(!value||value.format!==consumptionMonthlyFormat||value.companyId!==companyId||value.storeId!==storeId||
    value.fromDay!==fromDay||value.toDay!==toDay||typeof value.text!=='string'||!value.text.trim()||
    Buffer.byteLength(value.text,'utf8')>700000||/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(value.text)||value.fingerprint!==consumptionTextHash(value.text)){
    throw Object.assign(new Error('Μη έγκυρη μηνιαία ανάλυση καταστροφών / ιδιοκατανάλωσης.'),{status:503});
  }
  return {format:value.format,companyId,storeId,fromDay,toDay,text:value.text,fingerprint:value.fingerprint};
}
