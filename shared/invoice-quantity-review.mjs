export function invoiceQuantityConfirmation(rows,printedQuantity,{confirmed=false,selectedCount=0}={}){
  const value=String(printedQuantity??"").trim();
  const readable=/^\d+(?:[.,]\d+)?$/.test(value);
  const quantities=rows.map(row=>String(row.quantity??"").trim());
  const valid=quantities.length>0&&quantities.every(q=>q!==""&&Number.isFinite(Number(q.replace(",",".")))&&Number(q.replace(",","."))>0);
  const sum=quantities.reduce((total,q)=>total+Number(q.replace(",",".")),0);
  const required=readable&&(!valid||Math.abs(sum-Number(value.replace(",",".")))>0.001);
  return {required,sum,allowed:!required||valid&&confirmed===true&&selectedCount===rows.length};
}
