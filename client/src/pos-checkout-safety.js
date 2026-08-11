const pending=new Map();
const TTL_MS=2*60*1000;
let installed=false;

const makeUuid=()=>globalThis.crypto?.randomUUID?.()||`xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx`.replace(/[xy]/g,c=>{const r=Math.random()*16|0,v=c==="x"?r:(r&3|8);return v.toString(16)});
const stableKey=body=>JSON.stringify({items:body?.items||[],customerId:body?.customerId||null,paymentMethod:body?.paymentMethod||null,payments:body?.payments||null});
const cleanExpired=()=>{const now=Date.now();for(const [key,value] of pending)if(now-value.createdAt>TTL_MS)pending.delete(key)};

export function installPosCheckoutSafety(){
  if(installed||globalThis.__mwsPosCheckoutSafetyInstalled)return;
  installed=true;globalThis.__mwsPosCheckoutSafetyInstalled=true;
  const nativeFetch=globalThis.fetch.bind(globalThis);
  globalThis.fetch=async(input,init={})=>{
    const url=typeof input==="string"?input:String(input?.url||"");
    const method=String(init?.method||input?.method||"GET").toUpperCase();
    if(method!=="POST"||!/^\/api\/store-pos\/stores\/[^/]+\/checkout(?:\?|$)/.test(url))return nativeFetch(input,init);
    let body;try{body=JSON.parse(String(init.body||"{}"))}catch{return nativeFetch(input,init)}
    cleanExpired();const key=stableKey(body);let entry=pending.get(key);if(!entry){entry={id:makeUuid(),createdAt:Date.now(),inFlight:0};pending.set(key,entry)}entry.inFlight++;
    const send=async confirmDuplicate=>{
      const nextBody={...body,clientTransactionId:entry.id,confirmDuplicate:Boolean(confirmDuplicate)};
      return nativeFetch(input,{...init,body:JSON.stringify(nextBody)});
    };
    try{
      let response=await send(false);
      if(response.status===409){
        const detail=await response.clone().json().catch(()=>({}));
        if(detail?.code==="DUPLICATE_SIMILAR_SALE"){
          const accepted=globalThis.confirm?.(`${detail.error||"Πιθανή διπλή πώληση."}\n\nΘέλεις να καταχωρηθεί ως νέα πραγματική πώληση;`);
          if(accepted)response=await send(true);
        }
      }
      if(response.ok)pending.delete(key);
      return response;
    }catch(error){entry.createdAt=Date.now();throw error}
    finally{entry.inFlight=Math.max(0,entry.inFlight-1)}
  };
}
