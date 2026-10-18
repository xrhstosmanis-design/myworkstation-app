import {Router} from 'express';
import {Prisma} from '@prisma/client';
import {z} from 'zod';
import {prisma} from '../prisma.js';
import {ensureWholesalePortalSchema} from '../wholesale-portal-bootstrap.js';
import {buildWholesaleQuote} from '../lib/wholesale-pricing.js';
import {createWholesaleOrder} from '../lib/wholesale-orders.js';
import {authorizeWholesalePrincipal,wholesaleError} from '../lib/wholesale-principal.js';
import {PORTAL_ORIGIN,portalSlug,portalToken,portalCookie,requirePortalOrigin,requirePortalCsrf,findPortalSite,authenticatePortalSession,describePortalSession,loginPortal,logoutPortal} from '../lib/wholesale-portal-auth.js';

const id=z.string().trim().min(1).max(200);
const pageQuery=z.object({storeId:id,page:z.string().regex(/^[1-9]\d*$/).transform(Number).pipe(z.number().max(1000000)).default('1'),pageSize:z.string().regex(/^[1-9]\d*$/).transform(Number).pipe(z.number().max(100)).default('50')}).strict();
const catalogQuery=pageQuery.extend({q:z.string().trim().max(160).default('')});
const items=z.array(z.object({productId:id,quantity:z.string().max(40)}).strict()).min(1).max(100);
const quoteBody=z.object({storeId:id,items}).strict();
const orderBody=quoteBody.extend({clientOrderId:z.string().uuid(),quoteId:z.string().regex(/^[a-f0-9]{64}$/),notes:z.string().trim().max(2000).default('')});
export function publicWholesaleQuote(quote){
  return {quoteId:quote.quoteId,currency:quote.currency,customerId:quote.customerId,customerName:quote.customerName,storeId:quote.storeId,creditChecked:quote.creditChecked,totals:quote.totals,items:quote.items.map(item=>({productId:item.productId,name:item.name,sku:item.sku,unit:item.unit,quantity:item.quantity,sourceUnitPrice:item.sourceUnitPrice,sourcePriceBasis:item.sourcePriceBasis,vatRate:item.vatRate,netTotal:item.netTotal,vatTotal:item.vatTotal,grossTotal:item.grossTotal}))};
}
const publicOrder=row=>({id:row.id,status:row.status,clientOrderId:row.clientOrderId,createdAt:row.createdAt,notes:row.notes||'',snapshot:publicWholesaleQuote(typeof row.snapshot==='string'?JSON.parse(row.snapshot):row.snapshot)});
const boundInput=(ctx,storeId,items=[])=>({customerId:ctx.customerId,storeId,items});
export function createWholesalePortalRouter({db=prisma,ensureSchema=ensureWholesalePortalSchema,expectedOrigin=PORTAL_ORIGIN,loginLimiter}={}){
  const router=Router();
  router.use('/:slug',async(req,res,next)=>{try{
    res.set('Cache-Control','no-store');res.vary('Cookie');res.vary('Origin');
    const slug=portalSlug.parse(req.params.slug);req.portalSlug=slug;
    if(req.headers.authorization)throw wholesaleError(401,'B2B_AUTH_REQUIRED','Απαιτείται ξεχωριστή σύνδεση πελάτη.');
    if(!['GET','HEAD'].includes(req.method))requirePortalOrigin(req,expectedOrigin);
    await ensureSchema(db);
    if((req.method==='GET'&&req.path==='/config')||(req.method==='POST'&&req.path==='/session'))return next();
    req.b2b=await authenticatePortalSession(db,slug,portalToken(req));
    // A second tab can replace the shared cookie with another customer's login.
    // This optional UI expectation only rejects a mismatch; it never selects an
    // identity or grants authority. /me remains available to discover a change.
    const expectedAccount=req.headers['x-b2b-account'];
    if(req.path!=='/me'&&expectedAccount!==undefined&&expectedAccount!==req.b2b.accountId)throw wholesaleError(401,'B2B_ACCOUNT_CHANGED','Η σύνδεση πελάτη άλλαξε. Συνδέσου ξανά.');
    if(!['GET','HEAD'].includes(req.method))requirePortalCsrf(req,req.b2b);
    next();
  }catch(error){next(error)}});
  router.get('/:slug/config',async(req,res,next)=>{try{
    const site=await findPortalSite(db,req.portalSlug);if(!site)throw wholesaleError(404,'B2B_SITE_UNAVAILABLE','Ο κατάλογος δεν είναι διαθέσιμος.');
    res.json({site:{slug:site.slug,name:site.name}});
  }catch(error){next(error)}});
  router.post('/:slug/session',async(req,res,next)=>{try{
    const {token,ctx}=await loginPortal(db,req.portalSlug,req.body,{limiter:loginLimiter});
    res.set('Set-Cookie',portalCookie(token,req.portalSlug));res.json(describePortalSession(ctx));
  }catch(error){next(error)}});
  router.get('/:slug/me',(req,res)=>res.json(describePortalSession(req.b2b)));
  router.delete('/:slug/session',async(req,res,next)=>{try{
    await logoutPortal(db,req.b2b);res.set('Set-Cookie',portalCookie('',req.portalSlug,{clear:true}));res.json({ok:true});
  }catch(error){next(error)}});
  router.get('/:slug/catalog',async(req,res,next)=>{try{
    const {storeId,q,page,pageSize}=catalogQuery.parse(req.query),ctx=req.b2b,pattern=`%${q}%`;
    const result=await db.$transaction(async tx=>{
      await authorizeWholesalePrincipal(tx,ctx,boundInput(ctx,storeId));
      const filter=Prisma.sql`FROM "Product" p JOIN "StoreProduct" sp ON sp."productId"=p."id" JOIN "WholesalePortalPublication" pub ON pub."productId"=p."id" AND pub."companyId"=p."companyId" WHERE p."companyId"=${ctx.companyId} AND pub."siteId"=${ctx.siteId} AND pub."storeId"=${storeId} AND pub."active"=true AND p."active"=true AND sp."active"=true AND sp."storeId"=${storeId} AND (p."name" ILIKE ${pattern} OR p."sku" ILIKE ${pattern})`;
      const rows=await tx.$queryRaw(Prisma.sql`SELECT p."id",p."name",p."sku",p."unit" ${filter} ORDER BY p."name",p."id" LIMIT ${pageSize} OFFSET ${(page-1)*pageSize}`);
      const counts=await tx.$queryRaw(Prisma.sql`SELECT COUNT(*) AS total ${filter}`);return {items:rows,total:Number(counts[0]?.total||0),page,pageSize};
    },{isolationLevel:'RepeatableRead'});res.json(result);
  }catch(error){next(error)}});
  router.post('/:slug/quotes',async(req,res,next)=>{try{
    const body=quoteBody.parse(req.body),ctx=req.b2b;
    const quote=await db.$transaction(tx=>buildWholesaleQuote(tx,ctx,boundInput(ctx,body.storeId,body.items),{lock:true}),{isolationLevel:'RepeatableRead'});
    res.json(publicWholesaleQuote(quote));
  }catch(error){next(error)}});
  router.post('/:slug/orders',async(req,res,next)=>{try{
    const body=orderBody.parse(req.body),ctx=req.b2b;
    const result=await createWholesaleOrder(db,ctx,{...boundInput(ctx,body.storeId,body.items),clientOrderId:body.clientOrderId,quoteId:body.quoteId,notes:body.notes});
    res.status(result.replayed?200:201).json({orderId:result.orderId,status:result.status,replayed:result.replayed,order:publicOrder(result.order)});
  }catch(error){next(error)}});
  router.get('/:slug/orders',async(req,res,next)=>{try{
    const {storeId,page,pageSize}=pageQuery.parse(req.query),ctx=req.b2b;
    const result=await db.$transaction(async tx=>{
      await authorizeWholesalePrincipal(tx,ctx,boundInput(ctx,storeId));
      const filter=Prisma.sql`FROM "WholesaleOrderRequest" WHERE "companyId"=${ctx.companyId} AND "customerId"=${ctx.customerId} AND "storeId"=${storeId} AND "channel"='B2B_SITE'`;
      const rows=await tx.$queryRaw(Prisma.sql`SELECT * ${filter} ORDER BY "createdAt" DESC,"id" DESC LIMIT ${pageSize} OFFSET ${(page-1)*pageSize}`),counts=await tx.$queryRaw(Prisma.sql`SELECT COUNT(*) AS total ${filter}`);
      return {items:rows.map(publicOrder),total:Number(counts[0]?.total||0),page,pageSize};
    },{isolationLevel:'RepeatableRead'});res.json(result);
  }catch(error){next(error)}});
  router.get('/:slug/orders/:id',async(req,res,next)=>{try{
    const {storeId}=z.object({storeId:id}).strict().parse(req.query),ctx=req.b2b;
    const order=await db.$transaction(async tx=>{
      await authorizeWholesalePrincipal(tx,ctx,boundInput(ctx,storeId));
      const rows=await tx.$queryRaw`SELECT * FROM "WholesaleOrderRequest" WHERE "id"=${req.params.id} AND "companyId"=${ctx.companyId} AND "customerId"=${ctx.customerId} AND "storeId"=${storeId} AND "channel"='B2B_SITE' LIMIT 1`;
      if(!rows[0])throw wholesaleError(404,'B2B_ORDER_NOT_FOUND','Η παραγγελία δεν βρέθηκε.');return publicOrder(rows[0]);
    },{isolationLevel:'RepeatableRead'});res.json({order});
  }catch(error){next(error)}});
  router.use((error,req,res,next)=>{
    if(error.name==='ZodError')return res.status(400).json({error:'Έλεγξε τα στοιχεία της αίτησης.',code:'B2B_INVALID_INPUT'});
    if(error.status>=400&&error.status<500)return res.status(error.status).json({error:error.message,code:error.code,...(error.code==='PRICE_CHANGED'&&error.details?.quote?{details:{quote:publicWholesaleQuote(error.details.quote)}}:{})});
    console.error("Wholesale portal request failed",error.code||error.name);res.status(500).json({error:"Η υπηρεσία δεν είναι προσωρινά διαθέσιμη.",code:"B2B_UNAVAILABLE"});
  });
  return router;
}

export default createWholesalePortalRouter();
