import {validFiscalReceipt} from './fiscal-gate.js';
import {assertNetlinkProviderRequestId} from './provider-request-id.js';

import {NETLINK_SERVICE_CENTS,netlinkPaidError,moneyCents} from "../../../../shared/netlink-fixed-card.mjs";
export {NETLINK_SERVICE_CENTS,netlinkPaidError,moneyCents,fixedCardFromMenu} from "../../../../shared/netlink-fixed-card.mjs";
const reject=(code,message)=>{throw netlinkPaidError(code,message)};
const sameScope=(row,scope)=>row&&row.companyId===scope.companyId&&row.storeId===scope.storeId;
export function assertNetlinkAmounts({intent,lines,totalValue,discount=0}){
 const amount=moneyCents(intent.amount),fee=moneyCents(intent.serviceFeeAmount),total=amount+NETLINK_SERVICE_CENTS;
 if(amount<=0||fee!==NETLINK_SERVICE_CENTS||moneyCents(intent.customerTotal)!==total||moneyCents(totalValue)!==total||moneyCents(discount||0)!==0)reject('NETLINK_PAID_TOTAL_MISMATCH','Η κάρτα και η παροχή0,50€ δεν συμφωνούν με την πώληση.');
 if(!Array.isArray(lines)||lines.length!==2||intent.saleProductId===intent.serviceFeeProductId)reject('NETLINK_PAID_LINES_MISMATCH','Απαιτείται μία κάρτα και μία παροχή0,50€.');
 for(const [id,cents] of [[intent.saleProductId,amount],[intent.serviceFeeProductId,NETLINK_SERVICE_CENTS]]){
  const rows=lines.filter(l=>l.productId===id);
  if(rows.length!==1||Number(rows[0].quantity)!==1||moneyCents(rows[0].unitPrice)!==cents||moneyCents(rows[0].lineTotal)!==cents||moneyCents(rows[0].discount||0)!==0)reject('NETLINK_PAID_LINES_MISMATCH','Η αξία κάρτας ή η αυτόματη παροχή0,50€ άλλαξε.');
 }
 return {amount,fee,total};
}
export function assertNetlinkPaidSale({scope,intent,sale,lines,payments,fiscal,cashConfirmation,cardProof}){
 if(!sameScope(intent,scope)||!sameScope(sale,scope)||sale.clientTransactionId!==intent.checkoutId)reject('NETLINK_SALE_SCOPE','Η πώληση δεν αντιστοιχεί στην επιλεγμένη κάρτα και το κατάστημα.');
 if(sale.status!=='COMPLETED'||sale.fiscalStatus!=='ISSUED')reject('NETLINK_SALE_NOT_COMPLETED','Πρέπει πρώτα να ολοκληρωθεί η πληρωμή και η απόδειξη.');
 const {amount,fee}=assertNetlinkAmounts({intent,lines,totalValue:intent.customerTotal});
 const total=moneyCents(sale.total);if(total<amount+fee)reject("NETLINK_PAID_TOTAL_MISMATCH","Το πληρωμένο καλάθι δεν καλύπτει την κάρτα και την παροχή.");
 if(!Array.isArray(payments)||payments.length!==1||!['CASH','CARD'].includes(payments[0].method)||moneyCents(payments[0].amount)!==total)reject('NETLINK_PAYMENT_REQUIRED','Απαιτείται πλήρης πληρωμή με μετρητά ή κάρτα.');
 if(!sameScope(fiscal,scope)||fiscal.saleId!==sale.id||!validFiscalReceipt(fiscal))reject('NETLINK_FISCAL_RECEIPT_REQUIRED','Η κάρτα εκδίδεται μόνο μετά την επιβεβαιωμένη απόδειξη της ταμειακής.');
 const method=payments[0].method;
 if(method==='CASH'){
  if(!sameScope(cashConfirmation,scope)||cashConfirmation.requestId!==intent.requestId||cashConfirmation.checkoutId!==intent.checkoutId||!cashConfirmation.actorId||!cashConfirmation.receivedAt||moneyCents(cashConfirmation.amount)!==total)reject('NETLINK_CASH_NOT_RECEIVED','Ο υπάλληλος πρέπει πρώτα να επιβεβαιώσει την είσπραξη του συνολικού ποσού.');
 }else if(!sameScope(cardProof,scope)||cardProof.saleId!==sale.id||cardProof.clientTransactionId!==intent.checkoutId||cardProof.status!=='SUCCESS'||cardProof.method!=='CARD'||!cardProof.evidenceId||moneyCents(cardProof.amount)!==total){
  reject('NETLINK_CARD_NOT_APPROVED','Δεν έχει επιβεβαιωθεί επιτυχής πληρωμή στο μηχάνημα καρτών.');
 }
 return {paymentMethod:method,totalCents:total,cardCents:amount,serviceCents:fee,fiscalNumber:fiscal.fiscalNumber};
}

