export function verifiedSetUnit(line,stockRules){
  if(!/^(?:ΣΕΤ|SET)$/i.test(String(line.invoiceUnit||"").trim()))return line;
  const rule=stockRules.find(item=>item.supplierCode===String(line.supplierCode||"").trim()&&Number.isInteger(item.piecesPerPackage)&&item.piecesPerPackage>0);
  const count=String(line.description||"").match(/(?:^|[^\d])(\d{1,2})\s*[XΧ×]\s*\d+\s*(?:ML|ΜΛ|G|GR|ΓΡ)(?:$|[^\p{L}])/iu);
  const inferred=count?Number(count[1]):0;
  const factor=rule?.piecesPerPackage||(inferred>=2&&inferred<=24?inferred:0);
  const reason=rule?"":factor?`Πρόταση αποθήκης από την ονομασία: 1 ΣΕΤ = ${factor} τεμάχια. Επιβεβαίωσε πριν την εφαρμογή.`:"Χρειάζεται επιβεβαίωση τεμαχίων ανά ΣΕΤ για την αποθήκη.";
  return {...line,invoiceUnit:"PACKAGE",stockUnitsPerInvoiceUnit:factor?String(factor):"",confidence:rule?line.confidence:"uncertain",reviewReason:[line.reviewReason,reason].filter(Boolean).join(" ").slice(0,300)};
}
