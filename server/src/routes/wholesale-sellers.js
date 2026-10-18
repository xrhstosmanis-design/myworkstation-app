import {Router} from 'express';
import {Prisma} from '@prisma/client';
import {z} from 'zod';
import {prisma} from '../prisma.js';
import {ensureWholesaleSellerSchema} from '../wholesale-seller-bootstrap.js';
import {authenticateWholesaleSeller} from '../lib/wholesale-seller-auth.js';
import {authorizeWholesalePrincipal,isWholesaleSellerPrincipal,wholesaleError} from '../lib/wholesale-principal.js';
import {buildWholesaleQuote} from '../lib/wholesale-pricing.js';
import {createWholesaleOrder} from '../lib/wholesale-orders.js';

const id=z.string().trim().min(1).max(200);
const pair=z.object({customerId:id,storeId:id}).strict();
const pagination={page:z.string().regex(/^[1-9]\d*$/).transform(Number).pipe(z.number().max(1000000)).default('1'),pageSize:z.string().regex(/^[1-9]\d*$/).transform(Number).pipe(z.number().max(100)).default('50')};
const search={q:z.string().trim().max(160).default('')};
const customerQuery=z.object({storeId:id,...pagination,...search}).strict();
const catalogQuery=pair.extend({...pagination,...search});
const historyQuery=pair.extend(pagination);
const quoteBody=pair.extend({items:z.array(z.object({productId:id,quantity:z.string().max(40)}).strict()).min(1).max(100)});
const orderBody=quoteBody.extend({clientOrderId:z.string().uuid(),quoteId:z.string().regex(/^[a-f0-9]{64}$/),notes:z.string().trim().max(2000).default('')});

export function sellerQuoteView(quote){
  return {quoteId:quote.quoteId,currency:quote.currency,customerId:quote.customerId,customerName:quote.customerName,storeId:quote.storeId,creditChecked:quote.creditChecked,totals:quote.totals,items:quote.items.map(item=>({productId:item.productId,name:item.name,sku:item.sku,unit:item.unit,quantity:item.quantity,sourceUnitPrice:item.sourceUnitPrice,sourcePriceBasis:item.sourcePriceBasis,vatRate:item.vatRate,netTotal:item.netTotal,vatTotal:item.vatTotal,grossTotal:item.grossTotal}))};
}
function orderView(row){
  const snapshot=typeof row.snapshot==='string'?JSON.parse(row.snapshot):row.snapshot;
  if(!snapshot||snapshot.customerId!==row.customerId||snapshot.storeId!==row.storeId)throw wholesaleError(404,'SELLER_ORDER_NOT_FOUND','Η παραγγελία δεν είναι διαθέσιμη.');
  return {id:row.id,status:row.status,clientOrderId:row.clientOrderId,createdAt:row.createdAt,notes:row.notes||'',snapshot:sellerQuoteView(snapshot)};
}
function requireBinding(req,ctx){
  const user=req.headers['x-wholesale-seller'],company=req.headers['x-wholesale-company'];
  if(!user||!company)throw wholesaleError(428,'WHOLESALE_SELLER_BINDING_REQUIRED','Ανανέωσε το περιβάλλον πωλητή πριν συνεχίσεις.');
  if(user!==ctx.userId||company!==ctx.companyId)throw wholesaleError(401,'WHOLESALE_SELLER_BINDING_CHANGED','Ο λογαριασμός άλλαξε. Επίστρεψε στην αρχική σύνδεση πωλητή.');
}

