import {randomUUID} from 'node:crypto';
import {z} from 'zod';
import {isPromotionActivationRequest,promotionActivateCapability as capability} from '../../../shared/backoffice-staff-company.mjs';
import {staffError} from './backoffice-staff-access.js';
import {requireStaffCompanyGrant} from './backoffice-staff-company.js';
import {findOverlap,lockScope} from './promotion-store-scope.js';

const input=z.object({promotionId:z.string().uuid(),expectedUpdatedAt:z.string().datetime(),confirm:z.literal(true)}).strict();
const unavailable=()=>staffError(409,'STAFF_PROMOTION_DRAFT_CHANGED','Η πρόχειρη προσφορά άλλαξε ή έληξε. Ανανέωσε τη λίστα.');

async function verify(db,req){
  const {user,staffCompanyGrant:initial}=req;
  if(!isPromotionActivationRequest(req.method,req.originalUrl)||user?.staffAccess!==true||user.storeId||
    initial?.capability!==capability||initial.companyId!==user.companyId||
    req.get('x-backoffice-company-id')!==user.companyId||req.get('x-backoffice-store-id')!==undefined)throw staffError();
  const grant=await requireStaffCompanyGrant(db,user,capability);
  if(grant.revision!==initial.revision)throw staffError();
  return user.companyId;
}

async function drafts(db,companyId,id=null){
  return db.$queryRaw`SELECT p."id",p."productId",pr."name" AS "productName",s."id" AS "storeId",s."name" AS "storeName",
    p."validFrom",p."validUntil",p."updatedAt",p."discountPercent"::float8 AS "discountPercent"
    FROM "PriceCatalogPromotion" p JOIN "PriceCatalogPromotionStore" ps ON ps."companyId"=p."companyId" AND ps."promotionId"=p."id"
    JOIN "Product" pr ON pr."id"=p."productId" AND pr."companyId"=p."companyId" AND pr."active"=true
    JOIN "Store" s ON s."id"=ps."storeId" AND s."companyId"=p."companyId" AND s."active"=true
    JOIN "StoreProduct" sp ON sp."storeId"=s."id" AND sp."productId"=pr."id" AND sp."active"=true
    WHERE p."companyId"=${companyId} AND (${id}::text IS NULL OR p."id"=${id})
    AND p."active"=false AND p."promotionType"='LEAFLET' AND p."offerMode"='DISCOUNT_PERCENT'
    AND p."validUntil">=clock_timestamp() AND p."validFrom"<=p."validUntil"
    AND p."discountPercent">0 AND p."discountPercent"<=100
    AND EXISTS (SELECT 1 FROM "BackofficeStaffAudit" a WHERE a."companyId"=p."companyId"
      AND a."event"='PROMOTION_DRAFT_CREATED' AND a."detail"->>'id'=p."id")
    AND NOT EXISTS (SELECT 1 FROM "PriceCatalogPromotionStore" other WHERE other."companyId"=p."companyId"
      AND other."promotionId"=p."id" AND other."storeId"<>s."id")
    ORDER BY p."createdAt" DESC,p."id" LIMIT 100`;
}

export async function listStaffPromotionDrafts(db,req){
  const companyId=await verify(db,req);
  return {companyId,items:await drafts(db,companyId)};
}

export async function activateStaffPromotionDraft(db,req){
  const parsed=input.safeParse(req.body);
  if(!parsed.success)throw staffError(400,'STAFF_PROMOTION_ACTIVATION_INVALID','Επιβεβαίωσε την ενεργοποίηση της επιλεγμένης προσφοράς.');
  const {promotionId,expectedUpdatedAt}=parsed.data,user=req.user;
  return db.$transaction(async tx=>{
    const companyId=await verify(tx,req);
    const [candidate]=await drafts(tx,companyId,promotionId);
    if(!candidate)throw unavailable();
    const scope={companyId,productId:candidate.productId,promotionType:'LEAFLET',storeIds:[candidate.storeId]};
    await lockScope(tx,scope);
    const [lock]=await tx.$queryRaw`SELECT "id" FROM "PriceCatalogPromotion" WHERE "companyId"=${companyId}
      AND "id"=${promotionId} FOR UPDATE`;
    const [current]=lock?await drafts(tx,companyId,promotionId):[];
    if(!current||new Date(current.updatedAt).toISOString()!==expectedUpdatedAt||current.storeId!==candidate.storeId||current.productId!==candidate.productId)throw unavailable();
    const overlaps=await findOverlap(tx,{...scope,validFrom:current.validFrom,validUntil:current.validUntil,excludePromotionId:promotionId});
    if(overlaps.length)throw staffError(409,'PROMOTION_STORE_OVERLAP','Υπάρχει ενεργή προσφορά που επικαλύπτει το ίδιο προϊόν και κατάστημα.');
    const changed=await tx.$executeRaw`UPDATE "PriceCatalogPromotion" SET "active"=true,"updatedAt"=NOW()
      WHERE "companyId"=${companyId} AND "id"=${promotionId} AND "active"=false AND "validUntil">=clock_timestamp()`;
    if(changed!==1)throw unavailable();
    const detail=JSON.stringify({id:promotionId,storeId:current.storeId,productId:current.productId});
    await tx.$executeRaw`INSERT INTO "BackofficeStaffAudit" ("id","companyId","actorId","targetUserId","event","detail")
      VALUES (${randomUUID()},${companyId},${user.id},${user.id},'PROMOTION_DRAFT_ACTIVATED',${detail}::jsonb)`;
    return {ok:true,companyId,id:promotionId,active:true};
  });
}
