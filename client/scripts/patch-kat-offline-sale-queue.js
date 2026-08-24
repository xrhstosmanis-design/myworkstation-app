import fs from "fs";

const path=new URL("../src/components/store/StorePosPanel.jsx",import.meta.url);
let src=fs.readFileSync(path,"utf8");
const marker="KAT_OFFLINE_SALE_QUEUE_V2";
if(src.includes(marker)){
  console.log("KAT offline sale queue v2 already installed.");
  process.exit(0);
}

const helperAnchor='const euro=value=>Number(value||0).toLocaleString("el-GR",{style:"currency",currency:"EUR"});';
if(!src.includes(helperAnchor))throw new Error("KAT offline sale queue anchor missing: euro helper");
const helpers=`${helperAnchor}\nconst ${marker}=true;\nconst offlineSaleQueueKey=storeId=>\`myworkstation:offline-pos-sales:\${storeId}\`;\nconst readOfflineSaleQueue=storeId=>{try{const rows=JSON.parse(localStorage.getItem(offlineSaleQueueKey(storeId))||"[]");return Array.isArray(rows)?rows:[]}catch{return[]}};\nconst writeOfflineSaleQueue=(storeId,rows)=>{try{localStorage.setItem(offlineSaleQueueKey(storeId),JSON.stringify(rows))}catch{}};\nconst queueOfflineCashSale=(storeId,payload)=>{const rows=readOfflineSaleQueue(storeId),id=(globalThis.crypto?.randomUUID?.()||\`offline-\${Date.now()}-\${Math.random().toString(16).slice(2)}\`),row={id,createdAt:new Date().toISOString(),state:"PENDING",...payload,request:{...(payload.request||{}),clientTransactionId:id}};rows.push(row);writeOfflineSaleQueue(storeId,rows);return row;};`;
src=src.replace(helperAnchor,helpers);

const checkoutStart=src.indexOf('  const checkout=async(paymentMethod,payments)=>{');
const checkoutEnd=src.indexOf('  const restoreHold=',checkoutStart);
if(checkoutStart<0||checkoutEnd<0)throw new Error("KAT offline sale queue anchor missing: checkout block");
let checkout=src.slice(checkoutStart,checkoutEnd);
const catchAnchor='}catch(err){setError(err.message)}finally{setBusy(false)}};\n';
if(!checkout.includes(catchAnchor))throw new Error("KAT offline sale queue anchor missing: checkout catch");
const catchReplacement='}catch(err){const networkFailure=!navigator.onLine||/fetch|network|load failed|failed to fetch/i.test(String(err?.message||""));if(networkFailure&&paymentMethod==="CASH"&&!cart.some(row=>row.exchangeReturn)){const offline=queueOfflineCashSale(store.id,{operatorId:operator?.id||null,operatorName:operator?.fullName||null,customerId:customer?.id||null,total:Number(total.toFixed(2)),request:{paymentMethod:"CASH",payments:[{method:"CASH",amount:Number(total.toFixed(2))}],customerId:customer?.id||null,items:cart.map(row=>({productId:row.id,quantity:row.quantity,unitPriceOverride:Number(row.salePrice||0),overrideReason:"OFFLINE_POS_LOCKED_PRICE"}))}});clearCart();setMessage(`OFFLINE: Η πώληση ${euro(offline.total)} αποθηκεύτηκε τοπικά με κωδικό ${offline.id.slice(0,8)} και θα συγχρονιστεί με ασφάλεια όταν επανέλθει το Internet.`);setError("")}else if(networkFailure){setError("Offline: επιτρέπεται μόνο πώληση ΜΕΤΡΗΤΩΝ. Κάρτα/IRIS/μικτή πληρωμή/επιστροφές παραμένουν μπλοκαρισμένες μέχρι να επανέλθει το Internet.")}else setError(err.message)}finally{setBusy(false)}};\n';
checkout=checkout.replace(catchAnchor,catchReplacement);
src=src.slice(0,checkoutStart)+checkout+src.slice(checkoutEnd);

const layoutAnchor='  const layout=data?.layout||fallbackLayout,products=data?.products||[],titleMeta=decodeTitle(layout.title);';
if(!src.includes(layoutAnchor))throw new Error("KAT offline sale queue anchor missing: layout");
const syncBlock=`  const flushOfflineSales=async()=>{\n    if(!navigator.onLine)return;\n    const pending=readOfflineSaleQueue(store.id);if(!pending.length)return;\n    const remaining=[];let synced=0;\n    for(const row of pending){\n      try{const result=await api(\`/api/store-pos/stores/\${store.id}/checkout\`,{method:"POST",body:JSON.stringify(row.request)});if(result?.saleId)synced+=1;else remaining.push({...row,lastError:"Δεν επιστράφηκε saleId"})}\n      catch(err){remaining.push({...row,lastError:String(err?.message||err),lastAttemptAt:new Date().toISOString()})}\n    }\n    writeOfflineSaleQueue(store.id,remaining);\n    if(synced){setMessage(\`Συγχρονίστηκαν με ασφάλεια \${synced} offline πωλήσεις. Εκκρεμούν \${remaining.length}.\`);onChanged?.();await load()}\n  };\n  useEffect(()=>{const run=()=>flushOfflineSales().catch(()=>{});if(navigator.onLine)run();window.addEventListener("online",run);const timer=setInterval(()=>{if(navigator.onLine)run()},30000);return()=>{window.removeEventListener("online",run);clearInterval(timer)}},[store.id]);\n${layoutAnchor}`;
src=src.replace(layoutAnchor,syncBlock);

fs.writeFileSync(path,src);
console.log("KAT offline cash sale queue with idempotent reconnect sync installed.");
