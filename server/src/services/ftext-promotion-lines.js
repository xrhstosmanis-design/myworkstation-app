// Only server-resolved checkout items enter this projection. No offer lookup or
// client price is trusted here, and no fiscal command or business write occurs.
const fail=()=>{throw Object.assign(new Error('Η τελική αξία της προσφοράς δεν συμφωνεί με το αρχικό καλάθι. Απαιτείται έλεγχος.'),{code:'FTEXT_PROMOTION_MISMATCH',status:409})};
function scaled(value,places){
 const s=typeof value==='number'&&Number.isFinite(value)?String(value):value;
 if(typeof s!=='string'||!new RegExp(`^(0|[1-9]\\d{0,8})(?:\\.\\d{1,${places}})?$`).test(s))fail();
 const [a,b='']=s.split('.');return BigInt(a)*10n**BigInt(places)+BigInt(b.padEnd(places,'0'));
}
const cents=v=>scaled(v,2);
const decimal=n=>`${n/100n}.${String(n%100n).padStart(2,'0')}`;
export const hasFtextPromotion=items=>items.some(i=>Boolean(i.promotionId||i.promotionType));
export function supportedFtextPromotion(item){
 return typeof item.promotionId==='string'&&Boolean(item.promotionId.trim())&&['LEAFLET','GIFT'].includes(item.promotionType)&&item.priceSource===item.promotionType;
}
export function projectFtextPromotionItems(items,summary){
 if(!hasFtextPromotion(items))return items.map(i=>({...i,unitPrice:i.effectiveUnitPrice}));
 let subtotal4=0n,discountSum=0n,totalSum=0n;
 const projected=[];
 for(const item of items){
  const quantity=Number(item.quantity);
  if(!Number.isSafeInteger(quantity)||quantity<1||quantity>999999999)fail();
  const qty=BigInt(quantity),discount=cents(item.discount??0),total=cents(item.lineTotal);
  const promo=Boolean(item.promotionId||item.promotionType);
  if(promo&&!supportedFtextPromotion(item)||!promo&&discount!==0n)fail();
  // Original retail price is retained separately from the rounded effective
  // price. Subtract the discount exactly once, never from that effective price.
  const original4=scaled(item.unitPrice??item.effectiveUnitPrice,4);
  const gross=(qty*original4+50n)/100n;
  if(discount>gross||gross-discount!==total)fail();
  if(promo&&cents(item.effectiveUnitPrice)!==(total+qty/2n)/qty)fail();
  subtotal4+=qty*original4;discountSum+=discount;totalSum+=total;
  if(!promo){projected.push({...item,unitPrice:item.effectiveUnitPrice});continue;}
  // At most two integer-quantity, zero-discount lines represent the exact final
  // cents. Same product/department/VAT; quantities and line totals conserved.
  const low=total/qty,remainder=total%qty;
  for(const [q,price]of [[qty-remainder,low],[remainder,low+1n]])if(q>0n)projected.push({...item,quantity:Number(q),unitPrice:decimal(price),discount:0,lineTotal:decimal(q*price)});
 }
 const subtotal=(subtotal4+50n)/100n;
 if(cents(summary?.subtotal)!==subtotal||cents(summary?.discount)!==discountSum||cents(summary?.total)!==totalSum||subtotal-discountSum!==totalSum)fail();
 if(projected.length>400)fail();
 return projected;
}
