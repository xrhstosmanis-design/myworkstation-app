const fold=value=>String(value||"").normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase();
function amount(raw){
 const parts=raw.split(/[.,]/);
 if(parts.length===1)return Number(raw);
 const comma=raw.includes(","),dot=raw.includes(".");
 if(comma&&dot){
  const decimal=raw.lastIndexOf(",")>raw.lastIndexOf(".")?",":".";
  const split=raw.split(decimal);if(split.length!==2||split[1].length>2)return NaN;
  const groups=split[0].split(decimal===","?".":",");
  if(groups.length>1&&!groups.slice(1).every(x=>x.length===3))return NaN;
  return Number(groups.join("")+"."+split[1]);
 }
 if(parts.length===2&&parts[1].length<=2)return Number(parts.join("."));
 if(parts.slice(1).every(x=>x.length===3))return Number(parts.join(""));
 return NaN;
}
// Search snippets may contain €/litre, old prices, shipping and several offers.
// An exact barcode confirms identity; it cannot make an ambiguous amount safe.
export function internetItemPrice(value){
 const text=String(value||""),prices=[];let unitRates=0;
 const money=/(?<![\d.,])(?:(?:€|EUR)\s*(\d+(?:[.,]\d+)*)|(\d+(?:[.,]\d+)*)\s*(?:€|EUR))/giu;
 for(const match of text.matchAll(money)){
  const before=fold(text.slice(Math.max(0,match.index-50),match.index)),after=fold(text.slice(match.index+match[0].length,match.index+match[0].length+65));
  if(/^(?:\s*)(?:\/|ανα\s+|per\s+)\s*(?:\d+(?:[.,]\d+)?\s*)?(?:ml\b|cl\b|l\b|lt\b|lit(?:er|re)|λιτρ|kg\b|kgr\b|g\b|gr\b|κιλ|γραμμ|τεμ|τμχ|pieces?\b|units?\b)/iu.test(after)){unitRates++;continue}
  if(/(?:παλια τιμη|αρχικη τιμη|old price|regular price|was|shipping|μεταφορικα)\s*[:=-]?\s*$/iu.test(before))continue;
  const price=amount(match[1]||match[2]);if(Number.isFinite(price)&&price>0&&price<100000)prices.push(price);
 }
 const unique=[...new Set(prices)];
 if(unique.length===1)return {price:unique[0],priceReason:null};
 return {price:null,priceReason:unique.length>1?"AMBIGUOUS_PRICE":unitRates?"UNIT_RATE_ONLY":"NO_ITEM_PRICE"};
}
