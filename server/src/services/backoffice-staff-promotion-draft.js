import {randomUUID} from 'node:crypto';
import {z} from 'zod';
import {greeceRangeDate} from '../../../shared/greece-time.mjs';
import {isPromotionDraftRequest,promotionDraftCapability as capability} from '../../../shared/backoffice-staff-company.mjs';
import {staffError} from './backoffice-staff-access.js';
import {requireStaffCompanyGrant} from './backoffice-staff-company.js';

const idField=z.string().trim().min(1).max(200);
const input=z.object({
  productId:idField,storeId:idField,discountPercent:z.number().min(0.01).max(100).multipleOf(0.01),
  from:z.string().length(10),to:z.string().length(10)
}).strict();
const invalid=()=>staffError(400,'STAFF_PROMOTION_DRAFT_INVALID','Έλεγξε το προϊόν, το κατάστημα, την έκπτωση και τις ημερομηνίες.');

export async function createStaffPromotionDraft(db,req){
  const {user,staffCompanyGrant:initial}=req;
  if(!isPromotionDraftRequest(req.method,req.originalUrl)||user?.staffAccess!==true||user.storeId||
    initial?.capability!==capability||initial.companyId!==user.companyId||
    req.get('x-backoffice-company-id')!==user.companyId||req.get('x-backoffice-store-id')!==undefined)throw staffError();
  const parsed=input.safeParse(req.body);
  if(!parsed.success)throw invalid();
  const {productId,storeId,discountPercent,from,to}=parsed.data,companyId=user.companyId,id=randomUUID();
  const start=greeceRangeDate(from),end=greeceRangeDate(to,true);
  if(!start||!end||from<'2000-01-01'||to>'2100-12-31'||from>to)throw invalid();
  return db.$transaction(async tx=>{
    const live=await requireStaffCompanyGrant(tx,user,capability);
    if(live.revision!==initial.revision)throw staffError();
    const [product]=await tx.$queryRaw`SELECT p."salePrice" FROM "Product" p
      JOIN "StoreProduct" sp ON sp."productId"=p."id" AND sp."storeId"=${storeId} AND sp."active"=true
      JOIN "Store" s ON s."id"=sp."storeId" AND s."companyId"=p."companyId" AND s."active"=true
      WHERE p."id"=${productId} AND p."companyId"=${companyId} AND p."active"=true FOR SHARE OF p,sp,s`;
    if(!product)throw staffError(404,'STAFF_PROMOTION_DRAFT_PRODUCT_NOT_FOUND','Το ενεργό προϊόν δεν βρέθηκε στο επιλεγμένο κατάστημα.');
    await tx.$executeRaw`INSERT INTO "PriceCatalogPromotion"
      ("id","companyId","productId","promotionType","offerMode","originalPrice","discountPercent","validFrom","validUntil","active","createdByUserId","createdByName")
      VALUES (${id},${companyId},${productId},'LEAFLET','DISCOUNT_PERCENT',${product.salePrice??0},${discountPercent},${new Date(start)},${new Date(end)},false,${user.id},${user.fullName||user.email||'Χρήστης'})`;
    await tx.$executeRaw`INSERT INTO "PriceCatalogPromotionStore" ("promotionId","companyId","storeId") VALUES (${id},${companyId},${storeId})`;
    const detail=JSON.stringify({id,productId,storeId,discountPercent,from,to,active:false});
    await tx.$executeRaw`INSERT INTO "BackofficeStaffAudit" ("id","companyId","actorId","targetUserId","event","detail")
      VALUES (${randomUUID()},${companyId},${user.id},${user.id},'PROMOTION_DRAFT_CREATED',${detail}::jsonb)`;
    return {ok:true,companyId,id,active:false};
  });
}
