import {wholesaleEntitlementSql} from './wholesale-entitlement.js';
import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import {Prisma} from '@prisma/client';
import {z} from 'zod';
import {createWholesalePortalPrincipal,wholesaleError} from './wholesale-principal.js';

export const PORTAL_COOKIE='__Secure-mws_b2b';
export const PORTAL_ORIGIN='https://myworkstation-app.onrender.com';
export const portalSlug=z.string().min(3).max(63).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
export const portalLogin=z.string().trim().toLowerCase().min(3).max(160).regex(/^[a-z0-9._@+-]+$/);
export const portalPassword=z.string().min(12).max(72).refine(value=>Buffer.byteLength(value,'utf8')<=72);
const digest=value=>crypto.createHash('sha256').update(value).digest('hex');
const metadata=new WeakMap();
const dummyHash=bcrypt.hash('wholesale-dummy-credential-not-an-account',10);
const unauthorized=()=>wholesaleError(401,'B2B_AUTH_REQUIRED','Δεν είναι διαθέσιμη έγκυρη σύνδεση πελάτη.');

// Deliberately bounded process-local protection; it is not a distributed lockout.
export function createPortalLoginLimiter({now=Date.now,maxKeys=2000,windowMs=60000}={}){
  if(!Number.isInteger(maxKeys)||maxKeys<2||!Number.isFinite(windowMs)||windowMs<=0)throw new TypeError("Invalid portal limiter configuration.");
  const buckets=new Map();
  return (slug,login)=>{
    const time=now();
    for(const [key,bucket] of buckets)if(bucket.until<=time)buckets.delete(key);
    for(const [key,limit] of [[`site:${slug}`,100],[`login:${slug}:${login}`,5]]){
      let bucket=buckets.get(key);if(!bucket){while(buckets.size>=maxKeys)buckets.delete(buckets.keys().next().value);bucket={count:0,until:time+windowMs};buckets.set(key,bucket)}
      if(++bucket.count>limit)throw wholesaleError(429,'B2B_LOGIN_THROTTLED','Δοκίμασε ξανά σε λίγο.');
    }
  };
}
const limitLogin=createPortalLoginLimiter();
export function portalCookie(token,slug,{clear=false}={}){return `${PORTAL_COOKIE}=${clear?'':token}; Path=/api/b2b/${slug}; HttpOnly; Secure; SameSite=Strict; Max-Age=${clear?0:28800}`}
export function portalToken(req){
  const values=String(req.headers.cookie||'').split(';').map(value=>value.trim()).filter(value=>value.startsWith(PORTAL_COOKIE+'='));
  if(values.length!==1)throw unauthorized();const token=values[0].slice(PORTAL_COOKIE.length+1);
  if(!/^b2bs_[A-Za-z0-9_-]{43}$/.test(token))throw unauthorized();return token;
}
export function requirePortalOrigin(req,expectedOrigin=PORTAL_ORIGIN){
  if(req.headers.origin!==expectedOrigin)throw wholesaleError(403,'B2B_ORIGIN_DENIED','Η προέλευση της αίτησης δεν επιτρέπεται.');
}
export function requirePortalCsrf(req,ctx){
  const expected=metadata.get(ctx)?.csrfToken,actual=req.headers['x-csrf-token'];
  if(!expected||typeof actual!=='string'||!/^[a-f0-9]{64}$/.test(actual)||!crypto.timingSafeEqual(Buffer.from(expected,'hex'),Buffer.from(actual,'hex')))throw wholesaleError(403,'B2B_CSRF_DENIED','Ανανέωσε τη σύνδεση πριν συνεχίσεις.');
}

