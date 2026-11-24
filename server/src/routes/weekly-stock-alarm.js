import {Router} from 'express';
import {randomUUID} from 'node:crypto';
import {z} from 'zod';
import {prisma as defaultPrisma} from '../prisma.js';
import {weeklyStockAlarmReadiness} from '../services/weekly-stock-alarm-schema.js';
import {requireStoreModule,isPlatformSuperAdmin} from '../middleware/module-access.js';
import {readOrderSuggestions} from './order-suggestions.js';
import {stockAlarmPolicy,calculateWeeklyStockAlarm,stockAlarmWeek} from '../lib/weekly-stock-alarm.js';
import {readStockAlarmPolicy,stockAlarmRows} from '../services/weekly-stock-alarm.js';
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
export function createWeeklyStockAlarmRouter({db=defaultPrisma,readiness=weeklyStockAlarmReadiness}={}){
const prisma=db,router=Router();
const schemaGuard=async(req,res,next)=>{try{const state=await readiness(prisma);if(!state.ready)throw fail(503,'Το εβδομαδιαίο alarm περιμένει ελεγχόμενη ένταξη των πινάκων του στο σχήμα εγκατάστασης. Η πρόταση POS παραμένει διαθέσιμη με δικαίωμα.');next()}catch(error){next(error)}};
const owner=(req,res,next)=>{
 if(req.user?.staffAccess===true||req.user?.tokenType==='STORE_OPERATOR'||(!isPlatformSuperAdmin(req.user)&&!['OWNER','ADMIN'].includes(req.user?.role)))return next(fail(403,'Οι ρυθμίσεις διαχειρίζονται κεντρικά από Ιδιοκτήτη ή Διαχειριστή.'));
 next();
};
const moduleGuard=requireStoreModule('ORDER_SUGGESTIONS');
router.get('/stores',owner,async(req,res,next)=>{try{res.set('Cache-Control','no-store');res.json({stores:await prisma.store.findMany({where:{companyId:req.user.companyId,active:true},select:{id:true,name:true},orderBy:{name:'asc'}})})}catch(e){next(e)}});
const route=fn=>async(req,res,next)=>{try{res.set('Cache-Control','no-store');if(req.targetStore&&!await prisma.store.findFirst({where:{id:req.targetStore.id,companyId:req.targetStore.companyId,active:true},select:{id:true}}))throw fail(404,'Δεν βρέθηκε ενεργό κατάστημα.');await fn(req,res)}catch(e){if(e instanceof z.ZodError)e=fail(400,'Έλεγξε τις ρυθμίσεις.');next(e)}};
// Admission must call next after checking the current grant, before license/module admission.
const posAdmission=async(req,res,next)=>{try{await requirePosOrderSuggestion(prisma,req.user,req.params.storeId);req.user={...req.user,permissions:[...(req.user.permissions||[]),'ORDER_SUGGESTIONS']};next()}catch(e){next(e)}};
router.get('/stores/:storeId/permission',posAdmission,moduleGuard,route(async(req,res)=>{res.json({storeId:req.targetStore.id,allowed:true})}));
router.get('/stores/:storeId/proposal',posAdmission,moduleGuard,route(async(req,res)=>{
 const options=z.object({historyDays:z.coerce.number().int().min(7).max(90).default(28),coverageDays:z.coerce.number().int().min(1).max(60).default(7),leadDays:z.coerce.number().int().min(0).max(30).default(3)}).parse(req.query);
 const result=await readOrderSuggestions(prisma,{storeId:req.targetStore.id,companyId:req.targetStore.companyId,options});
 await requirePosOrderSuggestion(prisma,req.user,req.params.storeId);res.json(result);
}));
router.get('/stores/:storeId/settings',owner,moduleGuard,schemaGuard,route(async(req,res)=>{
 const {companyId,id:storeId}=req.targetStore,policy=await readStockAlarmPolicy(prisma,companyId,storeId);
 const stores=await prisma.store.findMany({where:{companyId,active:true},select:{id:true,name:true},orderBy:{name:'asc'}});
 const history=await prisma.$queryRaw`SELECT "productId","week","previousMinimum","nextMinimum","status","details","createdAt" FROM "WeeklyStockAlarmHistory" WHERE "companyId"=${companyId} AND "storeId"=${storeId} ORDER BY "createdAt" DESC,"id" DESC LIMIT 50`;
 res.json({storeId,stores,policy,history});
}));
const settingsSchema=z.object({scope:z.enum(['COMPANY','STORE']),expectedVersion:z.number().int().min(0),settings:z.object({enabled:z.boolean(),historyDays:z.number().int().min(7).max(90),leadDays:z.number().int().min(0).max(30),safetyDays:z.number().int().min(0).max(30),floor:z.number().min(0).max(1e8)}).strict()}).strict();
router.put('/stores/:storeId/settings',owner,moduleGuard,schemaGuard,route(async(req,res)=>{
 const body=settingsSchema.parse(req.body),{companyId,id:storeId}=req.targetStore,scope=body.scope==='COMPANY'?'COMPANY':storeId,settings=stockAlarmPolicy(body.settings);
 await prisma.$transaction(async tx=>{
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${companyId}),0)`;
  const [before]=await tx.$queryRaw`SELECT "version","settings" FROM "WeeklyStockAlarmPolicy" WHERE "companyId"=${companyId} AND "scope"=${scope} FOR UPDATE`;
  if((before?.version||0)!==body.expectedVersion)throw fail(409,'Οι ρυθμίσεις άλλαξαν. Ανανέωσε πριν αποθηκεύσεις.');
  await tx.$executeRaw`INSERT INTO "WeeklyStockAlarmPolicy" ("companyId","scope","settings","version") VALUES (${companyId},${scope},${JSON.stringify(settings)}::jsonb,1) ON CONFLICT("companyId","scope") DO UPDATE SET "settings"=EXCLUDED."settings","version"="WeeklyStockAlarmPolicy"."version"+1,"updatedAt"=NOW()`;
  await tx.$executeRaw`INSERT INTO "WeeklyStockAlarmHistory" ("id","companyId","storeId","week","status","details","actorId") VALUES (${randomUUID()},${companyId},${storeId},${stockAlarmWeek()},'POLICY',${JSON.stringify({scope,before:before?.settings||null,after:settings})}::jsonb,${req.user.id})`;
 });res.json({ok:true,storeId});
}));
router.get('/stores/:storeId/preview',owner,moduleGuard,schemaGuard,route(async(req,res)=>{
 const {companyId,id:storeId}=req.targetStore,policy=await readStockAlarmPolicy(prisma,companyId,storeId),now=new Date();
 const query=z.object({q:z.string().max(120).default(''),after:z.string().max(160).default('')}).parse(req.query);
 const batch=await stockAlarmRows(prisma,{companyId,storeId,settings:policy.settings,now,limit:101,query:query.q,after:query.after}),rows=batch.slice(0,100);
 res.json({storeId,limit:100,nextAfter:batch.length>100?rows.at(-1).productId:null,rows:rows.map(row=>({...row,result:calculateWeeklyStockAlarm(row,{...policy.settings,leadDays:row.leadDays==null?policy.settings.leadDays:Number(row.leadDays)},now)}))});
}));
const productSchema=z.object({mode:z.enum(['AUTO','MANUAL']),floor:z.number().min(0).max(1e8).nullable(),leadDays:z.number().int().min(0).max(30).nullable()}).strict();
router.put('/stores/:storeId/products/:productId',owner,moduleGuard,schemaGuard,route(async(req,res)=>{
 const body=productSchema.parse(req.body),{companyId,id:storeId}=req.targetStore,productId=req.params.productId;
 await prisma.$transaction(async tx=>{
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${companyId}),0)`;
  const [product]=await tx.$queryRaw`SELECT sp."minStock" FROM "StoreProduct" sp JOIN "Product" p ON p."id"=sp."productId" AND p."companyId"=${companyId} WHERE sp."storeId"=${storeId} AND sp."productId"=${productId} AND sp."active"=TRUE AND p."active"=TRUE FOR UPDATE OF sp`;
  if(!product)throw fail(404,'Δεν βρέθηκε ενεργό είδος στο κατάστημα.');
  await tx.$executeRaw`INSERT INTO "WeeklyStockAlarmProduct" ("companyId","storeId","productId","mode","floor","leadDays","baselineMinimum","lastApplied") VALUES (${companyId},${storeId},${productId},${body.mode},${body.floor},${body.leadDays},${product.minStock},${product.minStock}) ON CONFLICT("companyId","storeId","productId") DO UPDATE SET "mode"=EXCLUDED."mode","floor"=EXCLUDED."floor","leadDays"=EXCLUDED."leadDays","lastApplied"=EXCLUDED."lastApplied"`;
  await tx.$executeRaw`INSERT INTO "WeeklyStockAlarmHistory" ("id","companyId","storeId","week","status","details","actorId") VALUES (${randomUUID()},${companyId},${storeId},${stockAlarmWeek()},'PRODUCT_RULE',${JSON.stringify({productId,...body})}::jsonb,${req.user.id})`;
 });res.json({ok:true,storeId,productId});
}));
return router;
}
export default createWeeklyStockAlarmRouter();
