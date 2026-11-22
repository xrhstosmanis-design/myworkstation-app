import crypto from 'node:crypto';
import {z} from 'zod';

export const onlineVisibilitySchema = z.object({mode:z.enum(['AUTO','SHOW','HIDE'])}).strict();
const fail = (message,status=409) => Object.assign(new Error(message),{status});

// Caller supplies the native authenticated/licensed store context and transaction.
export async function saveOnlineVisibility(tx,{companyId,storeId,productId,body,actor,storeName,userAgent,ipAddress}) {
  const {mode}=onlineVisibilitySchema.parse(body);
  const stores=await tx.$queryRaw`SELECT "id" FROM "Store" WHERE "id"=${storeId} AND "companyId"=${companyId} AND "active"=TRUE FOR UPDATE`;
  if(!stores.length)throw fail('Δεν βρέθηκε ενεργό κατάστημα.',404);
  const products=await tx.$queryRaw`SELECT p."id" FROM "Product" p JOIN "StoreProduct" sp ON sp."productId"=p."id" WHERE p."companyId"=${companyId} AND sp."storeId"=${storeId} AND p."id"=${productId} AND p."active"=TRUE AND sp."active"=TRUE FOR UPDATE OF sp`;
  if(!products.length)throw fail('Το προϊόν δεν είναι ενεργό στο επιλεγμένο κατάστημα.',404);
  const previous=(await tx.$queryRaw`SELECT "companyId","visible" FROM "OnlineProductVisibility" WHERE "storeId"=${storeId} AND "productId"=${productId} FOR UPDATE`)[0];
  if(previous&&previous.companyId!==companyId)throw fail('Η επιλογή προϊόντος δεν ανήκει στην εταιρεία.');
  if(mode==='AUTO')await tx.$executeRaw`DELETE FROM "OnlineProductVisibility" WHERE "companyId"=${companyId} AND "storeId"=${storeId} AND "productId"=${productId}`;
  else {
    const count=await tx.$executeRaw`INSERT INTO "OnlineProductVisibility" ("id","companyId","storeId","productId","visible") VALUES (${crypto.randomUUID()},${companyId},${storeId},${productId},${mode==='SHOW'}) ON CONFLICT ("storeId","productId") DO UPDATE SET "visible"=EXCLUDED."visible","updatedAt"=CURRENT_TIMESTAMP WHERE "OnlineProductVisibility"."companyId"=EXCLUDED."companyId"`;
    if(count!==1)throw fail('Η επιλογή προϊόντος άλλαξε. Ανανεώστε τον κατάλογο.');
  }
  const visibilityOverride=(await tx.$queryRaw`SELECT "visible" FROM "OnlineProductVisibility" WHERE "companyId"=${companyId} AND "storeId"=${storeId} AND "productId"=${productId}`)[0]?.visible??null;
  const before=previous?previous.visible?'SHOW':'HIDE':'AUTO';
  await tx.authAudit.create({data:{userId:actor.id,email:actor.email||'super-admin',event:'ONLINE_STORE_PRODUCT_VISIBILITY_UPDATED',success:true,deviceName:`${storeName} · ${productId} · ${before} → ${mode}`,userAgent:userAgent||null,ipAddress:ipAddress||null}});
  return {productId,visibilityOverride,visible:visibilityOverride===true};
}
