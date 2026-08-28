const queueKey=storeId=>`myworkstation:offline-pos-sales:${storeId}`;
const historyKey=storeId=>`myworkstation:offline-pos-history:${storeId}`;
const locks=new Set();

const parseRows=(storage,key)=>{try{const rows=JSON.parse(storage.getItem(key)||"[]");return Array.isArray(rows)?rows:[]}catch{return[]}};
const persist=(storage,key,rows)=>{try{storage.setItem(key,JSON.stringify(rows));return true}catch{return false}};
const uuid=()=>globalThis.crypto?.randomUUID?.()||"10000000-1000-4000-8000-100000000000".replace(/[018]/g,c=>(Number(c)^globalThis.crypto.getRandomValues(new Uint8Array(1))[0]&15>>Number(c)/4).toString(16));

export const readOfflineSaleQueue=(storeId,storage=globalThis.localStorage)=>parseRows(storage,queueKey(storeId));
export const readOfflineSaleHistory=(storeId,storage=globalThis.localStorage)=>parseRows(storage,historyKey(storeId));
export const writeOfflineSaleQueue=(storeId,rows,storage=globalThis.localStorage)=>persist(storage,queueKey(storeId),rows);

export function queueOfflineCashSale(storeId,payload,{storage=globalThis.localStorage,id=uuid(),now=()=>new Date()}={}){
  const rows=readOfflineSaleQueue(storeId,storage);
  const row={id,createdAt:now().toISOString(),state:"PENDING",attempts:0,...payload,request:{...(payload.request||{}),clientTransactionId:id}};
  rows.push(row);
  if(!writeOfflineSaleQueue(storeId,rows,storage))throw new Error("Δεν ήταν δυνατή η ασφαλής τοπική αποθήκευση της offline πώλησης.");
  return row;
}

export async function syncOfflineSales({storeId,send,storage=globalThis.localStorage,online=()=>true,now=()=>new Date()}){
  if(!online()||locks.has(storeId))return {skipped:true,synced:0,pending:readOfflineSaleQueue(storeId,storage).length};
  locks.add(storeId);
  try{
    const pending=readOfflineSaleQueue(storeId,storage),remaining=[],history=readOfflineSaleHistory(storeId,storage);let synced=0;
    for(const row of pending){
      const attemptedAt=now().toISOString();
      try{
        const result=await send(row.request,row);
        if(!result?.saleId)throw new Error("Δεν επιστράφηκε saleId");
        history.push({...row,state:"SYNCED",saleId:result.saleId,idempotentReplay:Boolean(result.idempotentReplay),attempts:Number(row.attempts||0)+1,lastAttemptAt:attemptedAt,syncedAt:attemptedAt});
        synced+=1;
      }catch(error){remaining.push({...row,state:"FAILED",attempts:Number(row.attempts||0)+1,lastError:String(error?.message||error),lastAttemptAt:attemptedAt})}
    }
    if(!writeOfflineSaleQueue(storeId,remaining,storage))throw new Error("Η offline ουρά δεν ενημερώθηκε με ασφάλεια.");
    if(!persist(storage,historyKey(storeId),history.slice(-500)))throw new Error("Το ιστορικό offline συγχρονισμού δεν αποθηκεύτηκε.");
    return {skipped:false,synced,pending:remaining.length,failed:remaining.length};
  }finally{locks.delete(storeId)}
}

export const offlineSaleQueueInternals={queueKey,historyKey,locks};
