const n=value=>Number(value||0);
const money=value=>n(value).toLocaleString("el-GR",{style:"currency",currency:"EUR"});
const num=value=>n(value).toLocaleString("el-GR",{maximumFractionDigits:3});
const events=new Set(["PURCHASE_ORDER_DRAFT_CREATED","PURCHASE_ORDER_DRAFT_UPDATED","PURCHASE_ORDER_LINE_ADDED","PURCHASE_ORDER_LINE_DELETED","INVOICE_LINE_CORRECTED"]);
const unit=value=>value==="PACKAGE"?"ΚΒ / συσκευασία":"ΤΜΧ";
const lineSummary=line=>{if(!line||typeof line!=="object")return"—";const discounts=[line.discount1,line.discount2,line.discount3].map(value=>`${num(value)}%`).join(" / ");return `${line.description||line.supplierCode||"Γραμμή"}${line.supplierCode?` (${line.supplierCode})`:""} · Ποσ.: ${num(line.quantity)} ${unit(line.invoiceUnit)}${line.invoiceUnit==="PACKAGE"?` × ${num(line.stockUnitsPerInvoiceUnit)} ΤΜΧ`:""} · Αρχική: ${money(line.unitCost)} · Εκπτ.1/2/3: ${discounts} · Καθαρή: ${money(line.netAmount)} · ΦΠΑ: ${num(line.vatRate)}% / ${money(line.vatAmount)} · Σύνολο: ${money(line.grossAmount)}`};

export function invoiceAuditFinancialText(event){
  if(!events.has(event?.eventType))return null;
  const details=event.financialDetails&&typeof event.financialDetails==="object"?event.financialDetails:{};
  const stock=details.stockChanged===false?"Stock: αμετάβλητο":"Stock: ελέγξτε την καταγραφή";
  const invoice=details.invoiceNumber?`Παραστατικό: ${details.invoiceNumber}`:"Παραστατικό: —";
  if(event.eventType==="PURCHASE_ORDER_DRAFT_CREATED")return `${invoice} · Πρόχειρο δημιουργήθηκε · ${stock}`;
  if(event.eventType==="PURCHASE_ORDER_DRAFT_UPDATED"){
    const before=details.before||{},after=details.after||{};
    const labels={supplierId:"Προμηθευτής",invoiceNumber:"Παραστατικό",description:"Περιγραφή",status:"Κατάσταση"};
    const changes=Object.keys(labels).filter(key=>String(before[key]??"")!==String(after[key]??"")).map(key=>`${labels[key]}: ${before[key]||"—"} → ${after[key]||"—"}`);
    return `${invoice} · ${changes.join(" · ")||"Χωρίς αλλαγή πεδίων"} · ${stock}`;
  }
  if(event.eventType==="PURCHASE_ORDER_LINE_ADDED")return `${invoice} · Προσθήκη: ${lineSummary(details.line)} · ${stock}`;
  if(event.eventType==="PURCHASE_ORDER_LINE_DELETED")return `${invoice} · Διαγραφή: ${lineSummary(details.line)} · ${stock}`;
  return `${invoice} · Πριν: ${lineSummary(details.before)} · Μετά: ${lineSummary(details.after)} · Εκμάθηση προμηθευτή: ${details.supplierMappingLearned?"ναι":"όχι"} · ${stock}`;
}
