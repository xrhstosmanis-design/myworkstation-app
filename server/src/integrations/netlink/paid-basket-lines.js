import {moneyCents,netlinkPaidError} from './paid-issuance-contract.js';
const fail=()=>{throw netlinkPaidError('NETLINK_PAID_LINES_MISMATCH','Κάθε κάρτα πρέπει να έχει τη δική της αξία και παροχή0,50€ στην πληρωμένη απόδειξη.')};
// Allocate real receipt units to the immutable native checkout manifest. This
// prevents two intents from using the same paid value/fee line, including when
// the till aggregates identical services into a single quantity-N receipt row.
export function allocateNetlinkBasketLines(manifest,intents,lines,saleTotal){
 if(!Array.isArray(manifest)||!manifest.length||manifest.length>50||new Set(manifest).size!==manifest.length||intents.length!==manifest.length)fail();
 const byId=new Map(intents.map(i=>[i.requestId,i]));if(byId.size!==manifest.length||manifest.some(id=>!byId.has(id)))fail();
 const pool=lines.map((l,index)=>({...l,sourceLineId:l.id||String(index),remaining:Number(l.quantity),used:0})),result=new Map();let cardTotal=0;
 for(const id of [...manifest].sort()){
  const intent=byId.get(id);if(intent.status==='CANCELLED'||moneyCents(intent.serviceFeeAmount)!==50)fail();
  const amount=moneyCents(intent.amount);if(amount<=0||moneyCents(intent.customerTotal)!==amount+50)fail();cardTotal+=amount+50;
  const allocation=[];
  for(const [productId,cents] of [[intent.saleProductId,amount],[intent.serviceFeeProductId,50]]){
   const row=pool.find(l=>l.productId===productId&&l.remaining>=1&&Number.isInteger(Number(l.quantity))&&moneyCents(l.unitPrice)===cents&&moneyCents(l.discount||0)===0&&moneyCents(l.lineTotal)===cents*Number(l.quantity));
   if(!row)fail();row.remaining--;allocation.push({productId,quantity:1,unitPrice:cents/100,lineTotal:cents/100,discount:0,sourceLineId:row.sourceLineId,sourceUnit:row.used++});
  }
  result.set(id,allocation);
 }
 if(moneyCents(saleTotal)<cardTotal)fail();return result;
}
