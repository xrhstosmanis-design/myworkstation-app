import {randomUUID} from 'node:crypto';
import {z} from 'zod';
import {isProductDescriptionRequest,productDescriptionCapability as capability} from '../../../shared/backoffice-staff-company.mjs';
import {staffError} from './backoffice-staff-access.js';
import {requireStaffCompanyGrant} from './backoffice-staff-company.js';

const payload=z.object({
  productId:z.string().min(1).max(200),
  expectedDescription:z.string().max(20000).nullable(),
  description:z.string().trim().max(1000).refine(value=>!/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(value))
}).strict();

export async function saveStaffProductDescription(db,req){
  const {user,staffCompanyGrant:initial}=req;
  if(!isProductDescriptionRequest(req.method,req.originalUrl)||user?.staffAccess!==true||user.storeId||
    initial?.capability!==capability||initial.companyId!==user.companyId||
    req.get('x-backoffice-company-id')!==user.companyId||req.get('x-backoffice-store-id')!==undefined)throw staffError();
  const parsed=payload.safeParse(req.body);
  if(!parsed.success)throw staffError(400,'STAFF_PRODUCT_DESCRIPTION_INVALID','Έλεγξε την περιγραφή του είδους.');
  const {productId,expectedDescription}=parsed.data,description=parsed.data.description||null,companyId=user.companyId;
  return db.$transaction(async tx=>{
    const live=await requireStaffCompanyGrant(tx,user,capability);
    if(live.revision!==initial.revision)throw staffError();
    const [current]=await tx.$queryRaw`SELECT "description" FROM "Product"
      WHERE "id"=${productId} AND "companyId"=${companyId} AND "active"=true FOR UPDATE`;
    if(!current)throw staffError(404,'STAFF_PRODUCT_NOT_FOUND','Δεν βρέθηκε ενεργό προϊόν της εταιρείας.');
    const result={ok:true,companyId,productId,description};
    if(current.description===description)return result;
    if(current.description!==expectedDescription)throw staffError(409,'STAFF_PRODUCT_DESCRIPTION_CHANGED','Η περιγραφή άλλαξε. Ανανέωσε την καρτέλα.');
    await tx.$executeRaw`UPDATE "Product" SET "description"=${description},"updatedAt"=NOW() WHERE "id"=${productId} AND "companyId"=${companyId}`;
    const detail=JSON.stringify({productId,before:current.description,after:description});
    await tx.$executeRaw`INSERT INTO "BackofficeStaffAudit" ("id","companyId","actorId","targetUserId","event","detail")
      VALUES (${randomUUID()},${companyId},${user.id},${user.id},'COMPANY_PRODUCT_DESCRIPTION_CHANGED',${detail}::jsonb)`;
    return result;
  });
}
