import {Router} from 'express';
import {z} from 'zod';
import {prisma} from '../prisma.js';
import {requireStaffAction} from '../services/backoffice-staff-access.js';
import {companyModuleState,effectiveModuleEnabled} from '../middleware/module-access.js';
import {assertLifecycleMutation} from '../services/store-lifecycle-generation.js';
import {lifecycleContext} from '../services/store-lifecycle-context.js';
import {previewOwnerWithdrawal,recordOwnerWithdrawal} from '../services/owner-cash-withdrawal.js';

export const ownerWithdrawalCapability='payments.owner-withdrawal';
const fail=(status,message)=>{throw Object.assign(new Error(message),{status})};
export function assertOwnerWithdrawalActor(user,storeId){
 if(!user||user.tokenType==='STORE_OPERATOR')fail(403,'Δεν έχεις δικαίωμα καταχώρισης ανάληψης ιδιοκτήτη.');
 if(user.staffAccess===true){if(user.storeId!==storeId)fail(403,'Επίλεξε το εξουσιοδοτημένο κατάστημα.');return;}
 if(!['OWNER','SUPER_ADMIN'].includes(user.role)&&user.isSuperAdmin!==true)fail(403,'Απαιτείται Ιδιοκτήτης, Super Admin ή ειδικό δικαίωμα Υπευθύνου.');
}
export function createOwnerWithdrawalRouter(db=prisma){
 const router=Router(),wrap=fn=>async(req,res)=>{try{await fn(req,res)}catch(e){res.status(e?.name==='ZodError'?400:e.status||500).json({error:e?.name==='ZodError'?'Έλεγξε ποσό, ώρα, βάρδια και αιτιολογία.':e.message})}};
 const scope=req=>{
  const storeId=z.string().min(1).max(180).parse(req.params.storeId),user=req.user;assertOwnerWithdrawalActor(user,storeId);
  return {companyId:user.companyId,storeId,user,verify:async tx=>{
   assertOwnerWithdrawalActor(user,storeId);
   const store=(await tx.$queryRaw`SELECT "id" FROM "Store" WHERE "id"=${storeId} AND "companyId"=${user.companyId} AND "active"=true FOR SHARE`)[0];
   if(!store)fail(404,'Δεν βρέθηκε ενεργό κατάστημα της εταιρείας.');
   if(user.staffAccess===true)await requireStaffAction(tx,req,storeId,ownerWithdrawalCapability);
   else{
    if(!user.sessionId||!Number.isInteger(user.sessionVersion))fail(401,'Απαιτείται ενεργή προσωπική σύνδεση.');
    const rows=await tx.$queryRaw`SELECT u."role"::text AS role,u."companyId" FROM "User" u JOIN "UserSession" s ON s."userId"=u."id" WHERE u."id"=${user.id} AND s."id"=${user.sessionId} AND u."sessionVersion"=${user.sessionVersion} AND s."revokedAt" IS NULL AND s."expiresAt">clock_timestamp() AND u."mustChangePassword"=false FOR SHARE OF u,s`;
    if(!rows[0]||!(rows[0].role==='SUPER_ADMIN'||rows[0].role==='OWNER'&&rows[0].companyId===user.companyId&&user.role==='OWNER'))fail(401,'Η προσωπική σύνδεση ή ο ρόλος άλλαξε.');
   }
   const license=await companyModuleState(user.companyId,{db:tx});
   const paid=(await tx.$queryRaw`SELECT "active","startsAt","endsAt" FROM "StorePaidModule" WHERE "companyId"=${user.companyId} AND "storeId"=${storeId} AND "moduleKey"='CASH_CONTROL' LIMIT 1`)[0];
   if(!license?.licenseAllowed||!effectiveModuleEnabled(license.activeModules.includes('CASH_CONTROL'),paid?{...paid,configured:true}:{configured:false}))fail(403,'Η λειτουργία ταμείου δεν είναι ενεργή στο κατάστημα.');
   await assertLifecycleMutation(tx,{companyId:user.companyId,storeId},lifecycleContext()[storeId]??'0');
  }};
 };
 router.get('/stores/:storeId/owner-withdrawals/sessions',wrap(async(req,res)=>{
  const access=scope(req),date=z.string().regex(/^\d{4}-\d{2}-\d{2}$/).parse(req.query.date);
  const sessions=await db.$transaction(async tx=>{await access.verify(tx);const rows=await tx.$queryRaw`SELECT "id","terminalPos","openedByName","openedAt","closedAt","status","expectedOperational","actualOperational","variance" FROM "CashShiftSession" WHERE "companyId"=${access.companyId} AND "storeId"=${access.storeId} AND "status" IN ('OPEN','CLOSED') AND ("openedAt" AT TIME ZONE 'Europe/Athens')::date<=${date}::date AND ("closedAt" IS NULL OR ("closedAt" AT TIME ZONE 'Europe/Athens')::date>=${date}::date) ORDER BY "openedAt" DESC LIMIT 101`;if(rows.length>100)fail(409,'Πάρα πολλές βάρδιες· χρειάζεται στενότερος έλεγχος.');await access.verify(tx);return rows;});
  res.set('Cache-Control','private, no-store').json({storeId:access.storeId,date,timeZone:'Europe/Athens',sessions});
 }));
 router.post('/stores/:storeId/owner-withdrawals/preview',wrap(async(req,res)=>{const result=await previewOwnerWithdrawal(db,scope(req),req.body);res.set('Cache-Control','private, no-store').json(result)}));
 router.post('/stores/:storeId/owner-withdrawals/confirm',wrap(async(req,res)=>{const result=await recordOwnerWithdrawal(db,scope(req),req.body);res.status(result.duplicate?200:201).json(result)}));
 return router;
}
export default createOwnerWithdrawalRouter();
