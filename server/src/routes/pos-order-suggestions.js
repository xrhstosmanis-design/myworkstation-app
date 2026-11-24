import {Router} from 'express';
import {z} from 'zod';
import {prisma as defaultPrisma} from '../prisma.js';
import {requireStoreModule,isPlatformSuperAdmin} from '../middleware/module-access.js';
import {readOrderSuggestions} from './order-suggestions.js';
const fail=(status,message)=>Object.assign(new Error(message),{status});
export async function requirePosOrderSuggestion(db,user,storeId){
 if(user?.staffAccess===true)throw fail(403,'Απαιτείται σύνδεση χειριστή POS.');
 if(user?.tokenType!=='STORE_OPERATOR'){
  if(!isPlatformSuperAdmin(user)&&!['OWNER','ADMIN'].includes(user?.role))throw fail(403,'Δεν επιτρέπεται πρόσβαση.');
  return;
 }
 if(user.storeId!==storeId)throw fail(403,'Η πρόταση αφορά μόνο το κατάστημα του POS.');
 const [row]=await db.$queryRaw`SELECT p."permissions",p."posAccess" FROM "StoreOperatorCredential" c JOIN "Employee" e ON e."id"=c."employeeId" AND e."storeId"=c."storeId" LEFT JOIN "StoreOperatorProfile" p ON p."companyId"=c."companyId" AND p."storeId"=c."storeId" AND p."employeeId"=c."employeeId" WHERE c."id"=${user.operatorId||user.id} AND c."companyId"=${user.companyId} AND c."storeId"=${storeId} AND c."active"=TRUE AND e."active"=TRUE`;
 if(!row||row.posAccess===false||row.permissions?.orderSuggestionsPos!==true)throw fail(403,'Δεν έχεις δικαίωμα «Πρόταση παραγγελίας στο POS».');
}
export function createPosOrderSuggestionsRouter({db=defaultPrisma,read=readOrderSuggestions}={}){
 const router=Router(),moduleGuard=requireStoreModule('ORDER_SUGGESTIONS');
 router.use((req,res,next)=>{res.set('Cache-Control','no-store');next()});
 const admission=async(req,res,next)=>{try{if((req.body?.storeId!==undefined&&req.body.storeId!==req.params.storeId)||(req.query?.storeId!==undefined&&req.query.storeId!==req.params.storeId))throw fail(400,'Το κατάστημα της αίτησης δεν συμφωνεί με το επιλεγμένο POS.');await requirePosOrderSuggestion(db,req.user,req.params.storeId);req.user={...req.user,permissions:[...(req.user.permissions||[]),'ORDER_SUGGESTIONS']};next()}catch(error){next(error)}};
 const handler=fn=>async(req,res,next)=>{try{
  if(!await db.store.findFirst({where:{id:req.targetStore.id,companyId:req.targetStore.companyId,active:true},select:{id:true}}))throw fail(404,'Δεν βρέθηκε ενεργό κατάστημα.');
  await fn(req,res);
 }catch(error){if(error instanceof z.ZodError)error=fail(400,'Έλεγξε τις ημέρες υπολογισμού.');next(error)}};
 router.get('/stores/:storeId/permission',admission,moduleGuard,handler(async(req,res)=>res.json({storeId:req.targetStore.id,allowed:true})));
 router.get('/stores/:storeId/proposal',admission,moduleGuard,handler(async(req,res)=>{
  const options=z.object({historyDays:z.coerce.number().int().min(7).max(90).default(28),coverageDays:z.coerce.number().int().min(1).max(60).default(7),leadDays:z.coerce.number().int().min(0).max(30).default(3)}).parse(req.query);
  const result=await read(db,{storeId:req.targetStore.id,companyId:req.targetStore.companyId,options});
  await requirePosOrderSuggestion(db,req.user,req.params.storeId);
  res.json(result);
 }));
 return router;
}
export default createPosOrderSuggestionsRouter();
