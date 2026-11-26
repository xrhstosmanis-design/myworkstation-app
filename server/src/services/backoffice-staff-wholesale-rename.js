import {randomUUID} from 'node:crypto';
import {z} from 'zod';
import {isWholesalePriceListRenameRequest,wholesalePriceListRenameCapability as capability} from '../../../shared/backoffice-staff-company.mjs';
import {assertWholesaleEntitlement} from '../lib/wholesale-entitlement.js';
import {staffError} from './backoffice-staff-access.js';
import {requireStaffCompanyGrant} from './backoffice-staff-company.js';

const payload=z.object({
  priceListId:z.string().trim().min(1).max(200),
  expectedName:z.string().min(1).max(20000),
  name:z.string().trim().min(1).max(160).refine(name=>!/[\u0000-\u001f\u007f]/.test(name))
}).strict();

export async function renameStaffWholesalePriceList(db,req){
  const {user,staffCompanyGrant:initial}=req;
  if(!isWholesalePriceListRenameRequest(req.method,req.originalUrl)||user?.staffAccess!==true||user.storeId||
    initial?.capability!==capability||initial.companyId!==user.companyId||
    req.get('x-backoffice-company-id')!==user.companyId||req.get('x-backoffice-store-id')!==undefined)throw staffError();
  const parsed=payload.safeParse(req.body);
  if(!parsed.success)throw staffError(400,'STAFF_WHOLESALE_RENAME_INVALID','Έλεγξε την ονομασία του τιμοκαταλόγου.');
  const {priceListId,expectedName,name}=parsed.data,companyId=user.companyId;
  return db.$transaction(async tx=>{
    const live=await requireStaffCompanyGrant(tx,user,capability);
    if(live.revision!==initial.revision)throw staffError();
    await assertWholesaleEntitlement(tx,companyId,{lock:true});
    const [row]=await tx.$queryRaw`SELECT "name" FROM "WholesalePriceList"
      WHERE "id"=${priceListId} AND "companyId"=${companyId} FOR UPDATE`;
    if(!row)throw staffError(404,'STAFF_WHOLESALE_PRICE_LIST_NOT_FOUND','Δεν βρέθηκε ο τιμοκατάλογος της εταιρείας.');
    const result={ok:true,companyId,priceListId,name};
    if(row.name===name)return result;
    if(row.name!==expectedName)throw staffError(409,'STAFF_WHOLESALE_NAME_CHANGED','Η ονομασία άλλαξε. Ανανέωσε τους τιμοκαταλόγους.');
    await tx.$executeRaw`UPDATE "WholesalePriceList" SET "name"=${name},"updatedAt"=NOW()
      WHERE "id"=${priceListId} AND "companyId"=${companyId}`;
    const detail=JSON.stringify({priceListId,before:row.name,after:name});
    await tx.$executeRaw`INSERT INTO "BackofficeStaffAudit" ("id","companyId","actorId","targetUserId","event","detail")
      VALUES (${randomUUID()},${companyId},${user.id},${user.id},'WHOLESALE_PRICE_LIST_RENAMED',${detail}::jsonb)`;
    await assertWholesaleEntitlement(tx,companyId,{lock:true});
    return result;
  });
}