// The durable repository owns compare-and-set and commits EXECUTING before this
// provider call. A transport error is uncertain; it is never an issuance retry.
export async function dispatchPaidNetlink({repository,scope,requestId,loadEvidence,provider,encryptResult}){
 const intent=await repository.load(scope,requestId);
 if(!intent)throw netlinkPaidError('NETLINK_INTENT_NOT_FOUND','Δεν βρέθηκε η επιλεγμένη κάρτα.',404);
 if(!sameScope(intent,scope)||intent.requestId!==requestId)reject('NETLINK_INTENT_SCOPE','Η κάρτα ανήκει σε διαφορετικό κατάστημα ή αίτημα.');
 if(intent.status==='COMPLETED')return {status:'COMPLETED',idempotentReplay:true,requestId};
 if(['EXECUTING','UNKNOWN','AMOUNT_REVIEW'].includes(intent.status))return {status:intent.status,idempotentReplay:true,requestId};
 if(intent.status!=='READY_FOR_PAYMENT')reject('NETLINK_INTENT_NOT_READY','Η κάρτα δεν είναι διαθέσιμη για έκδοση.');
 assertNetlinkProviderRequestId(intent.providerRequestId);
 const evidence=await loadEvidence(intent);
 const paid=assertNetlinkPaidSale({...evidence,scope,intent});
 const claimed=await repository.claim(scope,requestId,{saleId:evidence.sale.id,...paid});
 if(!claimed)return {status:'EXECUTING',idempotentReplay:true,requestId};
 let result;
 try{result=await provider.execute(intent.productId,{requestId:intent.providerRequestId,payload:{}})}
 catch(error){const status=Number(error?.providerStatus),providerHttpStatus=Number.isInteger(status)&&status>=400&&status<=599?status:null;await repository.uncertain(scope,requestId,providerHttpStatus?`NETLINK_PROVIDER_HTTP_${providerHttpStatus}`:'NETLINK_PROVIDER_RESULT_UNCERTAIN').catch(()=>{});return {status:'UNKNOWN',requestId,requiresReview:true,...(providerHttpStatus?{providerHttpStatus}:{})}}
 try{
  const data=result?.data??result;
  if(!['string','number'].includes(typeof data?.transactionId)||!String(data.transactionId).trim()||String(data.transactionId).length>160||!Array.isArray(data.lines)||!data.lines.length||data.lines.length>1000||data.lines.some(l=>typeof l!=='string'||l.length>4000)||data.requestId!==undefined&&String(data.requestId)!==intent.providerRequestId||moneyCents(data.amount)!==paid.cardCents){
   await repository.review(scope,requestId,await encryptResult(result));return {status:'AMOUNT_REVIEW',requestId,requiresReview:true};
  }
  const encrypted=await encryptResult(result);
  await repository.complete(scope,requestId,{encrypted,providerTransactionId:String(data.transactionId),reference:data.reference?String(data.reference):null,...paid});
  return {status:'COMPLETED',requestId,idempotentReplay:false};
 }catch{await repository.uncertain(scope,requestId,'NETLINK_RESULT_PERSISTENCE_UNCERTAIN').catch(()=>{});return {status:'UNKNOWN',requestId,requiresReview:true}}
}
