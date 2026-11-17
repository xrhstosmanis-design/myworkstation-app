export function tableCashPlan({parts,transactionId,requestedCents,totalCents}){
  const fail=message=>{throw Object.assign(new Error(message),{status:409})};
  const previous=parts.find(part=>part.transactionId===transactionId);
  if(previous){
    if(previous.amountCents!==requestedCents)fail("Η ίδια συναλλαγή έχει ήδη καταχωριστεί με διαφορετικό ποσό.");
    return {replay:true,transactionId:previous.transactionId,amountCents:previous.amountCents,paidCents:previous.paidCents,balanceCents:previous.balanceCents};
  }
  const paidCents=parts.reduce((sum,part)=>sum+part.amountCents,0);
  const balanceCents=totalCents-paidCents;
  if(!Number.isSafeInteger(balanceCents)||balanceCents<=0)fail("Το τραπέζι δεν έχει διαθέσιμο υπόλοιπο.");
  if(requestedCents===undefined)return {paidCents,balanceCents};
  if(!Number.isSafeInteger(requestedCents)||requestedCents<=0||requestedCents>=balanceCents)fail("Η μερική πληρωμή πρέπει να είναι μικρότερη από το υπόλοιπο.");
  return {transactionId,amountCents:requestedCents,paidCents:paidCents+requestedCents,balanceCents:balanceCents-requestedCents};
}

export function tableCashLabEnabled(storeId){
  return Boolean(process.env.TABLE_PARTIAL_PAYMENT_LAB_STORE_ID)&&process.env.TABLE_PARTIAL_PAYMENT_LAB_STORE_ID===storeId;
}
