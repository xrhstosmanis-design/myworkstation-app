import {wholesaleEntitlementSql} from './wholesale-entitlement.js';
import {Prisma} from '@prisma/client';
import {createWholesaleSellerPrincipal,wholesaleError} from './wholesale-principal.js';
const managers=new Set(['SUPER_ADMIN','OWNER','ADMIN','MANAGER']);
const denied=()=>wholesaleError(401,'SELLER_AUTH_REQUIRED','Απαιτείται ενεργή προσωπική σύνδεση.');
const license=wholesaleEntitlementSql;
function claims(user){
  if(!user||user.tokenType!=='BACKOFFICE_USER'||['id','companyId','sessionId'].some(key=>typeof user[key]!=='string'||!user[key]||user[key]!==user[key].trim()||user[key].length>200)||!Number.isInteger(user.sessionVersion)||user.sessionVersion<0)throw denied();
}
function roleMatches(user,actual){
  if(actual==='SUPER_ADMIN')return user.isSuperAdmin===true&&user.platformRole==='SUPER_ADMIN'&&['OWNER','SUPER_ADMIN'].includes(user.role);
  return user.role===actual&&!user.isSuperAdmin&&(!user.platformRole||user.platformRole===actual);
}
async function liveUser(db,user,{lock=false,membership=false,manager=false}={}){
  claims(user);
  const share=lock?Prisma.sql`FOR SHARE`:Prisma.empty;
  const memberJoin=membership?Prisma.sql`JOIN "WholesaleSellerMembership" m ON m."companyId"=u."companyId" AND m."userId"=u."id" AND m."active"=true`:Prisma.empty;
  const rows=await db.$queryRaw(Prisma.sql`SELECT u."id",u."companyId" AS "userCompanyId",u."role",u."fullName",u."sessionVersion",s."id" AS "sessionId",s."expiresAt",co."subscriptionStartsAt",co."subscriptionEndsAt",cm."startsAt" AS "moduleStartsAt",cm."endsAt" AS "moduleEndsAt" FROM "UserSession" s JOIN "User" u ON u."id"=s."userId" JOIN "Company" co ON co."id"=${user.companyId} JOIN "CompanyModule" cm ON cm."companyId"=co."id" ${memberJoin} WHERE s."id"=${user.sessionId} AND u."id"=${user.id} AND s."revokedAt" IS NULL AND s."expiresAt">clock_timestamp() AND u."sessionVersion"=${user.sessionVersion} AND u."mustChangePassword"=false AND ${license} ${share}`);
  const row=rows[0];
  if(!row&&membership){
    // A missing membership is authorization denial, not session loss. Validate
    // the same live identity and paid entitlement independently before403;
    // this fallback never creates a principal or grants seller access.
    await liveUser(db,user,{lock});
    throw wholesaleError(403,'SELLER_MEMBERSHIP_REQUIRED','Απαιτείται ενεργή ιδιότητα πωλητή. Επικοινώνησε με τον διαχειριστή για ανάθεση.');
  }
  if(!row||!roleMatches(user,row.role))throw denied();
  if(manager){if(!managers.has(row.role))throw wholesaleError(403,'SELLER_MANAGER_DENIED','Απαιτείται δικαίωμα διαχείρισης πωλητών.');if(row.userCompanyId!==user.companyId&&row.role!=='SUPER_ADMIN')throw denied()}
  else if(row.userCompanyId!==user.companyId||user.supportContext)throw denied();
  const clock=await db.$queryRaw`SELECT clock_timestamp() AS "now"`,now=new Date(clock[0].now).getTime();
  if(!Number.isFinite(now)||new Date(row.expiresAt).getTime()<=now||(row.subscriptionStartsAt&&new Date(row.subscriptionStartsAt).getTime()>now)||(row.subscriptionEndsAt&&new Date(row.subscriptionEndsAt).getTime()<now)||(row.moduleStartsAt&&new Date(row.moduleStartsAt).getTime()>now)||(row.moduleEndsAt&&new Date(row.moduleEndsAt).getTime()<now))throw denied();
  return row;
}
export async function authenticateWholesaleSellerManager(db,user,{lock=false}={}){await liveUser(db,user,{lock,manager:true});return true}
export async function authenticateWholesaleSeller(db,user){
  await liveUser(db,user,{membership:true});
  // Capture only validated immutable signed session claims. HTTP input can never
  // replace this closure or manufacture the shared principal's WeakMap brand.
  const captured={id:user.id,companyId:user.companyId,sessionId:user.sessionId,sessionVersion:user.sessionVersion,role:user.role,platformRole:user.platformRole,isSuperAdmin:user.isSuperAdmin,tokenType:user.tokenType,supportContext:user.supportContext};
  const authorize=async(tx,ctx,input,{lock=false}={})=>{
    await liveUser(tx,captured,{lock,membership:true});
    if((Object.hasOwn(input||{},'storeId')&&(typeof input.storeId!=='string'||!input.storeId))||(Object.hasOwn(input||{},'customerId')&&(typeof input.customerId!=='string'||!input.customerId)))throw wholesaleError(403,'SELLER_SCOPE_REQUIRED','Επίλεξε κατάστημα και πελάτη.');
    if(input?.customerId&&!input.storeId)throw wholesaleError(403,'SELLER_SCOPE_REQUIRED','Επίλεξε κατάστημα και πελάτη.');
    if(input?.storeId){
      const share=lock?Prisma.sql`FOR SHARE`:Prisma.empty;
      const customerFilter=input.customerId?Prisma.sql`AND a."customerId"=${input.customerId}`:Prisma.empty;
      const rows=await tx.$queryRaw(Prisma.sql`SELECT a."id" FROM "WholesaleSellerAssignment" a JOIN "Store" st ON st."id"=a."storeId" AND st."companyId"=a."companyId" JOIN "WholesaleCustomer" c ON c."id"=a."customerId" AND c."companyId"=a."companyId" WHERE a."companyId"=${ctx.companyId} AND a."userId"=${ctx.userId} AND a."storeId"=${input.storeId} AND a."active"=true AND st."active"=true AND c."active"=true ${customerFilter} ${share}`);
      if(!rows[0])throw wholesaleError(404,'SELLER_ASSIGNMENT_UNAVAILABLE','Ο πελάτης δεν είναι ανατεθειμένος στο επιλεγμένο κατάστημα.');
      // A membership/session can expire while waiting for an assignment lock.
      await liveUser(tx,captured,{lock,membership:true});
    }
    return true;
  };
  return createWholesaleSellerPrincipal({companyId:user.companyId,userId:user.id,sessionId:user.sessionId},{authorize});
}
