// Explicit DAILY identities, verified against the selected store catalogue.
// Filter/small freddo dose and prepared hot tea confirmed by the owner 13 Oct 2026.
// Unknown instant doses, packaged tea, water packs and other stores are excluded.
export const DAILY_REGULATED_COMPANY_ID = 'cmv25lf0w000seegf1cn4bbmx';
export const DAILY_REGULATED_STORE_ID = 'cmv25lf3h000ueegf0kkii3pb';
export const DAILY_REGULATED_PRODUCTS = Object.freeze([
  Object.freeze({id:'b477e570-8429-43b9-a850-d05901518410',sku:'DB000026',maxPrice:1.65}),
  Object.freeze({id:'a53d6709-1222-43d0-9f41-a04cb72fb040',sku:'DB000022',maxPrice:1.40}),
  Object.freeze({id:'256a249b-098e-43f9-8ed2-a20506a99ba7',sku:'DB000021',maxPrice:1.50}),
  Object.freeze({id:'8c3740aa-26ad-428e-a98f-e0c33965d5ce',sku:'DB000002',maxPrice:1.65}),
  Object.freeze({id:'a7725f35-76a7-412e-9d56-53ac15ac4f8c',sku:'DB000017',maxPrice:1.50}),
]);
const caps = new Map(DAILY_REGULATED_PRODUCTS.map(row=>[row.id,row.maxPrice]));

export function dailyRegulatedPriceCap(scope,product){
  if(scope?.companyId!==DAILY_REGULATED_COMPANY_ID || scope?.storeId!==DAILY_REGULATED_STORE_ID) return null;
  return caps.get(product?.id) ?? null;
}

// The store's unrelated surcharge rule remains intact. Only the five explicit
// products are exempt, with a ceiling even if their saved retail price is stale.
export function applyDailyRegulatedOnlinePrice(storePrice,legacyOnlinePrice,scope,product){
  const cap=dailyRegulatedPriceCap(scope,product);
  if(cap===null) return legacyOnlinePrice;
  const base=Number(storePrice);
  if(!Number.isFinite(base) || base<0) throw new Error('Μη έγκυρη τιμή διατιμημένου είδους.');
  return Math.min(Math.round(base*100)/100,cap);
}
