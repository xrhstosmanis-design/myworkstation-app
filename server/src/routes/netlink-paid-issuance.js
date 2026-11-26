import {createNetlinkPaidRecovery} from '../integrations/netlink/paid-recovery.js';
import {Router} from 'express';
import {z} from 'zod';
import crypto from 'node:crypto';
import {createNetlinkPaidStore} from '../integrations/netlink/paid-issuance-store.js';
const scopeSchema=z.object({storeId:z.string().trim().min(1).max(200)});
const requestId=z.string().uuid();
export function createPaidNetlinkRouter({db,provider,storeFor,prepareCheckout}){
 const router=Router(),store=createNetlinkPaidStore({db,provider}),recovery=createNetlinkPaidRecovery({db,provider});
 const privileged=user=>['OWNER','ADMIN','MANAGER'].includes(user?.role);
 async function authorized(req,tenant,id){const row=await store.load(tenant,id);if(!row)throw Object.assign(new Error('Δεν βρέθηκε η κάρτα.'),{status:404});if(row.operatorId!==req.user.id&&!privileged(req.user))throw Object.assign(new Error('Η κάρτα ανήκει σε διαφορετικό χειριστή.'),{status:403});return row;}
 const enabled=()=>{if(process.env.NETLINK_ENABLE_EXECUTE!=='true')throw Object.assign(new Error('Η έκδοση καρτών δεν έχει ενεργοποιηθεί κεντρικά.'),{status:409,code:'NETLINK_EXECUTE_LOCKED'})};
 async function scope(req,input){const {storeId}=scopeSchema.parse(input);await storeFor(req,storeId);return {companyId:req.user.companyId,storeId}}
 router.get('/issuance-intents',async(req,res,next)=>{try{res.set('Cache-Control','no-store');const tenant=await scope(req,req.query);res.json({items:await store.list(tenant,privileged(req.user)?null:req.user.id),canAuthorizeRecovery:privileged(req.user),recoveryStationId:privileged(req.user)?(await recovery.reviewContext(tenant).catch(()=>null))?.stationId||null:null,recoveryEnabled:process.env.NETLINK_ENABLE_PAID_RECOVERY==='true'})}catch(e){next(e)}});
 router.post('/issuance-intents',async(req,res,next)=>{try{
  enabled();const body=z.object({storeId:scopeSchema.shape.storeId,requestId,checkoutId:requestId,productId:z.string().trim().min(1).max(160)}).strict().parse(req.body);const tenant=await scope(req,body);
  if(prepareCheckout)await prepareCheckout(db,tenant,body.checkoutId,req);
  res.status(201).json(await store.create(tenant,{...body,actorId:req.user.id,actorName:req.user.fullName||null}));
 }catch(e){next(e)}});
 router.post('/issuance-checkouts/:checkoutId/cash-received',async(req,res,next)=>{try{
  enabled();const body=scopeSchema.extend({received:z.literal(true),amount:z.number().positive(),requestIds:z.array(requestId).min(1).max(50).refine(ids=>new Set(ids).size===ids.length)}).strict().parse(req.body);
  const tenant=await scope(req,body),checkoutId=requestId.parse(req.params.checkoutId);
  for(const id of body.requestIds){const row=await authorized(req,tenant,id);if(row.checkoutId!==checkoutId)throw Object.assign(new Error('Οι κάρτες δεν ανήκουν στο ίδιο καλάθι.'),{status:409})}
  res.json(await store.cashReceived(tenant,checkoutId,{requestIds:body.requestIds,actorId:req.user.id,amount:body.amount}));
 }catch(e){next(e)}});
 router.post('/issuance-intents/:requestId/issue',async(req,res,next)=>{try{enabled();res.set('Cache-Control','no-store');const tenant=await scope(req,req.body),id=requestId.parse(req.params.requestId);await authorized(req,tenant,id);res.json(await store.issue(tenant,id))}catch(e){next(e)}});
 // Recovery is separately gated: reviewing provider evidence never purchases a card.
 router.post('/issuance-intents/:requestId/nonexecution-review',async(req,res,next)=>{try{
  res.set('Cache-Control','no-store');const body=scopeSchema.extend({confirmedNotExecuted:z.literal(true),expectedStationId:z.string().regex(/^[0-9]{1,20}$/),providerReference:z.string().trim().min(10).max(500),confirmedAt:z.string().datetime({offset:true}),expectedUpdatedAt:z.string().datetime({offset:true})}).strict().parse(req.body);
  const tenant=await scope(req,body),id=requestId.parse(req.params.requestId);if(!privileged(req.user))throw Object.assign(new Error('Ο έλεγχος παρόχου απαιτεί υπεύθυνο καταστήματος.'),{status:403});await authorized(req,tenant,id);
  res.json(await recovery.authorize(tenant,id,{...body,actorId:req.user.id}));
 }catch(e){next(e)}});
 router.post('/issuance-intents/:requestId/recover-paid',async(req,res,next)=>{try{
  res.set('Cache-Control','no-store');const body=scopeSchema.extend({fulfillExistingPaidPurchase:z.literal(true)}).strict().parse(req.body),tenant=await scope(req,body),id=requestId.parse(req.params.requestId);
  if(!privileged(req.user))throw Object.assign(new Error('Η ολοκλήρωση απαιτεί υπεύθυνο καταστήματος.'),{status:403});await authorized(req,tenant,id);
  if(process.env.NETLINK_ENABLE_PAID_RECOVERY!=='true')throw Object.assign(new Error('Η ολοκλήρωση πληρωμένων καρτών δεν έχει ενεργοποιηθεί.'),{status:409,code:'NETLINK_RECOVERY_LOCKED'});
  res.json(await recovery.fulfill(tenant,id));
 }catch(e){next(e)}});
 router.post('/issuance-intents/:requestId/receipt',async(req,res,next)=>{try{
  res.set('Cache-Control','no-store');const tenant=await scope(req,req.body),id=requestId.parse(req.params.requestId);await authorized(req,tenant,id);const receipt=await store.receipt(tenant,id);
  await db.$executeRaw`INSERT INTO "StoreOperatorAudit" ("id","companyId","storeId","operatorId","actorId","eventType","details") VALUES (${crypto.randomUUID()},${tenant.companyId},${tenant.storeId},${req.user.operatorId||req.user.id},${req.user.id},'NETLINK_RECEIPT_VIEWED',${JSON.stringify({requestId:id})}::jsonb)`;
  res.json(receipt);
 }catch(e){next(e)}});
 return router;
}
