import crypto from 'node:crypto';
import {Router} from 'express';
import {Prisma} from '@prisma/client';
import {z} from 'zod';
import {prisma} from '../prisma.js';
import {ensureWholesaleSellerSchema} from '../wholesale-seller-bootstrap.js';
import {authenticateWholesaleSellerManager} from '../lib/wholesale-seller-auth.js';
import {wholesaleError} from '../lib/wholesale-principal.js';
const id=z.string().trim().min(1).max(200);
const pagination=z.object({page:z.string().regex(/^[1-9]\d*$/).transform(Number).pipe(z.number().max(1000000)).default('1'),pageSize:z.string().regex(/^[1-9]\d*$/).transform(Number).pipe(z.number().max(100)).default('50')}).strict();
const usersQuery=pagination.extend({q:z.string().trim().max(160).default('')});
const assignmentsQuery=pagination.extend({storeId:id});
const toggle=z.object({active:z.boolean(),expectedRevision:z.number().int().min(0).max(2147483646)}).strict();
const assignmentBody=toggle.extend({customerId:id,storeId:id});
const stale=()=>wholesaleError(409,'SELLER_REVISION_CHANGED','Η ανάθεση άλλαξε. Ανανέωσε τη λίστα πριν συνεχίσεις.');
async function targetUser(db,companyId,userId){
  const rows=await db.$queryRaw`SELECT "id" FROM "User" WHERE "id"=${userId} AND "companyId"=${companyId} FOR SHARE`;
  if(!rows[0])throw wholesaleError(404,'SELLER_USER_NOT_FOUND','Ο χρήστης δεν βρέθηκε στην εταιρεία.');
}
async function targetStore(db,companyId,storeId){
  const rows=await db.$queryRaw`SELECT "id" FROM "Store" WHERE "id"=${storeId} AND "companyId"=${companyId} AND "active"=true FOR SHARE`;
  if(!rows[0])throw wholesaleError(404,'SELLER_STORE_NOT_FOUND','Το επιλεγμένο κατάστημα δεν βρέθηκε.');
}
async function audit(db,user,targetUserId,kind,before,after){
  await db.$executeRaw`INSERT INTO "WholesaleSellerAudit" ("id","companyId","actorId","targetUserId","kind","beforeJson","afterJson") VALUES (${crypto.randomUUID()},${user.companyId},${user.id},${targetUserId},${kind},${before?JSON.stringify(before):null}::jsonb,${JSON.stringify(after)}::jsonb)`;
}
export function createWholesaleSellerAdminRouter({db=prisma,ensureSchema=ensureWholesaleSellerSchema}={}){
  const router=Router();
  router.use(async(req,res,next)=>{try{
    res.set('Cache-Control','no-store');await authenticateWholesaleSellerManager(db,req.user);await ensureSchema(db);next();
  }catch(error){next(error)}});
  router.get('/users',async(req,res,next)=>{try{
    const {q,page,pageSize}=usersQuery.parse(req.query),companyId=req.user.companyId,pattern=`%${q}%`;
    const result=await db.$transaction(async tx=>{
      await authenticateWholesaleSellerManager(tx,req.user,{lock:true});
      const filter=Prisma.sql`FROM "User" u LEFT JOIN "WholesaleSellerMembership" m ON m."userId"=u."id" AND m."companyId"=u."companyId" WHERE u."companyId"=${companyId} AND (u."fullName" ILIKE ${pattern} OR u."email" ILIKE ${pattern})`;
      const rows=await tx.$queryRaw(Prisma.sql`SELECT u."id",u."fullName",u."email",u."role",COALESCE(m."active",false) AS "memberActive",COALESCE(m."revision",0) AS "membershipRevision" ${filter} ORDER BY u."fullName",u."id" LIMIT ${pageSize} OFFSET ${(page-1)*pageSize}`),counts=await tx.$queryRaw(Prisma.sql`SELECT COUNT(*) AS total ${filter}`);
      return {items:rows,total:Number(counts[0]?.total||0),page,pageSize};
    },{isolationLevel:'RepeatableRead'});res.json(result);
  }catch(error){next(error)}});
  router.put('/users/:userId/membership',async(req,res,next)=>{try{
    const body=toggle.parse(req.body),companyId=req.user.companyId,userId=id.parse(req.params.userId);
    const membership=await db.$transaction(async tx=>{
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${JSON.stringify(['seller-membership',companyId,userId])},0))::text`;
      await authenticateWholesaleSellerManager(tx,req.user,{lock:true});await targetUser(tx,companyId,userId);
      const old=await tx.$queryRaw`SELECT * FROM "WholesaleSellerMembership" WHERE "companyId"=${companyId} AND "userId"=${userId} FOR UPDATE`;
      if((old[0]?.revision||0)!==body.expectedRevision)throw stale();
      await authenticateWholesaleSellerManager(tx,req.user,{lock:true});
      const rows=old[0]?await tx.$queryRaw`UPDATE "WholesaleSellerMembership" SET "active"=${body.active},"revision"="revision"+1,"updatedAt"=clock_timestamp() WHERE "id"=${old[0].id} AND "companyId"=${companyId} AND "revision"=${body.expectedRevision} RETURNING *`:await tx.$queryRaw`INSERT INTO "WholesaleSellerMembership" ("id","companyId","userId","active") VALUES (${crypto.randomUUID()},${companyId},${userId},${body.active}) RETURNING *`;
      if(!rows[0])throw stale();await audit(tx,req.user,userId,'MEMBERSHIP_SET',old[0],rows[0]);return rows[0];
    });res.json({membership});
  }catch(error){next(error)}});
  router.get('/users/:userId/assignments',async(req,res,next)=>{try{
    const {storeId,page,pageSize}=assignmentsQuery.parse(req.query),companyId=req.user.companyId,userId=id.parse(req.params.userId);
    const result=await db.$transaction(async tx=>{
      await authenticateWholesaleSellerManager(tx,req.user,{lock:true});await targetUser(tx,companyId,userId);await targetStore(tx,companyId,storeId);
      const filter=Prisma.sql`FROM "WholesaleSellerAssignment" a JOIN "WholesaleCustomer" c ON c."id"=a."customerId" AND c."companyId"=a."companyId" JOIN "Store" st ON st."id"=a."storeId" AND st."companyId"=a."companyId" WHERE a."companyId"=${companyId} AND a."userId"=${userId} AND a."storeId"=${storeId}`;
      const rows=await tx.$queryRaw(Prisma.sql`SELECT a.*,c."name" AS "customerName",st."name" AS "storeName" ${filter} ORDER BY c."name",a."id" LIMIT ${pageSize} OFFSET ${(page-1)*pageSize}`),counts=await tx.$queryRaw(Prisma.sql`SELECT COUNT(*) AS total ${filter}`);
      return {items:rows,total:Number(counts[0]?.total||0),page,pageSize};
    },{isolationLevel:'RepeatableRead'});res.json(result);
  }catch(error){next(error)}});
  router.put('/users/:userId/assignments',async(req,res,next)=>{try{
    const body=assignmentBody.parse(req.body),companyId=req.user.companyId,userId=id.parse(req.params.userId);
    const assignment=await db.$transaction(async tx=>{
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${JSON.stringify(['seller-assignment',companyId,userId,body.customerId,body.storeId])},0))::text`;
      await authenticateWholesaleSellerManager(tx,req.user,{lock:true});await targetUser(tx,companyId,userId);await targetStore(tx,companyId,body.storeId);
      const members=await tx.$queryRaw`SELECT "id","active" FROM "WholesaleSellerMembership" WHERE "companyId"=${companyId} AND "userId"=${userId} FOR SHARE`;
      if(!members[0]||(body.active&&!members[0].active))throw wholesaleError(409,'SELLER_MEMBERSHIP_REQUIRED','Ενεργοποίησε πρώτα την πρόσβαση πωλητή.');
      const customers=await tx.$queryRaw`SELECT "id","active" FROM "WholesaleCustomer" WHERE "id"=${body.customerId} AND "companyId"=${companyId} FOR SHARE`;
      if(!customers[0]||(body.active&&!customers[0].active))throw wholesaleError(404,'SELLER_CUSTOMER_NOT_FOUND','Ο ενεργός πελάτης δεν βρέθηκε.');
      const old=await tx.$queryRaw`SELECT * FROM "WholesaleSellerAssignment" WHERE "companyId"=${companyId} AND "userId"=${userId} AND "customerId"=${body.customerId} AND "storeId"=${body.storeId} FOR UPDATE`;
      if((old[0]?.revision||0)!==body.expectedRevision)throw stale();
      await authenticateWholesaleSellerManager(tx,req.user,{lock:true});
      const rows=old[0]?await tx.$queryRaw`UPDATE "WholesaleSellerAssignment" SET "active"=${body.active},"revision"="revision"+1,"updatedAt"=clock_timestamp() WHERE "id"=${old[0].id} AND "companyId"=${companyId} AND "revision"=${body.expectedRevision} RETURNING *`:await tx.$queryRaw`INSERT INTO "WholesaleSellerAssignment" ("id","companyId","userId","customerId","storeId","active") VALUES (${crypto.randomUUID()},${companyId},${userId},${body.customerId},${body.storeId},${body.active}) RETURNING *`;
      if(!rows[0])throw stale();await audit(tx,req.user,userId,'ASSIGNMENT_SET',old[0],rows[0]);return rows[0];
    });res.json({assignment});
  }catch(error){next(error)}});
  router.use((error,req,res,next)=>{
    if(error.name==='ZodError')return res.status(400).json({error:'Έλεγξε τα στοιχεία της ανάθεσης.',code:'SELLER_INVALID_INPUT'});
    if(error.code==='P2002'||error.meta?.code==='23505')return res.status(409).json({error:'Η ανάθεση άλλαξε. Ανανέωσε τη λίστα.',code:'SELLER_REVISION_CHANGED'});
    if(error.status>=400&&error.status<500)return res.status(error.status).json({error:error.message,code:error.code});
    console.error('Wholesale seller administration failed',error.code||error.name);res.status(500).json({error:'Η υπηρεσία δεν είναι προσωρινά διαθέσιμη.',code:'SELLER_UNAVAILABLE'});
  });return router;
}
export default createWholesaleSellerAdminRouter();
