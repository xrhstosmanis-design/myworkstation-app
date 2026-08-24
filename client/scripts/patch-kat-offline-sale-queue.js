import fs from "fs";

const path=new URL("../src/components/store/StorePosPanel.jsx",import.meta.url);
let src=fs.readFileSync(path,"utf8");
const marker="KAT_OFFLINE_SALE_QUEUE_V1";
if(src.includes(marker)){
  console.log("KAT offline sale queue already installed.");
  process.exit(0);
}

const helperAnchor='const euro=value=>Number(value||0).toLocaleString("el-GR",{style:"currency",currency:"EUR"});';
if(!src.includes(helperAnchor))throw new Error("KAT offline sale queue anchor missing: euro helper");
const helpers=`${helperAnchor}\nconst ${marker}=true;\nconst offlineSaleQueueKey=storeId=>\`myworkstation:offline-pos-sales:\${storeId}\`;\nconst readOfflineSaleQueue=storeId=>{try{const rows=JSON.parse(localStorage.getItem(offlineSaleQueueKey(storeId))||"[]");return Array.isArray(rows)?rows:[]}catch{return[]}};\nconst writeOfflineSaleQueue=(storeId,rows)=>{try{localStorage.setItem(offlineSaleQueueKey(storeId),JSON.stringify(rows))}catch{}};\nconst queueOfflineCashSale=(storeId,payload)=>{const rows=readOfflineSaleQueue(storeId),id=(globalThis.crypto?.randomUUID?.()||\`offline-\${Date.now()}-\${Math.random().toString(16).slice(2)}\`),row={id,createdAt:new Date().toISOString(),state:"PENDING",...payload};rows.push(row);writeOfflineSaleQueue(storeId,rows);return row;};`;
src=src.replace(helperAnchor,helpers);

const checkoutStart=src.indexOf('  const checkout=async(paymentMethod,payments)=>{');
const checkoutEnd=src.indexOf('  const restoreHold=',checkoutStart);
if(checkoutStart<0||checkoutEnd<0)throw new Error("KAT offline sale queue anchor missing: checkout block");
let checkout=src.slice(checkoutStart,checkoutEnd);
const catchAnchor='}catch(err){setError(err.message)}finally{setBusy(false)}};\n';
if(!checkout.includes(catchAnchor))throw new Error("KAT offline sale queue anchor missing: checkout catch");
const catchReplacement='}catch(err){const networkFailure=!navigator.onLine||/fetch|network|load failed|failed to fetch/i.test(String(err?.message||""));if(networkFailure&&paymentMethod==="CASH"&&!cart.some(row=>row.exchangeReturn)){const offline=queueOfflineCashSale(store.id,{operatorId:operator?.id||null,operatorName:operator?.fullName||null,customerId:customer?.id||null,total:Number(total.toFixed(2)),request:{paymentMethod:"CASH",payments:[{method:"CASH",amount:Number(total.toFixed(2))}],customerId:customer?.id||null,items:cart.map(row=>({productId:row.id,quantity:row.quantity,unitPriceOverride:row.manualPrice?Number(row.salePrice):null,overrideReason:row.manualPrice?(row.priceReason||"Χειροκίνητη αλλαγή τιμής"):null}))}});clearCart();setMessage(`OFFLINE: Η πώληση ${euro(offline.total)} αποθηκεύτηκε τοπικά με κωδικό ${offline.id.slice(0,8)}. Δεν θα σταλεί αυτόματα χωρίς ασφαλή επιβεβαίωση idempotency.`);setError("")}else if(networkFailure){setError("Offline: επιτρέπεται προσωρινά μόνο ασφαλής αποθήκευση πώλησης ΜΕΤΡΗΤΩΝ. Κάρτα/IRIS/αλλαγές παραμένουν μπλοκαρισμένες.")}else setError(err.message)}finally{setBusy(false)}};\n';
checkout=checkout.replace(catchAnchor,catchReplacement);
src=src.slice(0,checkoutStart)+checkout+src.slice(checkoutEnd);

fs.writeFileSync(path,src);
console.log("KAT offline cash sale queue installed; sync remains intentionally gated.");
