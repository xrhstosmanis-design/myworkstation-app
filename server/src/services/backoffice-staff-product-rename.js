import {randomUUID} from 'node:crypto';
import {z} from 'zod';
import {isProductRenameRequest,productRenameCapability as capability} from '../../../shared/backoffice-staff-company.mjs';
import {staffError} from './backoffice-staff-access.js';
import {requireStaffCompanyGrant} from './backoffice-staff-company.js';

const payload=z.object({
  productId:z.string().min(1).max(200),
  expectedName:z.string().min(1).max(20000),
  name:z.string().trim().min(1).max(200).refine(name=>!/[\u0000-\u001f\u007f]/.test(name))
}).strict();

export async function renameStaffCompanyProduct(db,req){
  const {user,staffCompanyGrant:initial}=req;
  if(!isProductRenameRequest(req.method,req.originalUrl)||user?.staffAccess!==true||user.storeId||
    initial?.capability!==capability||initial.companyId!==user.companyId||
    req.get('x-backoffice-company-id')!==user.companyId||req.get('x-backoffice-store-id')!==undefined)throw staffError();
  const parsed=payload.safeParse(req.body);
  if(!parsed.success)throw staffError(400,'STAFF_PRODUCT_RENAME_INVALID','Έλεγξε τη νέα ονομασία.');
  const {productId,expectedName,name}=parsed.data,companyId=user.companyId;
  return db.$transaction(async tx=>{
    const live=await requireStaffCompanyGrant(tx,user,capability);
    if(live.revision!==initial.revision)throw staffError();
    const [current]=await tx.$queryRaw`SELECT "name" FROM "Product"
      WHERE "id"=${productId} AND "companyId"=${companyId} AND "active"=true FOR UPDATE`;
    if(!current)throw staffError(404,'STAFF_PRODUCT_NOT_FOUND','Δεν βρέθηκε ενεργό προϊόν της εταιρείας.');
    const result={ok:true,companyId,productId,name};
    if(current.name===name)return result;
    if(current.name!==expectedName)throw staffError(409,'STAFF_PRODUCT_NAME_CHANGED','Η ονομασία άλλαξε. Ανανέωσε την καρτέλα.');
    await tx.$executeRaw`UPDATE "Product" SET "name"=${name},"updatedAt"=NOW() WHERE "id"=${productId} AND "companyId"=${companyId}`;
    const detail=JSON.stringify({productId,before:current.name,after:name});
    await tx.$executeRaw`INSERT INTO "BackofficeStaffAudit" ("id","companyId","actorId","targetUserId","event","detail")
      VALUES (${randomUUID()},${companyId},${user.id},${user.id},'COMPANY_PRODUCT_RENAMED',${detail}::jsonb)`;
    return result;
  });
}