// Public discovery and sessions require the same explicit paid wholesale grant.
export const portalLicenseSql=wholesaleEntitlementSql;
export async function findPortalSite(db,slug){
  const rows=await db.$queryRaw(Prisma.sql`SELECT site."id",site."companyId",site."slug",site."name" FROM "WholesalePortalSite" site JOIN "Company" co ON co."id"=site."companyId" JOIN "CompanyModule" cm ON cm."companyId"=co."id" WHERE site."slug"=${slug} AND site."enabled"=true AND ${portalLicenseSql}`);
  return rows[0]||null;
}
async function sessionScope(db,{sessionId,tokenHash,slug},{lock=false}={}){
  const share=lock?Prisma.sql`FOR SHARE`:Prisma.empty;
  const rows=await db.$queryRaw(Prisma.sql`SELECT a."id" AS "accountId",a."login",a."companyId",a."customerId",a."storeId",site."id" AS "siteId",site."slug",site."name" AS "siteName",cu."name" AS "customerName",st."name" AS "storeName",s."id" AS "sessionId",s."expiresAt",co."subscriptionStartsAt",co."subscriptionEndsAt",cm."startsAt" AS "moduleStartsAt",cm."endsAt" AS "moduleEndsAt" FROM "WholesalePortalSession" s JOIN "WholesalePortalAccount" a ON a."id"=s."accountId" AND a."siteId"=s."siteId" AND a."companyId"=s."companyId" JOIN "WholesalePortalSite" site ON site."id"=a."siteId" AND site."companyId"=a."companyId" JOIN "Company" co ON co."id"=a."companyId" JOIN "CompanyModule" cm ON cm."companyId"=co."id" JOIN "WholesaleCustomer" cu ON cu."id"=a."customerId" AND cu."companyId"=a."companyId" JOIN "Store" st ON st."id"=a."storeId" AND st."companyId"=a."companyId" WHERE s."id"=${sessionId} AND s."tokenHash"=${tokenHash} AND s."revokedAt" IS NULL AND s."expiresAt">clock_timestamp() AND s."sessionVersion"=a."sessionVersion" AND a."active"=true AND site."enabled"=true AND site."slug"=${slug} AND cu."active"=true AND st."active"=true AND ${portalLicenseSql} ${share}`);
  if(!rows[0])throw unauthorized();
  // Predicates may have run before waiting on another transaction's row lock.
  // Recheck wall-clock expiry after all SHARE locks have actually been acquired.
  const clock=await db.$queryRaw`SELECT clock_timestamp() AS "now"`,row=rows[0],now=new Date(clock[0].now).getTime();
  if(new Date(row.expiresAt).getTime()<=now||(row.subscriptionStartsAt&&new Date(row.subscriptionStartsAt).getTime()>now)||(row.subscriptionEndsAt&&new Date(row.subscriptionEndsAt).getTime()<now)||(row.moduleStartsAt&&new Date(row.moduleStartsAt).getTime()>now)||(row.moduleEndsAt&&new Date(row.moduleEndsAt).getTime()<now))throw unauthorized();
  return row;
}
export async function authenticatePortalSession(db,slug,token){
  if(!/^b2bs_[A-Za-z0-9_-]{43}$/.test(token))throw unauthorized();
  const tokenHash=digest(token),sessions=await db.$queryRaw`SELECT "id" FROM "WholesalePortalSession" WHERE "tokenHash"=${tokenHash} AND "revokedAt" IS NULL AND "expiresAt">clock_timestamp() LIMIT 1`;
  if(!sessions[0])throw unauthorized();const sessionId=sessions[0].id,row=await sessionScope(db,{sessionId,tokenHash,slug});
  let ctx;
  const authorize=async(tx,principal,options)=>{
    const current=await sessionScope(tx,{sessionId,tokenHash,slug},options);
    for(const key of ['accountId','companyId','customerId','storeId','siteId','sessionId'])if(current[key]!==principal[key])throw unauthorized();
    metadata.get(ctx).row=current;return true;
  };
  const authorizeProducts=async(tx,principal,input,{lock=false}={})=>{
    const ids=[...new Set(input.items.map(item=>item.productId))],share=lock?Prisma.sql`FOR SHARE`:Prisma.empty;
    const rows=await tx.$queryRaw(Prisma.sql`SELECT pub."productId" FROM "WholesalePortalPublication" pub WHERE pub."siteId"=${principal.siteId} AND pub."companyId"=${principal.companyId} AND pub."storeId"=${principal.storeId} AND pub."active"=true AND pub."productId"=ANY(${ids}::text[]) ${share}`);
    if(rows.length!==ids.length)throw wholesaleError(404,'B2B_PRODUCT_UNAVAILABLE','Ένα είδος δεν είναι διαθέσιμο στον κατάλογο.');return true;
  };
  ctx=createWholesalePortalPrincipal(row,{authorize,authorizeProducts});metadata.set(ctx,{row,csrfToken:digest('b2b-csrf:'+token)});return ctx;
}
export function describePortalSession(ctx){
  const saved=metadata.get(ctx);if(!saved)throw unauthorized();const r=saved.row;
  return {account:{id:r.accountId,login:r.login,customerId:r.customerId,customerName:r.customerName},stores:[{id:r.storeId,name:r.storeName}],site:{slug:r.slug,name:r.siteName},expiresAt:new Date(r.expiresAt).toISOString(),csrfToken:saved.csrfToken};
}
export async function loginPortal(db,slug,body,{limiter=limitLogin}={}){
  const input=z.object({login:portalLogin,password:z.string().max(72).refine(value=>Buffer.byteLength(value,'utf8')<=72)}).strict().safeParse(body);
  const login=input.success?input.data.login:'invalid';limiter(slug,login);
  if(!input.success)throw unauthorized();
  const rows=await db.$queryRaw`SELECT a."id",a."passwordHash",a."sessionVersion" FROM "WholesalePortalAccount" a JOIN "WholesalePortalSite" site ON site."id"=a."siteId" AND site."companyId"=a."companyId" WHERE site."slug"=${slug} AND a."login"=${login} LIMIT 1`;
  const account=rows[0],matches=await bcrypt.compare(input.data.password,account?.passwordHash||await dummyHash);
  if(!account||!matches)throw unauthorized();
  const token='b2bs_'+crypto.randomBytes(32).toString('base64url'),tokenHash=digest(token),sessionId=crypto.randomUUID();
  await db.$transaction(async tx=>{
    const current=await tx.$queryRaw`SELECT a."id",a."siteId",a."companyId",a."passwordHash",a."sessionVersion" FROM "WholesalePortalAccount" a WHERE a."id"=${account.id} AND a."active"=true FOR UPDATE`;
    const row=current[0];if(!row||row.passwordHash!==account.passwordHash||row.sessionVersion!==account.sessionVersion)throw unauthorized();
    await tx.$executeRaw`INSERT INTO "WholesalePortalSession" ("id","accountId","siteId","companyId","tokenHash","sessionVersion","expiresAt") VALUES (${sessionId},${row.id},${row.siteId},${row.companyId},${tokenHash},${row.sessionVersion},clock_timestamp()+INTERVAL '8 hours')`;
    await sessionScope(tx,{sessionId,tokenHash,slug},{lock:true});
  });
  const ctx=await authenticatePortalSession(db,slug,token);return {token,ctx};
}
export async function logoutPortal(db,ctx){
  await db.$transaction(async tx=>{
    const saved=metadata.get(ctx);if(!saved)throw unauthorized();
    // Recheck through the branded callback in the caller before entering here;
    // this scoped revocation remains safe if another request already logged out.
    await tx.$executeRaw`UPDATE "WholesalePortalSession" SET "revokedAt"=clock_timestamp() WHERE "id"=${ctx.sessionId} AND "accountId"=${ctx.accountId} AND "companyId"=${ctx.companyId}`;
  });
}
