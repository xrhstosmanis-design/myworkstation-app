import {randomUUID} from 'node:crypto';
import {z} from 'zod';
import {isWholesalePriceListDraftRequest,wholesalePriceListDraftCapability as capability} from '../../../shared/backoffice-staff-company.mjs';
import {assertWholesaleEntitlement} from '../lib/wholesale-entitlement.js';
import {staffError} from './backoffice-staff-access.js';
import {requireStaffCompanyGrant} from './backoffice-staff-company.js';

const label=max=>z.string().trim().min(1).max(max).refine(value=>!/[\u0000-\u001f\u007f]/.test(value));
const input=z.object({code:label(60),name:label(160)}).strict();

export async function createStaffWholesalePriceListDraft(db,req){
  const {user,staffCompanyGrant:initial}=req;
  const path=String(req.originalUrl||'');
  if(!isWholesalePriceListDraftRequest(req.method,path)||user?.staffAccess!==true||user.storeId||
    initial?.capability!==capability||initial.companyId!==user.companyId||
    req.get('x-backoffice-company-id')!==user.companyId||req.get('x-backoffice-store-id')!==undefined)throw staffError();
  const parsed=input.safeParse(req.body);
  if(!parsed.success)throw staffError(400,'STAFF_WHOLESALE_DRAFT_INVALID','Έλεγξε τον κωδικό και την ονομασία.');
  const {code,name}=parsed.data,companyId=user.companyId,id=randomUUID();
  return db.$transaction(async tx=>{
    const live=await requireStaffCompanyGrant(tx,user,capability);
    if(live.revision!==initial.revision)throw staffError();
    await assertWholesaleEntitlement(tx,companyId,{lock:true});
    const inserted=await tx.$executeRaw`INSERT INTO "WholesalePriceList" ("id","companyId","code","name","discountPercent","active")
      VALUES (${id},${companyId},${code},${name},0,false) ON CONFLICT ("companyId","code") DO NOTHING`;
    if(inserted!==1)throw staffError(409,'STAFF_WHOLESALE_DRAFT_DUPLICATE','Υπάρχει ήδη τιμοκατάλογος με αυτόν τον κωδικό.');
    const detail=JSON.stringify({id,code,name,active:false});
    await tx.$executeRaw`INSERT INTO "BackofficeStaffAudit" ("id","companyId","actorId","targetUserId","event","detail")
      VALUES (${randomUUID()},${companyId},${user.id},${user.id},'WHOLESALE_PRICE_LIST_DRAFT_CREATED',${detail}::jsonb)`;
    await assertWholesaleEntitlement(tx,companyId,{lock:true});
    return {ok:true,companyId,id,active:false};
  });
}
