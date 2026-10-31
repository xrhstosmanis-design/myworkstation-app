import {ftextCashReviewable,ftextCashReviewReleased} from './ftext-cash-review.js';
import {ftextCashFirstLineReleased} from './ftext-cash-rejection.js';
import {ftextOperatorCardMode,ftextOperatorDecisionRequired,ftextOperatorReleaseMode} from './ftext-operator-card.js';
import {ftextVoidConfirmed} from './ftext-void.js';
import {validateFtextCardPayment} from './ftext-card-payment.js';
import {createHash,randomUUID} from 'node:crypto';
import {z} from 'zod';
import {prepareFtextSalePlan} from './ftext-sale-plan.js';
import {ftextSettingsHash,ftextRegisterReady} from './ftext-installation.js';
import {newFtextHandoff,ftextHandoffRequest,assertFtextHandoffResult} from './ftext-handoff.js';
const fail=(code,message)=>{throw Object.assign(new Error(message),{status:409,code})};
const hash=s=>createHash('sha256').update(s).digest('hex');
export async function findPendingFtextCashRequest(tx,scope){
 return (await tx.$queryRaw`SELECT * FROM "FtextCashRequest" WHERE "companyId"=${scope.companyId} AND "storeId"=${scope.storeId} AND "terminalPos"=${scope.terminalPos} AND "status"<>'SALE_COMMITTED' AND COALESCE("checkoutJson"->'ftextVoid'->>'status','')<>'CONFIRMED' AND COALESCE("checkoutJson"->'ftextOperatorRelease'->>'registerReady','')<>'true' ORDER BY "createdAt" LIMIT 1`)[0]||null;
}
export function ftextCashRequestView(row){return row?{id:row.id,kind:'FTEXT_CASH',storeId:row.storeId,terminalPos:row.terminalPos,clientTransactionId:row.clientTransactionId,paymentMethod:row.checkoutJson?.paymentMethod||'CASH',total:Number(row.total),status:ftextVoidConfirmed(row)?'CANCELLED':row.status,voidStatus:row.checkoutJson?.ftextVoid?.status||null,saleId:row.saleId||null,operatorConfirmationRequired:ftextOperatorDecisionRequired(row),operatorReviewMode:ftextCashReviewable(row)?'CASH_UNKNOWN':null,operatorOutcome:row.checkoutJson?.ftextCardDecision?.outcome||row.checkoutJson?.ftextCashDecision?.outcome||null,operatorReleaseMode:ftextCashFirstLineReleased(row)||ftextCashReviewReleased(row)?'RELEASED':ftextOperatorReleaseMode(row),checkout:row.checkoutJson,createdAt:row.createdAt}:null;}
export function assertFtextSimpleCash(checkout,items){
 if(checkout.paymentMethod!=='CASH'||checkout.customerId||checkout.onlineOrderId||checkout.tableOrderId||Number(checkout.redeemPoints||0)!==0||checkout.payments?.length||!['COUNTER',undefined].includes(checkout.operationChannel)||!['NORMAL',undefined].includes(checkout.audience)||items.some(i=>Number(i.discount||0)!==0||i.promotionId||i.promotionType||!Number.isSafeInteger(Number(i.quantity))||Number(i.quantity)<=0))fail('FTEXT_CASH_UNSUPPORTED','Η πρώτη έκδοση ftext υποστηρίζει απλή πώληση μετρητών στο κατάστημα, χωρίς πελάτη, προσφορά ή έκπτωση.');
}
export async function prepareFtextCashRequest(tx,{settings,scope,sessionId,clientTransactionId,requestHash,checkout,items,summary}){
 if(!['CASH','CARD'].includes(checkout.paymentMethod))fail('FTEXT_CASH_UNSUPPORTED','Μη υποστηριζόμενος τρόπος πληρωμής ftext.');
 assertFtextSimpleCash({...checkout,paymentMethod:'CASH'},items);
 if(checkout.paymentMethod==='CARD'&&(settings.cardEnabled!==true||settings.cardPayment?.confirmed!==true||!['POS_LINE8_OS7','OPERATOR_CONFIRMATION'].includes(settings.cardPayment.resultFormat)))fail('FTEXT_CARD_DISABLED','Η κάρτα ftext απαιτεί επιβεβαιωμένο τρόπο πληρωμής και υποστήριξη αποτελέσματος POS.');
 if(settings.cashEnabled!==true||!settings.cashDepartments?.length)fail('FTEXT_CASH_DISABLED','Δεν έχει ενεργοποιηθεί και επιβεβαιωθεί η έκδοση μετρητών ftext για αυτό το POS.');
 const plan=prepareFtextSalePlan({scope,settings,clientTransactionId,total:summary.total,
 // ManagementVatDepartment.legacyVatCode can be a legacy department label
 // (e.g. 004), not the DATECS VAT-group number. Only the technician-confirmed
 // installation profile supplies that number; the plan still reconciles VAT.
 items:items.map((i,index)=>({...scope,lineId:'line-'+index,productId:i.productId,description:i.name,quantity:i.quantity,unitPrice:i.effectiveUnitPrice,discount:i.discount||0,lineTotal:i.lineTotal,department:i.fiscalDepartment,vatRate:i.vatRate,vatCode:settings.cashDepartments.find(p=>String(p.department)===String(Number(i.fiscalDepartment)))?.vatCode})),
 payments:[{method:checkout.paymentMethod,amount:summary.total}],paymentProfiles:[{...scope,method:checkout.paymentMethod,code:checkout.paymentMethod==='CASH'?1:settings.cardPayment.code,confirmed:true}],departmentProfiles:settings.cashDepartments.map(p=>({...scope,...p,confirmed:true}))});
 const settingsHash=ftextSettingsHash(settings);
 await tx.$queryRaw`SELECT 1 AS locked FROM pg_advisory_xact_lock(hashtextextended(${['ftext-cash',scope.companyId,scope.storeId,settings.serialNumber].join(':')},0))`;
 const old=(await tx.$queryRaw`SELECT * FROM "FtextCashRequest" WHERE "companyId"=${scope.companyId} AND "storeId"=${scope.storeId} AND "clientTransactionId"=${clientTransactionId} FOR UPDATE`)[0];
 if(old){if(old.requestHash!==requestHash||old.plan.planHash!==plan.planHash||old.settingsHash!==settingsHash||old.sessionId!==sessionId)fail('FTEXT_CASH_KEY_CHANGED','Η ίδια συναλλαγή έχει διαφορετικά στοιχεία. Η προηγούμενη εντολή διατηρήθηκε.');return old;}
 if((await tx.$queryRaw`SELECT "id" FROM "FtextCashRequest" WHERE "companyId"=${scope.companyId} AND "storeId"=${scope.storeId} AND "serialNumber"=${settings.serialNumber} AND "status"<>'SALE_COMMITTED' AND COALESCE("checkoutJson"->'ftextVoid'->>'status','')<>'CONFIRMED' AND COALESCE("checkoutJson"->'ftextOperatorRelease'->>'registerReady','')<>'true' LIMIT 1`).length)fail('FTEXT_CASH_PENDING','Υπάρχει εκκρεμής εντολή σε αυτή την ταμειακή. Δεν στάλθηκε νέα.');
 return (await tx.$queryRaw`INSERT INTO "FtextCashRequest" ("id","companyId","storeId","terminalPos","fiscalDeviceCode","serialNumber","clientTransactionId","requestHash","settingsHash","lifecycleGeneration","sessionId","plan","checkoutJson","total") VALUES (${randomUUID()},${scope.companyId},${scope.storeId},${scope.terminalPos},${scope.fiscalDeviceCode},${settings.serialNumber},${clientTransactionId},${requestHash},${settingsHash},${settings.lifecycleGeneration},${sessionId},${JSON.stringify(plan)}::jsonb,${JSON.stringify({...checkout,resolvedItems:items,baseSummary:summary,ftextCardMode:checkout.paymentMethod==='CARD'?settings.cardPayment.resultFormat:null,ftextCardDecision:null,ftextCardDecisionHistory:[]})}::jsonb,${summary.total}) RETURNING *`)[0];
}
export async function claimFtextCashRequest(tx,device,settings,{handoffVersion}={}){
 if(settings.cashEnabled!==true)return null;
 // Leave PREPARED untouched while the updated connector obtains a fresh nonfiscal STATUS.
 if(device.metadata?.ftextReadinessRequired===true&&!ftextRegisterReady(device,settings))return null;
 const row=(await tx.$queryRaw`SELECT * FROM "FtextCashRequest" WHERE "companyId"=${settings.companyId} AND "storeId"=${settings.storeId} AND "terminalPos"=${settings.terminalPos} AND "status"='PREPARED' ORDER BY "createdAt" LIMIT 1 FOR UPDATE`)[0];
 if(!row)return null;
 if(Object.hasOwn(row.checkoutJson||{},'ftextHandoff'))fail('FTEXT_HANDOFF_REVIEW','Η παλιά κατάσταση παράδοσης απαιτεί έλεγχο· δεν επανεκκινείται.');
 if(row.settingsHash!==ftextSettingsHash(settings)||row.lifecycleGeneration!==settings.lifecycleGeneration)fail('FTEXT_CASH_SETTINGS_CHANGED','Η εκκρεμής εντολή ανήκει σε προηγούμενες ρυθμίσεις.');
 const updated=handoffVersion===1?(await tx.$queryRaw`UPDATE "FtextCashRequest" SET "status"='DISPATCHED',"claimedByDeviceId"=${device.id},"claimedTokenVersion"=${device.tokenVersion},"checkoutJson"=${JSON.stringify({...row.checkoutJson,ftextHandoff:newFtextHandoff(row,device,settings)})}::jsonb,"dispatchedAt"=NOW(),"updatedAt"=NOW() WHERE "id"=${row.id} AND "status"='PREPARED' RETURNING *`)[0]:(await tx.$queryRaw`UPDATE "FtextCashRequest" SET "status"='DISPATCHED',"claimedByDeviceId"=${device.id},"claimedTokenVersion"=${device.tokenVersion},"dispatchedAt"=NOW(),"updatedAt"=NOW() WHERE "id"=${row.id} AND "status"='PREPARED' RETURNING *`)[0];
 if(updated?.checkoutJson?.ftextHandoff)return ftextHandoffRequest(updated);
 // This committed transition is a one-shot dispatch, not a renewable lease.
 return updated?{id:updated.id,settingsHash:updated.settingsHash,scope:updated.plan.scope,serialNumber:updated.serialNumber,plan:updated.plan}:null;
}
const resultSchema=z.object({requestId:z.string().uuid(),settingsHash:z.string().regex(/^[a-f0-9]{64}$/),outcome:z.enum(['CONFIRMED','REQUIRES_CHECK']),code:z.number().int().min(0).max(999).optional(),serialNumber:z.string().max(80).optional(),dayId:z.string().regex(/^\d{1,20}$/).optional(),dayCounter:z.string().regex(/^\d{1,20}$/).optional(),deviceTime:z.string().min(1).max(80).optional(),qr:z.string().max(2000).optional(),rawResultHash:z.string().regex(/^[a-f0-9]{64}$/).optional(),description:z.string().max(300).optional(),failedCommand:z.string().regex(/^PAY\|(?:[0-9]{1,9}\.[0-9]{2})?\|(?:[2-9]|[12][0-9]|30)$/).optional(),posPayments:z.array(z.object({cardType:z.string().max(60),amount:z.string().max(12),cardNumberMasked:z.string().max(19)}).strict()).max(1).optional()}).strict();
export function validateFtextCashResult(input,row){
 const r=resultSchema.parse(input);
 if(r.requestId!==row.id||r.settingsHash!==row.settingsHash)fail('FTEXT_CASH_RESULT_SCOPE','Το αποτέλεσμα ανήκει σε άλλη εντολή.');
 if(r.outcome!=='CONFIRMED'&&r.posPayments)fail('FTEXT_CARD_PAYMENT_UNVERIFIED','Δεν επιτρέπονται στοιχεία κάρτας σε ανεπιβεβαίωτο αποτέλεσμα.');
 if(r.outcome==='CONFIRMED'){
  let url;try{url=new URL(r.qr)}catch{}
  if(r.code!==0||r.serialNumber!==row.serialNumber||!r.dayId||!r.dayCounter||BigInt(r.dayCounter)<=0n||!r.deviceTime||!r.rawResultHash||!url||url.protocol!=='https:'||url.username||url.password||!(url.hostname==='aade.gr'||url.hostname.endsWith('.aade.gr')))fail('FTEXT_CASH_RECEIPT_UNVERIFIED','Δεν επιβεβαιώθηκε τελική φορολογική απόδειξη.');
  if(row.plan?.payment?.method==='CARD'){if(row.checkoutJson?.paymentMethod!=='CARD'||Number(row.total)!==Number(row.plan.payment.amount))fail('FTEXT_CARD_PAYMENT_UNVERIFIED','Ο τρόπος πληρωμής άλλαξε.');if(!ftextOperatorCardMode(row)||r.posPayments!==undefined)validateFtextCardPayment(r.posPayments,row.plan.payment.amount);}
  else if(r.posPayments?.length)fail('FTEXT_CARD_PAYMENT_UNVERIFIED','Το αποτέλεσμα κάρτας δεν αντιστοιχεί σε πώληση μετρητών.');
  r.dayId=BigInt(r.dayId).toString();r.dayCounter=BigInt(r.dayCounter).toString();
 }
 return r;
}
export async function recordFtextCashResult(tx,device,settings,input){
 const row=(await tx.$queryRaw`SELECT * FROM "FtextCashRequest" WHERE "id"=${input?.requestId||''} AND "companyId"=${settings.companyId} AND "storeId"=${settings.storeId} AND "terminalPos"=${settings.terminalPos} FOR UPDATE`)[0];
 if(!row||row.claimedByDeviceId!==device.id||row.claimedTokenVersion!==device.tokenVersion||row.settingsHash!==ftextSettingsHash(settings))fail('FTEXT_CASH_RESULT_SCOPE','Η εντολή δεν αντιστοιχεί στη συγκεκριμένη ενεργή συσκευή.');
 assertFtextHandoffResult(row,device,settings);
 const result=validateFtextCashResult(input,row),resultHash=hash(JSON.stringify(result));
 if(row.resultHash){if(row.resultHash!==resultHash)fail('FTEXT_CASH_RESULT_CHANGED','Το ίδιο αποτέλεσμα άλλαξε. Απαιτείται έλεγχος.');return row;}
 if(result.outcome==='CONFIRMED'){
  const reused=(await tx.$queryRaw`SELECT "id" FROM "FtextCashRequest" WHERE "companyId"=${settings.companyId} AND "storeId"=${settings.storeId} AND "serialNumber"=${settings.serialNumber} AND "id"<>${row.id} AND "status" IN ('CONFIRMED','SALE_COMMITTED') AND COALESCE("checkoutJson"->'ftextLateCashReceipt'->'result'->>'dayId',"result"->>'dayId')=${result.dayId} AND COALESCE("checkoutJson"->'ftextLateCashReceipt'->'result'->>'dayCounter',"result"->>'dayCounter')=${result.dayCounter} LIMIT 1`)[0];
  if(reused)fail('FTEXT_CASH_RECEIPT_REUSED','Η ίδια φορολογική απόδειξη έχει ήδη συνδεθεί με άλλη συναλλαγή. Δεν έγινε δεύτερη καταχώριση.');
 }
 if(row.status!=='DISPATCHED')fail('FTEXT_CASH_RESULT_STATE','Η εντολή δεν βρίσκεται σε κατάσταση αποστολής.');
 return (await tx.$queryRaw`UPDATE "FtextCashRequest" SET "result"=${JSON.stringify(result)}::jsonb,"resultHash"=${resultHash},"status"=${result.outcome},"updatedAt"=NOW() WHERE "id"=${row.id} RETURNING *`)[0];
}
