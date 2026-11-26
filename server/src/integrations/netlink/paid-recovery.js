import crypto from 'node:crypto';
import {decodePaidIntent} from './paid-intent-codec.js';
import {readNetlinkNativeEvidence} from './paid-native-evidence.js';
import {assertNetlinkPaidSale,dispatchPaidNetlink,netlinkPaidError} from './paid-issuance-contract.js';
import {assertNetlinkProviderRequestId,nextNetlinkProviderRequestId} from './provider-request-id.js';
import {encryptStoreIntegrationValue} from '../store-integration-crypto.js';
const EVENT='NETLINK_NONEXECUTION_REVIEW';
const fail=(code,message)=>{throw netlinkPaidError(code,message)};
const iso=value=>value?new Date(value).toISOString():null;
const hash=value=>crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
export function recoveryFingerprint(row,proof){
 const paid=assertNetlinkPaidSale({...proof,scope:{companyId:row.companyId,storeId:row.storeId},intent:row});
 const completion=proof.rbsCommit||proof.fiscal;
 if(!completion||proof.rbsCommit&&(row.fiscalEvidence?.type!=='RBS_NATIVE_COMMIT'||row.fiscalEvidence?.id!==proof.rbsCommit.evidenceId||row.fiscalNumber!==null)||!row.saleId||proof.sale.id!==row.saleId||!row.providerDispatchedAt||(completion.fiscalNumber??null)!==(row.fiscalNumber??null)||row.providerTransactionId||row.completedAt||row.issuanceResultEnc)fail('NETLINK_RECOVERY_EVIDENCE','Η αρχική πληρωμή ή η απόδειξη χρειάζεται διασταύρωση.');
 return hash([row.companyId,row.storeId,row.requestId,row.checkoutId,row.saleId,row.productId,row.issuanceIntentEnc,iso(row.providerDispatchedAt),paid,proof.lines,proof.payments,proof.cashConfirmation,proof.cardProof||null,...(proof.rbsCommit?[proof.rbsCommit]:[])]);
}
export function createNetlinkPaidRecovery({db,provider,evidence=readNetlinkNativeEvidence,clock=()=>new Date()}){
 async function rowFor(t,scope,id,lock=false){const rows=lock?await t.$queryRaw`SELECT * FROM "NetlinkTransaction" WHERE "companyId"=${scope.companyId} AND "storeId"=${scope.storeId} AND "requestId"=${id} AND "issuanceIntentEnc" IS NOT NULL FOR UPDATE`:await t.$queryRaw`SELECT * FROM "NetlinkTransaction" WHERE "companyId"=${scope.companyId} AND "storeId"=${scope.storeId} AND "requestId"=${id} AND "issuanceIntentEnc" IS NOT NULL`;return decodePaidIntent(rows[0],scope)}
 async function connection(t,scope){const row=(await t.$queryRaw`SELECT "accountHint","updatedAt","enabled" FROM "StoreIntegrationCredential" WHERE "companyId"=${scope.companyId} AND "storeId"=${scope.storeId} AND "kind"='NETLINK' LIMIT 1`)[0];if(!row?.enabled||!row.accountHint)fail('NETLINK_RECOVERY_CONNECTION','Η σύνδεση του καταστήματος δεν είναι ενεργή.');return {stationId:row.accountHint,updatedAt:iso(row.updatedAt)}}
 async function reviews(t,scope,id){return t.$queryRaw`SELECT "details","actorId" FROM "StoreOperatorAudit" WHERE "companyId"=${scope.companyId} AND "storeId"=${scope.storeId} AND "eventType"=${EVENT} AND "details"->>'requestId'=${id}`}
 async function audit(t,scope,actor,event,details){await t.$executeRaw`INSERT INTO "StoreOperatorAudit" ("id","companyId","storeId","operatorId","actorId","eventType","details") VALUES (${crypto.randomUUID()},${scope.companyId},${scope.storeId},${actor},${actor},${event},${JSON.stringify(details)}::jsonb)`}
 async function approved(t,scope,row){
  const records=await reviews(t,scope,row.requestId),a=records[0]?.details;
  if(records.length!==1||!records[0].actorId||a?.version!==1||a.saleId!==row.saleId||a.checkoutId!==row.checkoutId||a.originalProviderRequestId!==row.providerRequestId||a.originalDispatchAt!==iso(row.providerDispatchedAt)||!a.providerReference||!a.confirmedAt||!a.resolutionId)fail('NETLINK_RECOVERY_REVIEW_REQUIRED','Απαιτείται καταγεγραμμένη επιβεβαίωση μη εκτέλεσης από Netlink.');
  assertNetlinkProviderRequestId(a.providerRequestId);
  if(JSON.stringify(a.connection)!==JSON.stringify(await connection(t,scope)))fail('NETLINK_RECOVERY_CONNECTION','Η σύνδεση του καταστήματος άλλαξε μετά την επιβεβαίωση παρόχου.');
  const proof=await evidence(t,scope,row);
  if(a.fingerprint!==recoveryFingerprint(row,proof))fail('NETLINK_RECOVERY_EVIDENCE','Τα στοιχεία της πληρωμένης αγοράς άλλαξαν μετά τον έλεγχο.');
  return {a,proof};
 }
 const repositoryFor=actorId=>({
  async load(scope,id){const row=await rowFor(db,scope,id);if(!row)return null;if(row.status!=='RECOVERY_READY')return row;const {a}=await approved(db,scope,row);return {...row,status:'READY_FOR_PAYMENT',providerRequestId:a.providerRequestId}},
  async claim(scope,id){return db.$transaction(async tx=>{const row=await rowFor(tx,scope,id,true);if(row?.status!=='RECOVERY_READY')return false;const {a}=await approved(tx,scope,row);
   const n=await tx.$executeRaw`UPDATE "NetlinkTransaction" SET "status"='EXECUTING',"updatedAt"=NOW() WHERE "id"=${row.id} AND "status"='RECOVERY_READY'`;
   if(Number(n)!==1)return false;await audit(tx,scope,actorId,'NETLINK_PAID_RECOVERY_DISPATCH',{requestId:id,resolutionId:a.resolutionId,providerRequestId:a.providerRequestId});return true;
  },{maxWait:5000,timeout:20000})},
  async uncertain(scope,id,code){await db.$executeRaw`UPDATE "NetlinkTransaction" SET "status"='UNKNOWN',"errorCode"=${code},"errorMessage"='Αβέβαιο αποτέλεσμα ολοκλήρωσης. Απαιτείται νέος έλεγχος παρόχου· καμία επανάληψη.',"updatedAt"=NOW() WHERE "companyId"=${scope.companyId} AND "storeId"=${scope.storeId} AND "requestId"=${id} AND "status"='EXECUTING'`},
  async review(scope,id,encrypted){await db.$executeRaw`UPDATE "NetlinkTransaction" SET "status"='AMOUNT_REVIEW',"issuanceResultEnc"=${encrypted},"errorCode"='NETLINK_PROVIDER_RESULT_REVIEW',"updatedAt"=NOW() WHERE "companyId"=${scope.companyId} AND "storeId"=${scope.storeId} AND "requestId"=${id} AND "status"='EXECUTING'`},
  async complete(scope,id,v){await db.$transaction(async tx=>{const row=await rowFor(tx,scope,id,true);const records=await reviews(tx,scope,id),a=records[0]?.details;if(row?.status!=='EXECUTING'||records.length!==1)fail('NETLINK_RECOVERY_STATE','Η ολοκλήρωση χρειάζεται διασταύρωση.');
   const n=await tx.$executeRaw`UPDATE "NetlinkTransaction" SET "status"='COMPLETED',"issuanceResultEnc"=${v.encrypted},"providerTransactionId"=${v.providerTransactionId},"providerReference"=${v.reference},"commissionAmount"=${v.cardCents/100*.01},"completedAt"=NOW(),"updatedAt"=NOW(),"errorCode"=NULL,"errorMessage"=NULL WHERE "id"=${row.id} AND "status"='EXECUTING'`;
   if(Number(n)!==1)fail('NETLINK_RECOVERY_STATE','Το αποτέλεσμα χρειάζεται διασταύρωση.');await audit(tx,scope,actorId,'NETLINK_PAID_RECOVERY_COMPLETED',{requestId:id,resolutionId:a.resolutionId,providerRequestId:a.providerRequestId});
  })}
 });
 return {
  async reviewContext(scope){return connection(db,scope)},
  async authorize(scope,id,{actorId,providerReference,confirmedAt,expectedUpdatedAt,expectedStationId}){
   const at=new Date(confirmedAt);if(!actorId||typeof providerReference!=='string'||providerReference.trim().length<10||providerReference.length>500||!Number.isFinite(at.getTime())||at>clock())fail('NETLINK_RECOVERY_CONFIRMATION','Συμπλήρωσε την αναφορά και την ώρα της επιβεβαίωσης Netlink.');
   return db.$transaction(async tx=>{
    const row=await rowFor(tx,scope,id,true);if(!row||row.status!=='UNKNOWN'||iso(row.updatedAt)!==iso(expectedUpdatedAt)||at<new Date(row.providerDispatchedAt)||!row.providerDispatchedAt)fail('NETLINK_RECOVERY_STATE','Ανανέωσε την αρχική αβέβαιη συναλλαγή πριν την επιβεβαίωση.');
    if((await reviews(tx,scope,id)).length)fail('NETLINK_RECOVERY_ALREADY_REVIEWED','Υπάρχει ήδη έλεγχος ολοκλήρωσης. Δεν επιτρέπεται νέα προσπάθεια.');
    const currentConnection=await connection(tx,scope);if(currentConnection.stationId!==expectedStationId)fail('NETLINK_RECOVERY_CONNECTION','Ο σταθμός Netlink άλλαξε. Ανανέωσε πριν την καταγραφή.');
    const proof=await evidence(tx,scope,row),fingerprint=recoveryFingerprint(row,proof),providerRequestId=await nextNetlinkProviderRequestId(tx),resolutionId=crypto.randomUUID();
    await audit(tx,scope,actorId,EVENT,{version:1,requestId:id,actorId,resolutionId,saleId:row.saleId,checkoutId:row.checkoutId,originalProviderRequestId:row.providerRequestId,originalDispatchAt:iso(row.providerDispatchedAt),connection:currentConnection,providerRequestId,providerReference:providerReference.trim(),confirmedAt:at.toISOString(),fingerprint});
    await tx.$executeRaw`UPDATE "NetlinkTransaction" SET "status"='RECOVERY_READY',"errorCode"='NETLINK_PROVIDER_NONEXECUTION_CONFIRMED',"errorMessage"='Ο πάροχος επιβεβαίωσε μη εκτέλεση. Εκκρεμεί ολοκλήρωση της υπάρχουσας πληρωμένης αγοράς.',"updatedAt"=NOW() WHERE "id"=${row.id} AND "status"='UNKNOWN'`;
    return {requestId:id,status:'RECOVERY_READY',providerRequestId,resolutionId};
   },{maxWait:5000,timeout:20000});
  },
  async fulfill(scope,id,{actorId}={}){if(!actorId)fail('NETLINK_RECOVERY_ACTOR','Απαιτείται συνδεδεμένος χειριστής.');return dispatchPaidNetlink({repository:repositoryFor(actorId),scope,requestId:id,loadEvidence:intent=>evidence(db,scope,intent),provider:provider(scope),encryptResult:async result=>encryptStoreIntegrationValue({...scope,requestId:id,result})})}
 };
}
