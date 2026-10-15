// Read-only presentation. Original ledger values and identifiers are preserved.
export const auditExtraLabels={STOCK_SALE:"Έξοδος αποθέματος από πώληση",STOCK_PURCHASE:"Παραλαβή αποθέματος από τιμολόγιο",STOCK_RETURN:"Επιστροφή στο απόθεμα",STOCK_RETURN_IN:"Επιστροφή στο απόθεμα",STOCK_RETURN_OUT:"Επιστροφή αποθέματος",STOCK_TRANSFER_IN:"Παραλαβή μεταφοράς αποθέματος",STOCK_TRANSFER_OUT:"Αποστολή μεταφοράς αποθέματος",STOCK_INITIAL:"Αρχικό απόθεμα",STOCK_OPENING:"Αρχικό απόθεμα",STOCK_ADJUSTMENT:"Διόρθωση αποθέματος",STOCK_PRODUCTION:"Παραγωγή προϊόντος",STOCK_CONSUMPTION:"Κατανάλωση αποθέματος"};
const has=v=>v!==null&&v!==undefined&&v!==""&&Number.isFinite(Number(v));
const money=v=>Number(v).toLocaleString("el-GR",{style:"currency",currency:"EUR"});
const number=v=>Number(v).toLocaleString("el-GR",{maximumFractionDigits:4});
const uuid=/\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi;
const opaque=/\b(?:pay_[a-z0-9]{25,}|c[a-z0-9]{24,})\b/gi;
export function auditBusinessText(value){return String(value??"").replace(uuid,"συνδεδεμένη εγγραφή").replace(opaque,"συνδεδεμένη εγγραφή").replace(/\bSTOCK SALE\b/g,auditExtraLabels.STOCK_SALE).replace(/\bSTOCK PURCHASE\b/g,auditExtraLabels.STOCK_PURCHASE).replace(/\bstock\b/gi,"απόθεμα").replace(/\bCASH\b/g,"Μετρητά").replace(/\bCARD\b/g,"Κάρτα").replace(/\bMIXED\b/g,"Μικτή πληρωμή").replace(/\bCREDIT\b/g,"Πίστωση").replace(/\bIN\b/g,"Είσοδος").replace(/\bOUT\b/g,"Έξοδος");}
export function auditActorName(row){const name=String(row.actorName||"").trim();return name&&!name.match(uuid)&&!name.match(opaque)?name:"Δεν καταγράφηκε όνομα χειριστή";}
export function auditReadableRecord(row){
 const d=row.financialDetails&&typeof row.financialDetails==="object"?row.financialDetails:{};
 const label=auditExtraLabels[row.eventType]||(/[Α-Ωα-ω]/.test(row.eventLabel||"")?row.eventLabel:"Άλλη καταγεγραμμένη κίνηση");
 const lines=Array.isArray(row.saleItems)?row.saleItems:Array.isArray(d.items)?d.items:[];
 const lineText=lines.map(l=>{const name=l.description||l.productName||l.name||"Δεν καταγράφηκε όνομα είδους",q=l.quantity,price=l.unitPrice??l.price,total=l.lineTotal??l.amount;return [name,has(q)?"Ποσότητα "+number(q):"",has(price)?"Τιμή "+money(price):"",has(total)?"Αξία "+money(total):"",has(l.discount)&&Number(l.discount)!==0?"Έκπτωση "+money(l.discount):""].filter(Boolean).join(" · ")}).join("\n");
 const stock=row.sourceType==="StockMovement",product=d.productName||d.name,qty=d.newQuantity??d.quantity,reason=d.reason||d.note||row.reversalReason||"";
 let description=stock?[label,product||"Δεν καταγράφηκε όνομα είδους",has(d.quantity)?(Number(d.quantity)>=0?"Είσοδος ":"Έξοδος ")+number(Math.abs(Number(d.quantity)))+" τεμάχια":"",row.description?auditBusinessText(row.description):""].filter(Boolean).join(" · "):auditBusinessText(row.description||label);
 if(lineText)description+="\nΠροϊόντα:\n"+lineText;
 const parts=[];
 if(product)parts.push(product+(d.sku?" · Κωδικός "+d.sku:""));
 for(const [before,after,title,isMoney] of [[d.previousQuantity??d.oldQuantity,d.newQuantity,"Ποσότητα",false],[d.oldPrice??d.previousPrice,d.newPrice,"Τιμή",true],[d.previousAmount,d.newAmount,"Ποσό",true],[d.previousTotal??d.oldTotal,d.newTotal,"Αξία",true],[d.stockBefore??d.previousStock,d.stockAfter??d.newStock,"Απόθεμα",false]]){
  if(has(before)||has(after))parts.push(title+": "+(has(before)?(isMoney?money(before):number(before)):"Δεν καταγράφηκε")+" → "+(has(after)?(isMoney?money(after):number(after)):"Δεν καταγράφηκε"));
 }
 if(!parts.some(x=>x.startsWith("Ποσότητα:"))&&has(qty))parts.push((stock?"Μεταβολή αποθέματος: ":"Ποσότητα: ")+number(qty));
 if(Array.isArray(d.changes))for(const c of d.changes)parts.push((c.label||"Πεδίο")+": "+String(c.before??"Δεν καταγράφηκε")+" → "+String(c.after??"Δεν καταγράφηκε"));
 if(stock&&!has(d.stockBefore??d.previousStock)&&!has(d.stockAfter??d.newStock))parts.push("Απόθεμα πριν/μετά: δεν αποθηκεύτηκε στην αρχική κίνηση.");
 if(lineText)parts.push(lineText);
 return {...row,eventLabel:label,actorName:auditActorName(row),readableDescription:description,readableReason:reason?auditBusinessText(reason):null,readableFinancials:parts.length?parts.join("\n"):null};
}
