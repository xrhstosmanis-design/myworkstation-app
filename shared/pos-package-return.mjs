// Exact money and base-stock planning shared by POS and server validation.
// Money is always integer cents; a package is a distinct sale product.
const invalid=message=>{throw new RangeError(message)};
const quantity=value=>{
 const n=Number(value);
 if(!Number.isFinite(n)||n<=0||n>999999||Math.abs(n*1000-Math.round(n*1000))>0.000001)invalid('Μη έγκυρη ποσότητα.');
 return n;
};
export function moneyCents(value){
 const n=Number(value);
 if(value===null||value===''||!Number.isFinite(n)||n<0||n>999999||Math.abs(n*100-Math.round(n*100))>0.000001)invalid('Το ποσό πρέπει να έχει έως δύο δεκαδικά.');
 return Math.round(n*100);
}
export function packageStockLine({productId,baseProductId,unitsPerPackage,quantity:count,storePrice}){
 if(!productId||!baseProductId||productId===baseProductId)invalid('Η συσκευασία χρειάζεται διαφορετικό βασικό είδος.');
 const units=Number(unitsPerPackage);
 if(!Number.isSafeInteger(units)||units<2||units>100000)invalid('Συμπλήρωσε ακέραιο πλήθος τεμαχίων συσκευασίας.');
 const packs=quantity(count);
 if(!Number.isSafeInteger(packs))invalid('Η ποσότητα συσκευασιών πρέπει να είναι ακέραιη.');
 const unitCents=moneyCents(storePrice),totalCents=unitCents*packs,stockQuantity=units*packs;
 if(!Number.isSafeInteger(totalCents)||!Number.isSafeInteger(stockQuantity))invalid('Η ποσότητα ή η αξία είναι πολύ μεγάλη.');
 return {productId,baseProductId,quantity:packs,unitsPerPackage:units,stockQuantity,unitCents,totalCents};
}
export function scannedCashReturnPlan(lines){
 if(!Array.isArray(lines)||!lines.length||lines.length>200)invalid('Σκάναρε τα προϊόντα που επιστρέφονται.');
 const stock=new Map();let refundCents=0;
 const items=lines.map(line=>{
  if(!line.productId)invalid('Λείπει το είδος επιστροφής.');
  const count=quantity(line.quantity),unitCents=moneyCents(line.storePrice);
  const milli=Math.round(count*1000),numerator=unitCents*milli;if(!Number.isSafeInteger(numerator)||numerator>Number.MAX_SAFE_INTEGER-500)invalid("Η αξία είναι πολύ μεγάλη.");
  let stockProductId=line.productId,stockQuantity=count,totalCents=Math.floor((numerator+500)/1000);
  if(line.baseProductId){const pack=packageStockLine({...line,quantity:count});stockProductId=pack.baseProductId;stockQuantity=pack.stockQuantity;totalCents=pack.totalCents;}
  if(line.trackStock!==false)stock.set(stockProductId,Number(((stock.get(stockProductId)||0)+stockQuantity).toFixed(3)));
  refundCents+=totalCents;
  if(!Number.isSafeInteger(refundCents))invalid('Το ποσό επιστροφής είναι πολύ μεγάλο.');
  return {productId:line.productId,quantity:count,unitCents,totalCents,stockProductId,stockQuantity:line.trackStock===false?0:stockQuantity};
 });
 if(refundCents<=0)invalid('Δεν υπάρχει θετικό ποσό επιστροφής.');
 return {items,refundCents,cashDeltaCents:-refundCents,cardDeltaCents:0,stock:[...stock].map(([productId,quantity])=>({productId,quantity}))};
}
