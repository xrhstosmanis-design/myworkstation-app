const amount=value=>Number(value||0);
const round2=value=>Number(amount(value).toFixed(2));

export function roundRetailToTenCents(value){
  return round2(Math.round((amount(value)+Number.EPSILON)*10)/10);
}

export function storePercentageOfferPrice(storeRetailPrice,discountPercent){
  const retail=amount(storeRetailPrice),discount=amount(discountPercent);
  if(retail<0||discount<0||discount>100)throw new Error("INVALID_PERCENTAGE_OFFER");
  return roundRetailToTenCents(retail*(1-discount/100));
}

export function storeAmountOfferPrice(storeRetailPrice,discountAmount){
  const retail=amount(storeRetailPrice),discount=amount(discountAmount);
  if(retail<0||discount<0)throw new Error("INVALID_AMOUNT_OFFER");
  return roundRetailToTenCents(Math.max(0,retail-discount));
}

export function calculateBundlePromotion({promotion,cartItems,selectedGiftQuantities={}}){
  const triggerProductId=String(promotion?.productId||"");
  const buyQuantity=amount(promotion?.saleQuantity);
  const giftQuantity=amount(promotion?.bonusQuantity);
  const baseDiscountPercent=amount(promotion?.discountPercent);
  const giftDiscountPercent=promotion?.giftDiscountPercent===undefined?100:amount(promotion.giftDiscountPercent);
  const allowedGiftProductIds=[...new Set((promotion?.giftProductIds||[]).map(String))];
  if(!triggerProductId||buyQuantity<=0||giftQuantity<=0||!allowedGiftProductIds.length)return {eligible:false,bundles:0,giftLimit:0,adjustments:[],reason:"INVALID_BUNDLE_PROMOTION"};

  const byId=new Map((cartItems||[]).map(item=>[String(item.productId),item]));
  const trigger=byId.get(triggerProductId),bundles=Math.floor(amount(trigger?.quantity)/buyQuantity),giftLimit=bundles*giftQuantity;
  if(!bundles)return {eligible:false,bundles:0,giftLimit:0,adjustments:[],reason:"TRIGGER_QUANTITY_MISSING"};

  let selectedTotal=0;
  const selected=[];
  for(const productId of allowedGiftProductIds){
    const item=byId.get(productId),requested=Math.max(0,Math.floor(amount(selectedGiftQuantities[productId])));
    if(requested>amount(item?.quantity))return {eligible:false,bundles,giftLimit,adjustments:[],reason:"GIFT_NOT_IN_CART"};
    if(requested){selected.push({productId,item,quantity:requested});selectedTotal+=requested}
  }
  if(selectedTotal>giftLimit)return {eligible:false,bundles,giftLimit,adjustments:[],reason:"GIFT_LIMIT_EXCEEDED"};

  const adjustments=[];
  if(baseDiscountPercent>0){
    const discountedQuantity=Math.min(amount(trigger.quantity),bundles*buyQuantity),unitPrice=amount(trigger.unitPrice??trigger.retailPrice);
    adjustments.push({kind:"BASE_DISCOUNT",productId:triggerProductId,quantity:discountedQuantity,discount:round2(unitPrice*discountedQuantity*baseDiscountPercent/100),discountPercent:baseDiscountPercent});
  }
  for(const gift of selected){
    const unitPrice=amount(gift.item.unitPrice??gift.item.retailPrice);
    adjustments.push({kind:"GIFT_DISCOUNT",productId:gift.productId,quantity:gift.quantity,discount:round2(unitPrice*gift.quantity*giftDiscountPercent/100),discountPercent:giftDiscountPercent});
  }
  return {eligible:true,bundles,giftLimit,selectedGiftQuantity:selectedTotal,remainingGiftQuantity:giftLimit-selectedTotal,adjustments};
}
