import {z} from 'zod';
import {readNetlinkPaidConfig} from '../integrations/netlink/paid-issuance-store.js';
export function addPlatformNetlinkPosConfig(router,{db,context}){
 const base='/companies/:companyId/stores/:storeId';
 router.get(`${base}/netlink-pos-products`,async(req,res,next)=>{try{
  const s=await context(req),q=z.string().trim().max(100).parse(req.query.q||'');
  const rows=await db.$queryRaw`SELECT p."id",p."name",p."sku",p."vatRate" FROM "Product" p JOIN "StoreProduct" sp ON sp."productId"=p."id" AND sp."storeId"=${s.storeId} AND sp."active"=true WHERE p."companyId"=${s.companyId} AND p."active"=true AND p."trackStock"=false AND (p."name" ILIKE ${'%'+q+'%'} OR p."sku" ILIKE ${'%'+q+'%'}) ORDER BY p."name",p."id" LIMIT 50`;
  res.json({items:rows});
 }catch(e){next(e)}});
 router.get(`${base}/netlink-pos-config`,async(req,res,next)=>{try{
  const s=await context(req);try{const c=await readNetlinkPaidConfig(db,s);res.json({configured:true,...c})}catch(e){if(e.code!=='NETLINK_POS_CONFIG_REQUIRED')throw e;res.json({configured:false,serviceFeeAmount:.5})}
 }catch(e){next(e)}});
 router.put(`${base}/netlink-pos-config`,async(req,res,next)=>{try{
  const s=await context(req),b=z.object({saleProductId:z.string().trim().min(1).max(200),serviceFeeProductId:z.string().trim().min(1).max(200)}).strict().parse(req.body);
  if(b.saleProductId===b.serviceFeeProductId)return res.status(400).json({error:'Επίλεξε δύο διαφορετικά είδη για αξία κάρτας και παροχή.'});
  const result=await db.$transaction(async tx=>{
   await tx.$executeRaw`INSERT INTO "NetlinkStoreConfig" ("companyId","storeId","saleProductId","serviceFeeProductId","serviceFeeAmount","active") VALUES (${s.companyId},${s.storeId},${b.saleProductId},${b.serviceFeeProductId},0.50,true) ON CONFLICT ("storeId") DO UPDATE SET "saleProductId"=EXCLUDED."saleProductId","serviceFeeProductId"=EXCLUDED."serviceFeeProductId","serviceFeeAmount"=0.50,"active"=true,"updatedAt"=NOW() WHERE "NetlinkStoreConfig"."companyId"=EXCLUDED."companyId"`;
   const c=await readNetlinkPaidConfig(tx,s);
   await tx.authAudit.create({data:{userId:req.user.id,email:req.user.email||'platform-admin',event:`NETLINK_POS_CONFIGURED:${s.companyId}:${s.storeId}`,success:true}});
   return c;
  });res.json({configured:true,...result});
 }catch(e){next(e)}});
}
