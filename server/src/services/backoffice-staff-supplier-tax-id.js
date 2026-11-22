import {randomUUID} from 'node:crypto';
import {z} from 'zod';
import {staffSupplierManagementRoute,supplierTaxIdCapability} from '../../../shared/backoffice-staff-company.mjs';
import {staffError} from './backoffice-staff-access.js';
import {requireStaffCompanyGrant} from './backoffice-staff-company.js';

const taxIdSchema=z.object({
 taxId:z.string().trim().min(9).max(30),
 reason:z.string().trim().min(5).max(500),
 confirmOriginal:z.literal(true),
 updatedAt:z.string().datetime()
}).strict();
function greekTaxId(value){
 const trimmed=String(value??'').trim().toUpperCase();
 if(!/^(?:EL|GR)?[\d -]+$/.test(trimmed))return null;
 const digits=trimmed.replace(/\D/g,'');
 return /^\d{9}$/.test(digits)?digits:null;
}
function validGreekTaxId(digits){
 if(!digits||/^0+$/.test(digits))return false;
 const sum=Array.from(digits.slice(0,8)).reduce((total,digit,index)=>total+Number(digit)*2**(8-index),0);
 return sum%11%10===Number(digits[8]);
}
const duplicate=()=>staffError(409,'STAFF_SUPPLIER_TAX_ID_EXISTS','Υπάρχει άλλη καρτέλα προμηθευτή με αυτό το ΑΦΜ στην εταιρεία.');

export async function correctStaffSupplierTaxId(db,req){
 const route=staffSupplierManagementRoute(req.method,String(req.originalUrl||req.path||''));
 const {user,staffCompanyGrant:initial}=req,capability=supplierTaxIdCapability;
 if(route?.capability!==capability||req.params.partyId!==route.supplierId||user?.staffAccess!==true||
   initial?.capability!==capability||initial.companyId!==user.companyId||
   req.get('x-backoffice-company-id')!==user.companyId||req.get('x-backoffice-store-id')!==undefined)throw staffError();
 const parsed=taxIdSchema.safeParse(req.body);
 const taxId=parsed.success?greekTaxId(parsed.data.taxId):null;
 if(!parsed.success||!validGreekTaxId(taxId))throw staffError(400,'STAFF_SUPPLIER_AFM_INVALID','Βάλε έγκυρο ελληνικό ΑΦΜ, αιτιολογία και επιβεβαίωσε το πρωτότυπο.');
 const {updatedAt,reason}=parsed.data,{companyId}=user,{supplierId}=route;
 try{return await db.$transaction(async tx=>{
  const live=await requireStaffCompanyGrant(tx,user,capability);
  if(live.revision!==initial.revision)throw staffError();
  const lockKey='invoice-issuer-supplier:'+companyId+':'+taxId;
  await tx.$queryRaw`SELECT (pg_advisory_xact_lock(hashtext(${lockKey})) IS NULL) AS "locked"`;
  const [supplier]=await tx.$queryRaw`SELECT "taxId","updatedAt" FROM "Supplier" WHERE "id"=${supplierId} AND "companyId"=${companyId} AND "active"=true FOR UPDATE`;
  if(!supplier)throw staffError(404,'STAFF_OBJECT_NOT_FOUND','Δεν βρέθηκε ενεργός προμηθευτής στην εταιρεία.');
  if(supplier.taxId===taxId)return {ok:true,companyId,supplierId};
  if(new Date(supplier.updatedAt).toISOString()!==updatedAt)throw staffError(409,'STAFF_SUPPLIER_TAX_ID_CHANGED','Η καρτέλα άλλαξε. Ανανέωσε και ξαναδοκίμασε.');
  const [same]=await tx.$queryRaw`SELECT "id" FROM "Supplier" WHERE "companyId"=${companyId} AND "id"<>${supplierId}
   AND regexp_replace(COALESCE("taxId",''),'[^0-9]','','g')=${taxId} LIMIT 1`;
  if(same)throw duplicate();
  if(greekTaxId(supplier.taxId)!==taxId){
   const [history]=await tx.$queryRaw`SELECT (
    EXISTS(SELECT 1 FROM "PurchaseDocument" WHERE "companyId"=${companyId} AND "supplierId"=${supplierId})
    OR EXISTS(SELECT 1 FROM "PurchaseOrder" WHERE "companyId"=${companyId} AND "supplierId"=${supplierId})
    OR EXISTS(SELECT 1 FROM "StoreTransaction" WHERE "companyId"=${companyId} AND "supplierId"=${supplierId})
   ) AS linked`;
   if(history?.linked!==false)throw staffError(409,'STAFF_SUPPLIER_HAS_FINANCIAL_HISTORY','Η καρτέλα έχει συνδεδεμένες αγορές ή πληρωμές. Χρειάζεται ειδικός έλεγχος πριν από αλλαγή ΑΦΜ.');
  }
  await tx.$executeRaw`UPDATE "Supplier" SET "taxId"=${taxId},"updatedAt"=NOW() WHERE "id"=${supplierId} AND "companyId"=${companyId}`;
  const detail=JSON.stringify({supplierId,before:supplier.taxId,after:taxId,reason});
  await tx.$executeRaw`INSERT INTO "BackofficeStaffAudit" ("id","companyId","actorId","targetUserId","event","detail")
   VALUES (${randomUUID()},${companyId},${user.id},${user.id},'SUPPLIER_TAX_ID_CORRECTED',${detail}::jsonb)`;
  return {ok:true,companyId,supplierId};
 })}catch(error){if(error?.code==='P2010'&&error.meta?.code==='23505')throw duplicate();throw error}
}
