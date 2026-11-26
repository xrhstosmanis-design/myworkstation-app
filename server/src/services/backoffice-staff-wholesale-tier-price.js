import {randomUUID} from 'node:crypto';
import {z} from 'zod';
import {wholesaleTierPriceCapability as capability,isWholesaleTierPriceRequest} from '../../../shared/backoffice-staff-company.mjs';
import {assertWholesaleEntitlement} from '../lib/wholesale-entitlement.js';
import {staffError} from './backoffice-staff-access.js';
import {requireStaffCompanyGrant} from './backoffice-staff-company.js';

const id=z.string().trim().min(1).max(200);
const payload=z.object({
  priceListId:id,tierId:id,expectedVersion:z.number().int().min(1).max(2147483646),
  unitPrice:z.number().finite().min(0).max(9999999999.9999).refine(value=>/^\d+(?:\.\d{1,4})?$/.test(String(value))),
  priceBasis:z.enum(['NET','GROSS'])
}).strict();

export async function saveStaffWholesaleTierPrice(db,req){
  const {user,staffCompanyGrant:initial}=req;
  if(!isWholesaleTierPriceRequest(req.method,req.originalUrl)||user?.staffAccess!==true||user.storeId||
    initial?.capability!==capability||initial.companyId!==user.companyId||
    req.get('x-backoffice-company-id')!==user.companyId||req.get('x-backoffice-store-id')!==undefined)throw staffError();
  const parsed=payload.safeParse(req.body);
  if(!parsed.success)throw staffError(400,'STAFF_WHOLESALE_TIER_INVALID','Έλεγξε την τιμή και τη βάση ΦΠΑ.');
  const companyId=user.companyId,{priceListId,tierId,expectedVersion,unitPrice,priceBasis}=parsed.data;
  const stale=()=>staffError(409,'TIER_CHANGED','Η τιμή άλλαξε. Ανανέωσε τον τιμοκατάλογο.');
  return db.$transaction(async tx=>{
    const grant=await requireStaffCompanyGrant(tx,user,capability);
    if(grant.revision!==initial.revision)throw staffError();
    await assertWholesaleEntitlement(tx,companyId,{lock:true});
    const [before]=await tx.$queryRaw`SELECT t.* FROM "WholesalePriceListProduct" t
      JOIN "WholesalePriceList" l ON l."id"=t."priceListId" AND l."companyId"=t."companyId" AND l."active"=true
      JOIN "Product" p ON p."id"=t."productId" AND p."companyId"=t."companyId" AND p."active"=true
      WHERE t."id"=${tierId} AND t."priceListId"=${priceListId} AND t."companyId"=${companyId}
      FOR UPDATE OF t FOR SHARE OF l,p`;
    if(!before)throw staffError(404,'TIER_NOT_FOUND','Δεν βρέθηκε ενεργή κλίμακα του τιμοκαταλόγου.');
    if(before.version!==expectedVersion)throw stale();
    const [after]=await tx.$queryRaw`UPDATE "WholesalePriceListProduct" SET "unitPrice"=${unitPrice},
      "discountPercent"=NULL,"priceBasis"=${priceBasis},"version"="version"+1,"updatedAt"=NOW()
      WHERE "id"=${tierId} AND "companyId"=${companyId} AND "version"=${expectedVersion} RETURNING *`;
    if(!after)throw stale();
    await tx.$executeRaw`INSERT INTO "WholesalePriceAudit" ("id","companyId","actorId","priceListId","productId","minimumQuantity","oldJson","newJson")
      VALUES (${randomUUID()},${companyId},${user.id},${priceListId},${before.productId},${before.minimumQuantity},${JSON.stringify(before)}::jsonb,${JSON.stringify(after)}::jsonb)`;
    await assertWholesaleEntitlement(tx,companyId,{lock:true});
    return {ok:true,companyId,tierId,version:after.version};
  });
}
