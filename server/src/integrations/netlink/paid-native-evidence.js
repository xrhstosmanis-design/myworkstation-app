import {readNetlinkRbsCompletion} from './paid-rbs-evidence.js';
import {netlinkIntentIdsFromItems} from "../../../../shared/netlink-checkout-items.mjs";
import {decodePaidIntent} from "./paid-intent-codec.js";
import {allocateNetlinkBasketLines} from "./paid-basket-lines.js";
import {createHash} from 'node:crypto';
import {createFtextInstallationService,ftextSettingsHash} from '../../services/ftext-installation.js';
import {companyModuleState} from '../../middleware/module-access.js';
import {validateFtextCashResult} from '../../services/ftext-cash-requests.js';
import {effectiveFtextCashReceipt} from '../../services/ftext-late-cash-receipt.js';
import {assertFtextOperatorCardApproved} from '../../services/ftext-operator-card.js';
import {moneyCents,netlinkPaidError} from './paid-issuance-contract.js';
const fail=()=>{throw netlinkPaidError('NETLINK_FISCAL_RECEIPT_REQUIRED','Δεν βρέθηκε επιβεβαιωμένη απόδειξη ταμειακής για αυτή την πληρωμή.')};
const hash=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
export async function nativeTableExists(db,table){return Boolean((await db.$queryRaw`SELECT to_regclass(format('%I.%I',current_schema(),${table}))::text AS name`)[0]?.name)}
export async function readNetlinkNativeEvidence(db,scope,intent,{ftextContext}={}){
 const sale=(await db.$queryRaw`SELECT "id","companyId","storeId","clientTransactionId","status","fiscalStatus","total","discount","occurredAt",to_jsonb(s)->>'saleFingerprint' AS "saleFingerprint" FROM "Sale" s WHERE "companyId"=${scope.companyId} AND "storeId"=${scope.storeId} AND "clientTransactionId"=${intent.checkoutId} LIMIT 1`)[0];
 if(!sale)throw netlinkPaidError('NETLINK_SALE_NOT_COMPLETED','Η πληρωμή και η απόδειξη δεν έχουν ολοκληρωθεί.');
 const [lines,payments]=await Promise.all([
  db.$queryRaw`SELECT "id","productId","quantity","unitPrice","discount","lineTotal" FROM "SaleLine" WHERE "saleId"=${sale.id} ORDER BY "id"`,
  db.$queryRaw`SELECT "method","amount" FROM "Payment" WHERE "saleId"=${sale.id}`
 ]);
 let fiscal=null,rbsCommit=null,cardProof=null,nativeItems=null;
 if(await nativeTableExists(db,'FtextCashRequest')){
  const row=(await db.$queryRaw`SELECT * FROM "FtextCashRequest" WHERE "companyId"=${scope.companyId} AND "storeId"=${scope.storeId} AND "saleId"=${sale.id} AND "clientTransactionId"=${intent.checkoutId} AND "status"='SALE_COMMITTED' LIMIT 1`)[0];
  if(row){
   nativeItems=row.checkoutJson?.items;
   const service=ftextContext?null:createFtextInstallationService({db,moduleState:(id,tx)=>companyModuleState(id,{db:tx}),secret:()=>process.env.JWT_SECRET});
   const current=await (ftextContext||service.cashContext)(db,{...scope,terminalPos:row.terminalPos},{requireOnline:false});
   if(row.settingsHash!==ftextSettingsHash(current.settings)||row.lifecycleGeneration!==current.settings.lifecycleGeneration||row.checkoutJson?.ftextVoid||row.checkoutJson?.ftextOperatorRelease||moneyCents(row.total)!==moneyCents(sale.total))fail();
   const receipt=validateFtextCashResult(effectiveFtextCashReceipt(row,current.settings),row);
   const expectedHash=row.checkoutJson?.ftextLateCashReceipt?.resultHash||row.resultHash;
   if(receipt.outcome!=='CONFIRMED'||!expectedHash||hash(receipt)!==expectedHash||!row.claimedByDeviceId||!row.dispatchedAt)fail();
   fiscal={...scope,saleId:sale.id,status:'ISSUED',fiscalNumber:`${receipt.serialNumber}/${receipt.dayId}/${receipt.dayCounter}`,issuedAt:row.updatedAt,evidenceId:row.id,evidenceType:'FTEXT_RECEIPT'};
   if(row.plan?.payment?.method==='CARD'){
    assertFtextOperatorCardApproved(row,current.settings);
    if(row.checkoutJson?.paymentMethod!=='CARD'||row.checkoutJson?.ftextCardDecision?.outcome==='NO'||row.checkoutJson?.ftextCardDecision?.outcome==='UNCERTAIN')fail();
    cardProof={...scope,saleId:sale.id,clientTransactionId:intent.checkoutId,status:'SUCCESS',method:'CARD',amount:row.total,evidenceId:row.id,evidenceType:receipt.posPayments?.length?'FTEXT_MACHINE':'FTEXT_OPERATOR_CONFIRMATION'};
   }
  }
 }
 if(!nativeItems&&await nativeTableExists(db,'RbsCapDriverV1Request')){
  const native=(await db.$queryRaw`SELECT * FROM "RbsCapDriverV1Request" WHERE "companyId"=${scope.companyId} AND "storeId"=${scope.storeId} AND "saleId"=${sale.id} AND "clientTransactionId"=${intent.checkoutId} AND "status"='SALE_COMMITTED' LIMIT 1 FOR SHARE`)[0];
  if(native&&(!payments.some(p=>p.method==='CARD')||native.paymentMethod==='CARD'&&native.operatorOutcome==='YES'))nativeItems=native.checkoutJson?.items;
  if(intent.checkoutContext?.kind==='RBS_NATIVE_COMMIT'){
   rbsCommit=await readNetlinkRbsCompletion(db,scope,intent,sale,native);
   if(native.paymentMethod==='CARD')cardProof={...scope,saleId:sale.id,clientTransactionId:intent.checkoutId,status:'SUCCESS',method:'CARD',amount:native.total,evidenceId:native.id,evidenceType:'RBS_OPERATOR_CONFIRMATION'};
  }
 }
 if(!fiscal&&await nativeTableExists(db,'FiscalDocument')){
  const row=(await db.$queryRaw`SELECT "id","saleId","status","fiscalNumber","issuedAt" FROM "FiscalDocument" WHERE "saleId"=${sale.id} AND "status"='ISSUED' LIMIT 1`)[0];
  if(row)fiscal={...scope,...row,evidenceId:row.id,evidenceType:'FISCAL_DOCUMENT'};
 }
 if(!cardProof&&payments[0]?.method==='CARD'&&await nativeTableExists(db,'PaymentDeviceRouteAttempt')){
  // Read persisted native routing outcome; never accept client-supplied approval.
  const row=(await db.$queryRaw`SELECT "id","status","amount",to_jsonb(a)->>'providerTransactionId' AS "providerTransactionId" FROM "PaymentDeviceRouteAttempt" a WHERE "companyId"=${scope.companyId} AND "storeId"=${scope.storeId} AND "saleId"=${sale.id} AND "idempotencyKey"=${intent.checkoutId} ORDER BY "createdAt" DESC LIMIT 1`)[0];
  if(row?.status==='SUCCESS'&&row.providerTransactionId)cardProof={...scope,saleId:sale.id,clientTransactionId:intent.checkoutId,status:'SUCCESS',method:'CARD',amount:row.amount,evidenceId:row.id,evidenceType:'NATIVE_PAYMENT_RESULT'};
 }
 const manifest=netlinkIntentIdsFromItems(nativeItems);
 if(!manifest.includes(intent.requestId))throw netlinkPaidError('NETLINK_INTENT_NOT_IN_RECEIPT','Η κάρτα δεν περιλαμβάνεται στην αρχική πληρωμένη συναλλαγή.');
 const rows=await db.$queryRaw`SELECT * FROM "NetlinkTransaction" WHERE "companyId"=${scope.companyId} AND "storeId"=${scope.storeId} AND "checkoutId"=${intent.checkoutId} AND "requestId"=ANY(${manifest}::text[]) AND "issuanceIntentEnc" IS NOT NULL`;
 const intents=rows.map(row=>decodePaidIntent(row,scope));if(intents.some(i=>!i))fail();
 const allocated=allocateNetlinkBasketLines(manifest,intents,lines,sale.total).get(intent.requestId);
 const cashConfirmation=intent.cashReceivedAt&&intent.cashReceivedBy?{...scope,requestId:intent.requestId,checkoutId:intent.checkoutId,actorId:intent.cashReceivedBy,receivedAt:intent.cashReceivedAt,amount:intent.cashReceivedTotal}:null;
 return {sale,lines:allocated,payments,fiscal,rbsCommit,cardProof,cashConfirmation};
}
