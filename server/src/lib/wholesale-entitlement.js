import {Prisma} from '@prisma/client';
import {prisma} from '../prisma.js';
export const WHOLESALE_MODULE='WHOLESALE_B2B';

// Reused by the portal/seller live-principal queries with these exact aliases.
// Commercial activation is an explicit CompanyModule grant, not proof that a
// price field represents collected payment. This module has no trial/default or
// Super Admin operational bypass and does not change other modules' policies.
export const wholesaleEntitlementSql=Prisma.sql`co."active"=true AND co."licenseStatus"='ACTIVE' AND (co."subscriptionStartsAt" IS NULL OR co."subscriptionStartsAt"<=clock_timestamp()) AND (co."subscriptionEndsAt" IS NULL OR co."subscriptionEndsAt">=clock_timestamp()) AND cm."moduleKey"='WHOLESALE_B2B' AND cm."active"=true AND (cm."startsAt" IS NULL OR cm."startsAt"<=clock_timestamp()) AND (cm."endsAt" IS NULL OR cm."endsAt">=clock_timestamp())`;
const error=(status,code,message)=>Object.assign(new Error(message),{status,code,moduleKey:WHOLESALE_MODULE});
function validCompany(companyId){return typeof companyId==='string'&&companyId.length>0&&companyId.length<=200&&companyId===companyId.trim()}
function time(value){return value==null?null:new Date(value).getTime()}

export async function getWholesaleEntitlement(db,companyId,{lock=false}={}){
  if(!validCompany(companyId))throw error(401,'WHOLESALE_AUTH_REQUIRED','Απαιτείται έγκυρη σύνδεση εταιρείας.');
  const disabled={companyId,moduleKey:WHOLESALE_MODULE,enabled:false,expiresAt:null},share=lock?Prisma.sql`FOR SHARE`:Prisma.empty;
  const rows=await db.$queryRaw(Prisma.sql`SELECT co."id" AS "companyId",co."subscriptionStartsAt",co."subscriptionEndsAt",cm."startsAt" AS "moduleStartsAt",cm."endsAt" AS "moduleEndsAt" FROM "Company" co JOIN "CompanyModule" cm ON cm."companyId"=co."id" WHERE co."id"=${companyId} AND ${wholesaleEntitlementSql} ${share}`);
  if(!rows[0])return disabled;
  // A condition can be evaluated before a SHARE lock waits. Check the current
  // database wall clock once the checked company/module rows are actually held.
  const clock=await db.$queryRaw`SELECT clock_timestamp() AS "now"`,now=time(clock[0]?.now),row=rows[0];
  const starts=[time(row.subscriptionStartsAt),time(row.moduleStartsAt)],ends=[time(row.subscriptionEndsAt),time(row.moduleEndsAt)];
  if(now==null||!Number.isFinite(now)||[...starts,...ends].some(value=>value!==null&&!Number.isFinite(value))||starts.some(value=>value!==null&&value>now)||ends.some(value=>value!==null&&value<now))return disabled;
  const finiteEnds=ends.filter(value=>value!==null);
  return {companyId,moduleKey:WHOLESALE_MODULE,enabled:true,expiresAt:finiteEnds.length?new Date(Math.min(...finiteEnds)).toISOString():null};
}
export async function assertWholesaleEntitlement(db,companyId,options){
  const entitlement=await getWholesaleEntitlement(db,companyId,options);
  if(!entitlement.enabled)throw error(403,'WHOLESALE_MODULE_DISABLED','Το πληρωμένο module Χονδρική B2B δεν είναι ενεργό για την εταιρεία.');
  return entitlement;
}
export function createWholesaleEntitlementGuard({db=prisma}={}){
  return async(req,res,next)=>{try{await assertWholesaleEntitlement(db,req.user?.companyId);next()}catch(failure){
    if(failure.status===401||failure.status===403)return res.status(failure.status).json({error:failure.message,code:failure.code,moduleKey:WHOLESALE_MODULE});next(failure);
  }};
}
