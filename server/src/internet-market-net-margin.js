// Product cost is net; catalog/store retail includes the product VAT.
// Keep this read-only metric on the same basis as the inventory archive.
export function internetNetMargin(costValue,saleValue,vatValue){
 if([costValue,saleValue,vatValue].some(x=>x==null||x===""))return null;
 const cost=Number(costValue),sale=Number(saleValue),vat=Number(vatValue);
 if(![cost,sale,vat].every(Number.isFinite)||cost<=0||sale<=0||vat<0||vat>100)return null;
 const saleNet=sale/(1+vat/100);
 return Number((((saleNet-cost)/saleNet)*100).toFixed(2));
}