export function createWholesaleSellerRouter({db=prisma,ensureSchema=ensureWholesaleSellerSchema,authenticateSeller=authenticateWholesaleSeller}={}){
  const router=Router();
  router.use(async(req,res,next)=>{try{
    res.set('Cache-Control','no-store');res.vary('Authorization');res.vary('X-Wholesale-Seller');res.vary('X-Wholesale-Company');
    // This router consumes the existing verified BackOffice session only. POS,
    // portal credentials and sessionless legacy payloads cannot provision a brand.
    if(req.user?.tokenType!=='BACKOFFICE_USER'||!req.user.sessionId||!req.user.id)throw wholesaleError(401,'WHOLESALE_SELLER_AUTH_REQUIRED','Απαιτείται ενεργή σύνδεση χρήστη.');
    await ensureSchema(db);const ctx=await authenticateSeller(db,req.user);
    if(!isWholesaleSellerPrincipal(ctx))throw wholesaleError(401,'WHOLESALE_SELLER_AUTH_REQUIRED','Η σύνδεση πωλητή δεν είναι έγκυρη.');
    req.wholesaleSeller=ctx;if(req.path!=='/context')requireBinding(req,ctx);next();
  }catch(error){next(error)}});

  router.get('/context',async(req,res,next)=>{try{
    z.object({}).strict().parse(req.query);const ctx=req.wholesaleSeller;
    const result=await db.$transaction(async tx=>{
      await authorizeWholesalePrincipal(tx,ctx,{}, {lock:true});
      const users=await tx.$queryRaw`SELECT u."fullName",s."expiresAt" FROM "User" u JOIN "UserSession" s ON s."userId"=u."id" WHERE u."id"=${ctx.userId} AND u."companyId"=${ctx.companyId} AND s."id"=${ctx.sessionId}`;
      if(!users[0])throw wholesaleError(401,'WHOLESALE_SELLER_AUTH_REQUIRED','Η σύνδεση πωλητή δεν είναι ενεργή.');
      const stores=await tx.$queryRaw`SELECT DISTINCT st."id",st."name" FROM "WholesaleSellerAssignment" a JOIN "Store" st ON st."id"=a."storeId" AND st."companyId"=a."companyId" JOIN "WholesaleCustomer" c ON c."id"=a."customerId" AND c."companyId"=a."companyId" WHERE a."companyId"=${ctx.companyId} AND a."userId"=${ctx.userId} AND a."active"=true AND st."active"=true AND c."active"=true ORDER BY st."name",st."id"`;
      return {user:{id:ctx.userId,fullName:users[0].fullName},companyId:ctx.companyId,actorId:ctx.actorId,expiresAt:users[0].expiresAt,stores};
    },{isolationLevel:'RepeatableRead'});res.json(result);
  }catch(error){next(error)}});

  router.get('/customers',async(req,res,next)=>{try{
    const {storeId,q,page,pageSize}=customerQuery.parse(req.query),ctx=req.wholesaleSeller,pattern=`%${q}%`;
    const result=await db.$transaction(async tx=>{
      await authorizeWholesalePrincipal(tx,ctx,{storeId},{lock:true});
      const filter=Prisma.sql`FROM "WholesaleSellerAssignment" a JOIN "WholesaleCustomer" c ON c."id"=a."customerId" AND c."companyId"=a."companyId" JOIN "Store" st ON st."id"=a."storeId" AND st."companyId"=a."companyId" WHERE a."companyId"=${ctx.companyId} AND a."userId"=${ctx.userId} AND a."storeId"=${storeId} AND a."active"=true AND c."active"=true AND st."active"=true AND (c."name" ILIKE ${pattern} OR c."code" ILIKE ${pattern})`;
      const rows=await tx.$queryRaw(Prisma.sql`SELECT c."id",c."code",c."name" ${filter} ORDER BY c."name",c."id" LIMIT ${pageSize} OFFSET ${(page-1)*pageSize}`),counts=await tx.$queryRaw(Prisma.sql`SELECT COUNT(*) AS total ${filter}`);
      return {items:rows,total:Number(counts[0]?.total||0),page,pageSize};
    },{isolationLevel:'RepeatableRead'});res.json(result);
  }catch(error){next(error)}});

  router.get('/catalog',async(req,res,next)=>{try{
    const {customerId,storeId,q,page,pageSize}=catalogQuery.parse(req.query),ctx=req.wholesaleSeller,pattern=`%${q}%`;
    const result=await db.$transaction(async tx=>{
      await authorizeWholesalePrincipal(tx,ctx,{customerId,storeId},{lock:true});
      // Seller access is independent of public B2B publication. Existing product
      // identities and explicit current-store membership remain authoritative.
      const filter=Prisma.sql`FROM "Product" p JOIN "StoreProduct" sp ON sp."productId"=p."id" WHERE p."companyId"=${ctx.companyId} AND sp."storeId"=${storeId} AND p."active"=true AND sp."active"=true AND (p."name" ILIKE ${pattern} OR p."sku" ILIKE ${pattern})`;
      const rows=await tx.$queryRaw(Prisma.sql`SELECT p."id",p."name",p."sku",p."unit" ${filter} ORDER BY p."name",p."id" LIMIT ${pageSize} OFFSET ${(page-1)*pageSize}`),counts=await tx.$queryRaw(Prisma.sql`SELECT COUNT(*) AS total ${filter}`);
      return {items:rows,total:Number(counts[0]?.total||0),page,pageSize};
    },{isolationLevel:'RepeatableRead'});res.json(result);
  }catch(error){next(error)}});

  router.post('/quotes',async(req,res,next)=>{try{
    const body=quoteBody.parse(req.body),ctx=req.wholesaleSeller;
    const quote=await db.$transaction(tx=>buildWholesaleQuote(tx,ctx,body,{lock:true}),{isolationLevel:'RepeatableRead'});res.json(sellerQuoteView(quote));
  }catch(error){next(error)}});
  router.post('/orders',async(req,res,next)=>{try{
    const body=orderBody.parse(req.body),result=await createWholesaleOrder(db,req.wholesaleSeller,body);
    res.status(result.replayed?200:201).json({orderId:result.orderId,status:result.status,replayed:result.replayed,order:orderView(result.order)});
  }catch(error){next(error)}});

  router.get('/orders',async(req,res,next)=>{try{
    const {customerId,storeId,page,pageSize}=historyQuery.parse(req.query),ctx=req.wholesaleSeller;
    const result=await db.$transaction(async tx=>{
      await authorizeWholesalePrincipal(tx,ctx,{customerId,storeId},{lock:true});
      const filter=Prisma.sql`FROM "WholesaleOrderRequest" WHERE "companyId"=${ctx.companyId} AND "actorId"=${ctx.actorId} AND "customerId"=${customerId} AND "storeId"=${storeId} AND "channel"='FIELD_SALES'`;
      const rows=await tx.$queryRaw(Prisma.sql`SELECT * ${filter} ORDER BY "createdAt" DESC,"id" DESC LIMIT ${pageSize} OFFSET ${(page-1)*pageSize}`),counts=await tx.$queryRaw(Prisma.sql`SELECT COUNT(*) AS total ${filter}`);
      return {items:rows.map(orderView),total:Number(counts[0]?.total||0),page,pageSize};
    },{isolationLevel:'RepeatableRead'});res.json(result);
  }catch(error){next(error)}});
  router.get('/orders/:id',async(req,res,next)=>{try{
    const {customerId,storeId}=pair.parse(req.query),ctx=req.wholesaleSeller;
    const order=await db.$transaction(async tx=>{
      await authorizeWholesalePrincipal(tx,ctx,{customerId,storeId},{lock:true});
      const rows=await tx.$queryRaw`SELECT * FROM "WholesaleOrderRequest" WHERE "id"=${req.params.id} AND "companyId"=${ctx.companyId} AND "actorId"=${ctx.actorId} AND "customerId"=${customerId} AND "storeId"=${storeId} AND "channel"='FIELD_SALES' LIMIT 1`;
      if(!rows[0])throw wholesaleError(404,'SELLER_ORDER_NOT_FOUND','Η παραγγελία δεν βρέθηκε.');return orderView(rows[0]);
    },{isolationLevel:'RepeatableRead'});res.json({order});
  }catch(error){next(error)}});

  router.use((error,req,res,next)=>{
    if(error.name==='ZodError')return res.status(400).json({error:'Έλεγξε τα στοιχεία της αίτησης πωλητή.',code:'WHOLESALE_SELLER_INVALID_INPUT'});
    if(error.status>=400&&error.status<500)return res.status(error.status).json({error:error.message,code:error.code,...(error.code==='PRICE_CHANGED'&&error.details?.quote?{details:{quote:sellerQuoteView(error.details.quote)}}:{})});
    console.error('Wholesale seller request failed',error.code||error.name);res.status(500).json({error:'Η υπηρεσία δεν είναι προσωρινά διαθέσιμη.',code:'WHOLESALE_SELLER_UNAVAILABLE'});
  });return router;
}

export default createWholesaleSellerRouter();
