import {recordNetlinkVoucherDelivery} from '../integrations/netlink/voucher-delivery.js';
import {readReviewedRecoveryAccess} from '../integrations/netlink/paid-recovery-access.js';
import {createNetlinkPaidRecovery} from '../integrations/netlink/paid-recovery.js';
import {Router} from 'express';
import {z} from 'zod';
import {createNetlinkPaidStore} from '../integrations/netlink/paid-issuance-store.js';
const scopeSchema=z.object({storeId:z.string().trim().min(1).max(200)});
const requestId=z.string().uuid();
export function createPaidNetlinkRouter({db,provider,storeFor,prepareCheckout}){
 const router=Router(),store=createNetlinkPaidStore({db,provider}),recovery=createNetlinkPaidRecovery({db,provider});
 const privileged=user=>['OWNER','ADMIN','MANAGER'].includes(user?.role);
 const storeOperator=(user,tenant)=>user?.tokenType==='STORE_OPERATOR'&&['EMPLOYEE','MANAGER'].includes(user.role)&&user.storeId===tenant.storeId;
 async function authorized(req,tenant,id,{reviewedRecovery=false,receipt=false}={}){
  const row=await store.load(tenant,id);if(!row)throw Object.assign(new Error('Δεν βρέθηκε η κάρτα.'),{status:404});
  if(row.operatorId===req.user.id||privileged(req.user))return row;
  if((reviewedRecovery||receipt)&&storeOperator(req.user,tenant)){
   const access=(await readReviewedRecoveryAccess(db,tenant,req.user.id,id))[0];
   if(access&&(access.handledByActor||reviewedRecovery&&access.ready))return row;
  }
  throw Object.assign(new Error('Η κάρτα ανήκει σε διαφορετικό χειριστή.'),{status:403});
 }
 const enabled=()=>{if(process.env.NETLINK_ENABLE_EXECUTE!=='true')throw Object.assign(new Error('Η έκδοση καρτών δεν έχει ενεργοποιηθεί κεντρικά.'),{status:409,code:'NETLINK_EXECUTE_LOCKED'})};
 async function scope(req,input){const {storeId}=scopeSchema.parse(input);await storeFor(req,storeId);return {companyId:req.user.companyId,storeId}}
 router.get('/issuance-intents',async(req,res,next)=>{try{
  res.set('Cache-Control','no-store');const tenant=await scope(req,req.query),isPos=storeOperator(req.user,tenant);
  const shared=isPos&&!privileged(req.user)?await readReviewedRecoveryAccess(db,tenant,req.user.id):[];
  res.json({items:await store.list(tenant,privileged(req.user)?null:req.user.id,shared.map(x=>x.requestId)),canAuthorizeRecovery:privileged(req.user),canReprintIssued:privileged(req.user),canCompleteReviewedRecovery:privileged(req.user)||isPos,recoveryStationId:privileged(req.user)?(await recovery.reviewContext(tenant).catch(()=>null))?.stationId||null:null,recoveryEnabled:process.env.NETLINK_ENABLE_PAID_RECOVERY==='true'});
 }catch(e){next(e)}});
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
  if(!privileged(req.user)&&!storeOperator(req.user,tenant))throw Object.assign(new Error('Η ολοκλήρωση απαιτεί είσοδο στο POS του καταστήματος.'),{status:403});await authorized(req,tenant,id,{reviewedRecovery:true});
  if(process.env.NETLINK_ENABLE_PAID_RECOVERY!=='true')throw Object.assign(new Error('Η ολοκλήρωση πληρωμένων καρτών δεν έχει ενεργοποιηθεί.'),{status:409,code:'NETLINK_RECOVERY_LOCKED'});
  res.json(await recovery.fulfill(tenant,id,{actorId:req.user.id}));
 }catch(e){next(e)}});
 router.post('/issuance-intents/:requestId/receipt',async(req,res,next)=>{try{
  res.set('Cache-Control','no-store');const tenant=await scope(req,req.body),id=requestId.parse(req.params.requestId);await authorized(req,tenant,id,{receipt:true});const receipt=await store.receipt(tenant,id);
  const delivery=await recordNetlinkVoucherDelivery({db,scope:tenant,requestId:id,actorId:req.user.id,operatorId:req.user.operatorId||req.user.id,role:req.user.role,allowReprint:privileged(req.user)});
  res.json({...receipt,...delivery});
 }catch(e){next(e)}});
 return router;
}
