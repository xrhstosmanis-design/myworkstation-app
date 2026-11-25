import {decodePaidIntent as openIntent} from './paid-intent-codec.js';
import {netlinkIntentIdsFromItems,netlinkItemMarker} from '../../../../shared/netlink-checkout-items.mjs';
import crypto from 'node:crypto';
import {encryptStoreIntegrationValue,decryptStoreIntegrationValue} from '../store-integration-crypto.js';
import {fixedCardFromMenu,moneyCents,assertNetlinkAmounts,assertNetlinkPaidSale,dispatchPaidNetlink,netlinkPaidError} from './paid-issuance-contract.js';
import {readNetlinkNativeEvidence} from './paid-native-evidence.js';
const fail=(code,message)=>{throw netlinkPaidError(code,message)};
const binding=(scope,id)=>({companyId:scope.companyId,storeId:scope.storeId,requestId:id});
export async function readNetlinkPaidConfig(db,scope){
 const c=(await db.$queryRaw`SELECT * FROM "NetlinkStoreConfig" WHERE "companyId"=${scope.companyId} AND "storeId"=${scope.storeId} AND "active"=true LIMIT 1`)[0];
 if(!c?.saleProductId||!c.serviceFeeProductId||c.saleProductId===c.serviceFeeProductId||moneyCents(c.serviceFeeAmount)!==50)fail('NETLINK_POS_CONFIG_REQUIRED','Ρύθμισε ξεχωριστά είδη POS για την κάρτα και την παροχή0,50€.');
 const rows=await db.$queryRaw`SELECT p."id",p."name",p."sku",p."vatRate",p."trackStock",COALESCE(sp."salePrice",p."salePrice") AS "salePrice" FROM "Product" p JOIN "StoreProduct" sp ON sp."productId"=p."id" AND sp."storeId"=${scope.storeId} AND sp."active"=true WHERE p."companyId"=${scope.companyId} AND p."active"=true AND p."id" IN (${c.saleProductId},${c.serviceFeeProductId})`;
 const value=rows.find(p=>p.id===c.saleProductId),fee=rows.find(p=>p.id===c.serviceFeeProductId);
 if(!value||!fee||value.trackStock||fee.trackStock)fail('NETLINK_POS_CONFIG_REQUIRED','Τα δύο είδη Netlink πρέπει να είναι ενεργές υπηρεσίες του καταστήματος χωρίς απόθεμα.');
 return {saleProduct:value,serviceFeeProduct:fee,serviceFeeAmount:.5};
}
export function createNetlinkPaidStore({db,provider,clock=()=>new Date(),evidence=readNetlinkNativeEvidence}){
 async function load(scope,id,t=db){return openIntent((await t.$queryRaw`SELECT * FROM "NetlinkTransaction" WHERE "companyId"=${scope.companyId} AND "storeId"=${scope.storeId} AND "requestId"=${id} AND "issuanceIntentEnc" IS NOT NULL LIMIT 1`)[0],scope)}
 function view(row){return {requestId:row.requestId,checkoutId:row.checkoutId,productId:row.productId,title:row.title,status:row.status,amount:Number(row.amount),serviceFeeAmount:.5,customerTotal:Number(row.customerTotal),saleId:row.saleId||null,createdAt:row.createdAt,cashReceived:Boolean(row.cashReceivedAt)}}
 function checkoutView(row,config){
  if(config.saleProduct.id!==row.saleProductId||config.serviceFeeProduct.id!==row.serviceFeeProductId)fail('NETLINK_POS_CONFIG_REQUIRED','Η αντιστοίχιση ειδών άλλαξε. Επίλεξε ξανά την κάρτα πριν πληρώσεις.');
  return {...view(row),items:[{...config.saleProduct,quantity:1,unitPriceOverride:Number(row.amount),overrideReason:`NETLINK_CARD:${row.requestId}`,netlinkIntentId:row.requestId,netlinkCheckoutId:row.checkoutId,netlinkRole:'CARD',displayName:row.title},{...config.serviceFeeProduct,quantity:1,unitPriceOverride:.5,overrideReason:`NETLINK_FEE:${row.requestId}`,netlinkIntentId:row.requestId,netlinkCheckoutId:row.checkoutId,netlinkRole:'FEE',displayName:'Παροχή υπηρεσίας Netlink'}]};
 }
 const repository={load,
  async claim(scope,id,paid){return db.$transaction(async tx=>{
   const raw=(await tx.$queryRaw`SELECT * FROM "NetlinkTransaction" WHERE "companyId"=${scope.companyId} AND "storeId"=${scope.storeId} AND "requestId"=${id} AND "issuanceIntentEnc" IS NOT NULL FOR UPDATE`)[0];
   if(raw?.status!=='READY_FOR_PAYMENT')return false;
   const current=openIntent(raw,scope),proof=await evidence(tx,scope,current);assertNetlinkPaidSale({...proof,scope,intent:current});
   const n=await tx.$executeRaw`UPDATE "NetlinkTransaction" SET "status"='EXECUTING',"saleId"=${proof.sale.id},"paymentMethod"=${paid.paymentMethod},"providerDispatchedAt"=NOW(),"fiscalNumber"=${proof.fiscal.fiscalNumber},"fiscalIssuedAt"=${proof.fiscal.issuedAt},"fiscalEvidence"=${JSON.stringify({type:proof.fiscal.evidenceType,id:proof.fiscal.evidenceId,number:proof.fiscal.fiscalNumber,cardEvidence:proof.cardProof?.evidenceId||null})}::jsonb,"updatedAt"=NOW() WHERE "id"=${raw.id} AND "status"='READY_FOR_PAYMENT'`;
   return Number(n)===1;
  },{maxWait:5000,timeout:20000})},
  async uncertain(scope,id,code){await db.$executeRaw`UPDATE "NetlinkTransaction" SET "status"='UNKNOWN',"errorCode"=${code},"errorMessage"='Το αποτέλεσμα χρειάζεται διασταύρωση με τη Netlink. Μην επαναλάβετε την αγορά.',"updatedAt"=NOW() WHERE "companyId"=${scope.companyId} AND "storeId"=${scope.storeId} AND "requestId"=${id} AND "status"='EXECUTING'`},
  async review(scope,id,encrypted){await db.$executeRaw`UPDATE "NetlinkTransaction" SET "status"='AMOUNT_REVIEW',"issuanceResultEnc"=${encrypted},"errorCode"='NETLINK_PROVIDER_RESULT_REVIEW',"updatedAt"=NOW() WHERE "companyId"=${scope.companyId} AND "storeId"=${scope.storeId} AND "requestId"=${id} AND "status"='EXECUTING'`},
  async complete(scope,id,v){const n=await db.$executeRaw`UPDATE "NetlinkTransaction" SET "status"='COMPLETED',"issuanceResultEnc"=${v.encrypted},"providerTransactionId"=${v.providerTransactionId},"providerReference"=${v.reference},"commissionAmount"=${v.cardCents/100*.01},"completedAt"=NOW(),"updatedAt"=NOW(),"errorCode"=NULL,"errorMessage"=NULL WHERE "companyId"=${scope.companyId} AND "storeId"=${scope.storeId} AND "requestId"=${id} AND "status"='EXECUTING'`;if(Number(n)!==1)throw Error('Netlink result not persisted');}
 };
 return {
  load,view,
  async create(scope,{requestId,checkoutId,productId,actorId,actorName}){
   const previous=await load(scope,requestId);if(previous){if(previous.operatorId!==actorId)throw netlinkPaidError('NETLINK_INTENT_OPERATOR','Το ίδιο αίτημα ανήκει σε διαφορετικό χειριστή.',403);if(previous.productId!==productId||previous.checkoutId!==checkoutId)fail('NETLINK_DUPLICATE_REQUEST','Το ίδιο αίτημα αφορά διαφορετική κάρτα.');return {...(previous.status==='READY_FOR_PAYMENT'?checkoutView(previous,await readNetlinkPaidConfig(db,scope)):view(previous)),idempotentReplay:true}}
   const sale=(await db.$queryRaw`SELECT "id" FROM "Sale" WHERE "companyId"=${scope.companyId} AND "storeId"=${scope.storeId} AND "clientTransactionId"=${checkoutId} LIMIT 1`)[0];
   if(sale)fail('NETLINK_SALE_ALREADY_EXISTS','Η κάρτα πρέπει να επιλεγεί πριν από την πληρωμή.');
   const config=await readNetlinkPaidConfig(db,scope),card=fixedCardFromMenu(await provider(scope).menu(),productId);
   const value={version:1,...binding(scope,requestId),checkoutId,productId,title:card.title,amount:card.amountCents/100,saleProductId:config.saleProduct.id,serviceFeeProductId:config.serviceFeeProduct.id,providerRequestId:BigInt('0x'+crypto.randomBytes(16).toString('hex')).toString(),expiresAt:new Date(clock().getTime()+30*60000).toISOString()};
   const enc=encryptStoreIntegrationValue(value),total=(card.amountCents+50)/100;
   const inserted=await db.$executeRaw`INSERT INTO "NetlinkTransaction" ("id","companyId","storeId","requestId","checkoutId","productId","flow","status","amount","serviceFeeAmount","customerTotal","operatorId","operatorName","issuanceIntentEnc") VALUES (${crypto.randomUUID()},${scope.companyId},${scope.storeId},${requestId},${checkoutId},${productId},'PAID_ISSUANCE_V1','READY_FOR_PAYMENT',${value.amount},0.50,${total},${actorId},${actorName||null},${enc}) ON CONFLICT ("storeId","requestId") DO NOTHING`;
   const saved=await load(scope,requestId);if(!saved||saved.productId!==productId)fail('NETLINK_DUPLICATE_REQUEST','Το ίδιο αίτημα αφορά διαφορετική κάρτα.');
   return {...checkoutView(saved,config),idempotentReplay:Number(inserted)===0};
  },
  async cashReceived(scope,checkoutId,{requestIds,actorId,amount}){
   if(!actorId||!requestIds?.length||moneyCents(amount)<=0)fail('NETLINK_CASH_NOT_RECEIVED','Επιβεβαίωσε το συνολικό ποσό που εισπράχθηκε.');
   return db.$transaction(async tx=>{for(const id of requestIds){const row=await load(scope,id,tx);if(!row||row.checkoutId!==checkoutId||row.status!=='READY_FOR_PAYMENT')fail('NETLINK_INTENT_NOT_READY','Η κάρτα δεν συμφωνεί με το καλάθι.');}
    const n=await tx.$executeRaw`UPDATE "NetlinkTransaction" SET "cashReceivedAt"=NOW(),"cashReceivedBy"=${actorId},"cashReceivedTotal"=${amount},"updatedAt"=NOW() WHERE "companyId"=${scope.companyId} AND "storeId"=${scope.storeId} AND "checkoutId"=${checkoutId} AND "requestId"=ANY(${requestIds}::text[]) AND "status"='READY_FOR_PAYMENT'`;
    if(Number(n)!==requestIds.length)fail('NETLINK_INTENT_NOT_READY','Το καλάθι άλλαξε πριν από την επιβεβαίωση.');return {cashReceived:true};
   });
  },
  async issue(scope,id){return dispatchPaidNetlink({repository,scope,requestId:id,loadEvidence:intent=>evidence(db,scope,intent),provider:provider(scope),encryptResult:async result=>encryptStoreIntegrationValue({...binding(scope,id),result})})},
  async receipt(scope,id){const row=await load(scope,id);if(!row||row.status!=='COMPLETED'||!row.issuanceResultEnc)fail('NETLINK_RECEIPT_UNAVAILABLE','Δεν υπάρχει ολοκληρωμένη κάρτα για εκτύπωση.');const value=decryptStoreIntegrationValue(row.issuanceResultEnc);if(Object.entries(binding(scope,id)).some(([k,v])=>value[k]!==v))fail('NETLINK_INTENT_SCOPE','Η εκτύπωση δεν αντιστοιχεί στο κατάστημα.');const data=value.result?.data??value.result;return {requestId:id,title:row.title,amount:Number(row.amount),serviceFeeAmount:.5,customerTotal:Number(row.customerTotal),fiscalNumber:row.fiscalNumber,lines:data.lines,transactionId:data.transactionId,reference:data.reference||null}},
  async list(scope,operatorId=null){const rows=await db.$queryRaw`SELECT n.*,s."id" AS "paidSaleId" FROM "NetlinkTransaction" n LEFT JOIN "Sale" s ON s."companyId"=n."companyId" AND s."storeId"=n."storeId" AND s."clientTransactionId"=n."checkoutId" AND s."status"='COMPLETED' AND s."fiscalStatus"='ISSUED' WHERE n."companyId"=${scope.companyId} AND n."storeId"=${scope.storeId} AND n."issuanceIntentEnc" IS NOT NULL AND (${operatorId}::text IS NULL OR n."operatorId"=${operatorId}) ORDER BY n."createdAt" DESC LIMIT 100`;const paidIds=[...new Set(rows.map(r=>r.paidSaleId).filter(Boolean))];
   let audits=[];if(paidIds.length){const exists=(await db.$queryRaw`SELECT to_regclass(format('%I.%I',current_schema(),'StoreOperatorAudit'))::text AS name`)[0]?.name;if(exists)audits=await db.$queryRaw`SELECT "details"->>'saleId' AS "saleId","details"->'netlinkIntents' AS "intentIds" FROM "StoreOperatorAudit" WHERE "companyId"=${scope.companyId} AND "storeId"=${scope.storeId} AND "eventType"='POS_SALE_COMPLETED' AND "details"->>'saleId'=ANY(${paidIds}::text[])`;}
   return rows.map(row=>({...view(openIntent(row,scope)),paid:row.status==='COMPLETED'||audits.some(a=>a.saleId===row.paidSaleId&&Array.isArray(a.intentIds)&&a.intentIds.includes(row.requestId))}))}
 };
}
export async function assertNetlinkCheckoutDraft(db,scope,body,items,summary){
 const marked=(body.items||[]).filter(x=>String(x.overrideReason||'').startsWith('NETLINK_'));
 if(!marked.length)return;
 if(process.env.NETLINK_ENABLE_EXECUTE!=='true')fail('NETLINK_EXECUTE_LOCKED','Η έκδοση καρτών δεν έχει ενεργοποιηθεί.');
 const ids=netlinkIntentIdsFromItems(marked),checkoutId=body.clientTransactionId;
 if(!checkoutId||!ids.length||ids.length>50||marked.length!==ids.length*2||!['CASH','CARD'].includes(body.paymentMethod)||body.tableOrderId||body.onlineOrderId||body.redeemPoints||body.audience!=='NORMAL'||body.operationChannel!=='COUNTER')fail('NETLINK_CHECKOUT_REQUIRED','Οι κάρτες πληρώνονται με μετρητά ή κάρτα, μαζί με την αυτόματη παροχή.');
 for(const id of ids){
  const row=openIntent((await db.$queryRaw`SELECT * FROM "NetlinkTransaction" WHERE "companyId"=${scope.companyId} AND "storeId"=${scope.storeId} AND "requestId"=${id} AND "issuanceIntentEnc" IS NOT NULL LIMIT 1`)[0],scope);
  if(!row||row.checkoutId!==checkoutId||row.status!=='READY_FOR_PAYMENT')fail('NETLINK_INTENT_NOT_READY','Η κάρτα δεν αντιστοιχεί στο τρέχον καλάθι.');
  if(!body.fiscalRequestId&&Date.now()>new Date(row.expiresAt).getTime())fail('NETLINK_QUOTE_EXPIRED','Η επιλογή της κάρτας έληξε. Επίλεξέ την ξανά πριν πληρώσεις.');
  const indexes=body.items.flatMap((r,i)=>netlinkItemMarker(r)?.requestId===id?[i]:[]);
  for(const [role,productId] of [['CARD',row.saleProductId],['FEE',row.serviceFeeProductId]]){const matches=indexes.filter(i=>netlinkItemMarker(body.items[i])?.role===role&&body.items[i].productId===productId);if(matches.length!==1)fail('NETLINK_PAID_LINES_MISMATCH','Κάθε κάρτα χρειάζεται τη δική της παροχή0,50€.');}
  const mapped=indexes.map(i=>({productId:items[i].productId||items[i].id,quantity:items[i].quantity,unitPrice:items[i].effectiveUnitPrice??items[i].unitPrice,lineTotal:items[i].lineTotal,discount:items[i].discount||0}));
  assertNetlinkAmounts({intent:row,lines:mapped,totalValue:row.customerTotal});
  if(body.paymentMethod==='CASH'&&(!row.cashReceivedAt||!row.cashReceivedBy||moneyCents(row.cashReceivedTotal)!==moneyCents(summary.total)))fail('NETLINK_CASH_NOT_RECEIVED','Επιβεβαίωσε ότι εισέπραξες το συνολικό ποσό του καλαθιού.');
 }
}
