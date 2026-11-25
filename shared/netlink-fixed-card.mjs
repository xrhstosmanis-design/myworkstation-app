export const NETLINK_SERVICE_CENTS=50;
export function netlinkPaidError(code,message,status=409){return Object.assign(new Error(message),{code,status})}
const reject=(code,message)=>{throw netlinkPaidError(code,message)};
export function moneyCents(value){
 if(value===null||value===undefined||value==='')reject('NETLINK_AMOUNT_INVALID','Μη έγκυρο ποσό Netlink.');
 const n=Number(value),c=Math.round(n*100);
 if(!Number.isFinite(n)||!Number.isSafeInteger(c)||c<0||Math.abs(n-c/100)>0.0000001)reject('NETLINK_AMOUNT_INVALID','Μη έγκυρο ποσό Netlink.');
 return c;
}
export function fixedCardFromMenu(menu,productId){
 const root=menu?.data?.data??menu?.data??menu;
 const groups=Array.isArray(root?.groups)?root.groups:Array.isArray(root?.tabs)?root.tabs.filter(t=>t?.disabled!==true).flatMap(t=>t.groups||[]):[];
 const matches=groups.filter(g=>g?.disabled!==true).flatMap(g=>g.products||[]).filter(p=>p?.disabled!==true&&String(p.productId??p.id)===String(productId));
 if(!matches.length)reject('NETLINK_PRODUCT_UNAVAILABLE','Η κάρτα δεν είναι διαθέσιμη στον κατάλογο.');
 let result;
 for(const p of matches){
  if(p.flow!=='execute'||Object.keys(p.payload?.properties||{}).length||p.payload?.required?.length)reject('NETLINK_FIXED_CARD_REQUIRED','Η υπηρεσία αυτή δεν είναι κάρτα σταθερής αξίας.');
  const title=String(p.title??p.name??''),prices=[...title.matchAll(/(\d+(?:[.,]\d{1,2})?)\s*(?:€|EUR\b)/gi)].map(m=>moneyCents(m[1].replace(',','.')));
  const explicit=p.amount===undefined?null:moneyCents(p.amount);
  if(new Set(prices).size>1||explicit!==null&&prices.length&&prices.some(c=>c!==explicit))reject('NETLINK_PRICE_AMBIGUOUS','Η αξία της κάρτας χρειάζεται επιβεβαίωση.');
  const cents=explicit??prices[0];
  if(!Number.isSafeInteger(cents)||cents<=0||cents>99999900)reject('NETLINK_PRICE_AMBIGUOUS','Η αξία της κάρτας δεν δόθηκε καθαρά από τον κατάλογο.');
  const item={productId:String(p.productId??p.id),title,amountCents:cents};
  if(result&&(result.amountCents!==cents||result.title!==title))reject('NETLINK_PRICE_AMBIGUOUS','Ο κατάλογος περιέχει διαφορετικές αξίες για την ίδια κάρτα.');
  result=item;
 }
 return result;
}
