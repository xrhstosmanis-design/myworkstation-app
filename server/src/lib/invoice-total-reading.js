const fold=value=>String(value||"")
  .normalize("NFD")
  .replace(/[\u0300-\u036f]/g,"")
  .toLocaleUpperCase("el-GR")
  .replace(/[^A-ZΑ-Ω0-9.,]+/g," ")
  .replace(/\s+/g," ")
  .trim();

const money=value=>{
  const text=String(value||"").replace(/\s/g,"");
  const comma=text.lastIndexOf(","),dot=text.lastIndexOf(".");
  const decimal=Math.max(comma,dot);
  if(decimal<0)return 0;
  const whole=text.slice(0,decimal).replace(/[.,]/g,"");
  const fraction=text.slice(decimal+1).replace(/\D/g,"").slice(0,2);
  const parsed=Number(`${whole||"0"}.${fraction.padEnd(2,"0")}`);
  return Number.isFinite(parsed)?Math.round((parsed+Number.EPSILON)*100)/100:0;
};

// MANTZILAS prints both the current invoice and the customer's running account
// balance in the same footer. Only the VAT-analysis TOTALS row proves the
// invoice amount: net + VAT = gross. Do not infer a value when that printed
// three-number equation is absent or does not balance to the cent.
export function recoverVatSummaryInvoiceTotal(rawText){
  const text=fold(rawText);
  const analysis=text.indexOf("ΑΝΑΛΥΣΗ ΥΠΟΛΟΓΙΣΜΟΥ");
  if(analysis<0)return 0;
  const section=text.slice(analysis,analysis+3000);
  const marker=/ΣΥΝΟΛ(?:Α|O)/g;
  let found;
  while((found=marker.exec(section))){
    const tail=section.slice(found.index+found[0].length,found.index+found[0].length+260);
    const values=[...tail.matchAll(/(?:\d{1,3}(?:[. ]\d{3})+|\d+)[,.]\d{2}/g)].map(match=>money(match[0])).filter(value=>value>0).slice(0,9);
    for(let index=0;index+2<values.length;index++){
      const [net,vat,gross]=values.slice(index,index+3);
      if(Math.abs(net+vat-gross)<=0.011)return gross;
    }
  }
  return 0;
}
