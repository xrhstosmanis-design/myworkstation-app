import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import {Router} from 'express';
import {Prisma} from '@prisma/client';
import {z} from 'zod';
import {prisma} from '../prisma.js';
import {ensureWholesalePortalSchema} from '../wholesale-portal-bootstrap.js';
import {assertWholesaleManager,wholesaleError} from '../lib/wholesale-principal.js';
import {portalSlug,portalLogin,portalPassword} from '../lib/wholesale-portal-auth.js';
import {assertWholesaleEntitlement} from '../lib/wholesale-entitlement.js';
const id=z.string().trim().min(1).max(200);
const siteBody=z.object({slug:portalSlug,name:z.string().trim().min(1).max(160),enabled:z.boolean()}).strict();
const accountBody=z.object({login:portalLogin,password:portalPassword,customerId:id,storeId:id,active:z.boolean().default(true)}).strict();
const patchBody=z.object({active:z.boolean().optional(),password:portalPassword.optional()}).strict().refine(body=>body.active!==undefined||body.password!==undefined);
const productQuery=z.object({storeId:id,q:z.string().trim().max(160).default(''),page:z.string().regex(/^[1-9]\d*$/).transform(Number).pipe(z.number().max(1000000)).default('1'),pageSize:z.string().regex(/^[1-9]\d*$/).transform(Number).pipe(z.number().max(100)).default('50')}).strict();
const safeAccount=row=>({id:row.id,login:row.login,customerId:row.customerId,storeId:row.storeId,active:row.active,...(row.customerName?{customerName:row.customerName}:{}),...(row.storeName?{storeName:row.storeName}:{})});
const context=req=>({role:req.user?.role,tokenType:req.user?.tokenType,companyId:req.user?.companyId,actorId:req.user?.id,channel:'BACKOFFICE'});
async function ownSite(db,companyId,{lock=false}={}){
  const suffix=lock?Prisma.sql`FOR SHARE`:Prisma.empty,rows=await db.$queryRaw(Prisma.sql`SELECT "id","companyId","slug","name","enabled" FROM "WholesalePortalSite" WHERE "companyId"=${companyId} ${suffix}`);
  if(!rows[0])throw wholesaleError(409,'B2B_SITE_REQUIRED','Ρύθμισε πρώτα τον ιστότοπο χονδρικής.');return rows[0];
}
async function ownStore(db,companyId,storeId,{lock=false}={}){
  const suffix=lock?Prisma.sql`FOR SHARE`:Prisma.empty,rows=await db.$queryRaw(Prisma.sql`SELECT "id" FROM "Store" WHERE "id"=${storeId} AND "companyId"=${companyId} AND "active"=true ${suffix}`);
  if(!rows[0])throw wholesaleError(404,'B2B_STORE_NOT_FOUND','Το επιλεγμένο κατάστημα δεν βρέθηκε.');return rows[0];
}
export function createWholesalePortalAdminRouter({db=prisma,ensureSchema=ensureWholesalePortalSchema}={}){
  const router=Router();
  router.use(async(req,res,next)=>{try{assertWholesaleManager(context(req));await assertWholesaleEntitlement(db,req.user?.companyId);res.set('Cache-Control','no-store');await ensureSchema(db);next()}catch(error){next(error)}});
  router.get('/site',async(req,res,next)=>{try{
    const rows=await db.$queryRaw`SELECT "slug","name","enabled" FROM "WholesalePortalSite" WHERE "companyId"=${req.user.companyId} LIMIT 1`;res.json({site:rows[0]||null});
  }catch(error){next(error)}});
  router.put('/site',async(req,res,next)=>{try{
    const b=siteBody.parse(req.body),companyId=req.user.companyId;
    const site=await db.$transaction(async tx=>{
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${JSON.stringify(['portal-site',companyId])},0))::text`;
      await assertWholesaleEntitlement(tx,companyId,{lock:true});
      const existing=await tx.$queryRaw`SELECT "id","slug" FROM "WholesalePortalSite" WHERE "companyId"=${companyId} FOR UPDATE`;
      if(existing[0]&&existing[0].slug!==b.slug)throw wholesaleError(409,'B2B_SLUG_IMMUTABLE','Η διεύθυνση του ιστότοπου δεν αλλάζει μετά τη δημιουργία.');
      const rows=existing[0]?await tx.$queryRaw`UPDATE "WholesalePortalSite" SET "name"=${b.name},"enabled"=${b.enabled},"updatedAt"=NOW() WHERE "id"=${existing[0].id} AND "companyId"=${companyId} RETURNING "id","slug","name","enabled"`:await tx.$queryRaw`INSERT INTO "WholesalePortalSite" ("id","companyId","slug","name","enabled") VALUES (${crypto.randomUUID()},${companyId},${b.slug},${b.name},${b.enabled}) RETURNING "id","slug","name","enabled"`;
      if(!b.enabled)await tx.$executeRaw`UPDATE "WholesalePortalSession" SET "revokedAt"=NOW() WHERE "siteId"=${rows[0].id} AND "companyId"=${companyId} AND "revokedAt" IS NULL`;
      const {id:siteId,...view}=rows[0];await assertWholesaleEntitlement(tx,companyId,{lock:true});return view;
    });res.json({site});
  }catch(error){next(error)}});
  router.get('/accounts',async(req,res,next)=>{try{
    const rows=await db.$queryRaw`SELECT a."id",a."login",a."customerId",a."storeId",a."active",c."name" AS "customerName",s."name" AS "storeName" FROM "WholesalePortalAccount" a JOIN "WholesaleCustomer" c ON c."id"=a."customerId" AND c."companyId"=a."companyId" JOIN "Store" s ON s."id"=a."storeId" AND s."companyId"=a."companyId" WHERE a."companyId"=${req.user.companyId} ORDER BY a."login",a."id"`;res.json({items:rows.map(safeAccount)});
  }catch(error){next(error)}});
  router.post('/accounts',async(req,res,next)=>{try{
    const b=accountBody.parse(req.body),companyId=req.user.companyId,passwordHash=await bcrypt.hash(b.password,10);
    const account=await db.$transaction(async tx=>{
      await assertWholesaleEntitlement(tx,companyId,{lock:true});
      const site=await ownSite(tx,companyId,{lock:true});await ownStore(tx,companyId,b.storeId,{lock:true});
      const customers=await tx.$queryRaw`SELECT "id" FROM "WholesaleCustomer" WHERE "id"=${b.customerId} AND "companyId"=${companyId} AND "active"=true FOR SHARE`;
      if(!customers[0])throw wholesaleError(404,'B2B_CUSTOMER_NOT_FOUND','Ο πελάτης δεν βρέθηκε.');
      const rows=await tx.$queryRaw`INSERT INTO "WholesalePortalAccount" ("id","siteId","companyId","customerId","storeId","login","passwordHash","active") VALUES (${crypto.randomUUID()},${site.id},${companyId},${b.customerId},${b.storeId},${b.login},${passwordHash},${b.active}) RETURNING "id","login","customerId","storeId","active"`;await assertWholesaleEntitlement(tx,companyId,{lock:true});return rows[0];
    });res.status(201).json({account:safeAccount(account)});
  }catch(error){next(error)}});
  router.patch('/accounts/:id',async(req,res,next)=>{try{
    const b=patchBody.parse(req.body),companyId=req.user.companyId,passwordHash=b.password===undefined?null:await bcrypt.hash(b.password,10);
    const account=await db.$transaction(async tx=>{
      await assertWholesaleEntitlement(tx,companyId,{lock:true});
      const rows=await tx.$queryRaw`SELECT "id","active" FROM "WholesalePortalAccount" WHERE "id"=${req.params.id} AND "companyId"=${companyId} FOR UPDATE`;
      if(!rows[0])throw wholesaleError(404,'B2B_ACCOUNT_NOT_FOUND','Η πρόσβαση δεν βρέθηκε.');
      const changed=await tx.$queryRaw`UPDATE "WholesalePortalAccount" SET "active"=${b.active??rows[0].active},"passwordHash"=COALESCE(${passwordHash},"passwordHash"),"sessionVersion"="sessionVersion"+1,"updatedAt"=NOW() WHERE "id"=${req.params.id} AND "companyId"=${companyId} RETURNING "id","login","customerId","storeId","active"`;
      await tx.$executeRaw`UPDATE "WholesalePortalSession" SET "revokedAt"=NOW() WHERE "accountId"=${req.params.id} AND "companyId"=${companyId} AND "revokedAt" IS NULL`;await assertWholesaleEntitlement(tx,companyId,{lock:true});return changed[0];
    });res.json({account:safeAccount(account)});
  }catch(error){next(error)}});
  router.get('/products',async(req,res,next)=>{try{
    const {storeId,q,page,pageSize}=productQuery.parse(req.query),companyId=req.user.companyId,pattern=`%${q}%`;
    const result=await db.$transaction(async tx=>{
      await assertWholesaleEntitlement(tx,companyId,{lock:true});
      const site=await ownSite(tx,companyId);await ownStore(tx,companyId,storeId);
      const filter=Prisma.sql`FROM "Product" p JOIN "StoreProduct" sp ON sp."productId"=p."id" LEFT JOIN "WholesalePortalPublication" pub ON pub."productId"=p."id" AND pub."companyId"=p."companyId" AND pub."siteId"=${site.id} AND pub."storeId"=${storeId} WHERE p."companyId"=${companyId} AND sp."storeId"=${storeId} AND sp."active"=true AND p."active"=true AND (p."name" ILIKE ${pattern} OR p."sku" ILIKE ${pattern})`;
      const rows=await tx.$queryRaw(Prisma.sql`SELECT p."id",p."name",p."sku",p."unit",COALESCE(pub."active",false) AS published ${filter} ORDER BY p."name",p."id" LIMIT ${pageSize} OFFSET ${(page-1)*pageSize}`),counts=await tx.$queryRaw(Prisma.sql`SELECT COUNT(*) AS total ${filter}`);return {items:rows,total:Number(counts[0]?.total||0),page,pageSize};
    },{isolationLevel:'RepeatableRead'});res.json(result);
  }catch(error){next(error)}});
  router.put('/products/:id',async(req,res,next)=>{try{
    const b=z.object({storeId:id,published:z.boolean()}).strict().parse(req.body),companyId=req.user.companyId;
    await db.$transaction(async tx=>{
      await assertWholesaleEntitlement(tx,companyId,{lock:true});
      const site=await ownSite(tx,companyId,{lock:true});await ownStore(tx,companyId,b.storeId,{lock:true});
      const products=await tx.$queryRaw`SELECT p."id" FROM "Product" p JOIN "StoreProduct" sp ON sp."productId"=p."id" WHERE p."id"=${req.params.id} AND p."companyId"=${companyId} AND sp."storeId"=${b.storeId} AND p."active"=true AND sp."active"=true FOR SHARE`;
      if(!products[0])throw wholesaleError(404,'B2B_PRODUCT_NOT_FOUND','Το είδος δεν βρέθηκε στο επιλεγμένο κατάστημα.');
      const changed=await tx.$executeRaw`INSERT INTO "WholesalePortalPublication" ("siteId","companyId","storeId","productId","active") VALUES (${site.id},${companyId},${b.storeId},${req.params.id},${b.published}) ON CONFLICT ("siteId","storeId","productId") DO UPDATE SET "active"=EXCLUDED."active","updatedAt"=NOW() WHERE "WholesalePortalPublication"."companyId"=EXCLUDED."companyId"`;
      if(changed!==1)throw wholesaleError(409,'B2B_PUBLICATION_CONFLICT','Η δημοσίευση απαιτεί έλεγχο.');
      await assertWholesaleEntitlement(tx,companyId,{lock:true});
    });res.json({ok:true});
  }catch(error){next(error)}});
  router.use((error,req,res,next)=>{
    if(error.name==='ZodError')return res.status(400).json({error:'Έλεγξε τα στοιχεία της πρόσβασης.',code:'B2B_INVALID_INPUT'});
    if(error.code==='P2002'||error.meta?.code==='23505')return res.status(409).json({error:'Η διεύθυνση ή το όνομα σύνδεσης χρησιμοποιείται ήδη.',code:'B2B_DUPLICATE'});
    if(error.status>=400&&error.status<500)return res.status(error.status).json({error:error.message,code:error.code});console.error('Wholesale portal administration failed',error.code||error.name);res.status(500).json({error:'Η υπηρεσία δεν είναι προσωρινά διαθέσιμη.',code:'B2B_UNAVAILABLE'});
  });return router;
}

export default createWholesalePortalAdminRouter();
