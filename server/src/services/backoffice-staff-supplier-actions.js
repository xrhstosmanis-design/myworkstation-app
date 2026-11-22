import {createHash} from 'node:crypto';
import {z} from 'zod';
import {staffSupplierManagementRoute,supplierBalanceAdjustCapability,supplierDeactivateCapability,supplierReactivateCapability} from '../../../shared/backoffice-staff-company.mjs';
import {staffError} from './backoffice-staff-access.js';
import {requireStaffCompanyGrant} from './backoffice-staff-company.js';

const amount=z.number().finite().min(-999999999).max(999999999)
 .refine(value=>value!==0&&Number(value.toFixed(4))===value);
const reason=z.string().trim().min(5).max(500);
const common={operationId:z.string().uuid(),confirmed:z.literal(true)};
const balanceInput=z.object({...common,amount,note:reason,occurredAt:z.string().datetime().optional()}).strict();
const changeStatusInput=z.object({...common,reason,updatedAt:z.string().datetime()}).strict();

export async function applyStaffSupplierAction(db,req){
 const path=String(req.originalUrl||req.path||'').split('?')[0];
 const action=staffSupplierManagementRoute(req.method,path);
 const {user,staffCompanyGrant:initial}=req;
 if(!action||req.params.partyId!==action.supplierId||user?.staffAccess!==true||
  initial?.capability!==action.capability||initial.companyId!==user.companyId||
  req.get('x-backoffice-company-id')!==user.companyId||req.get('x-backoffice-store-id')!==undefined)throw staffError();
 const {supplierId,capability}=action,companyId=user.companyId;
 if(![supplierBalanceAdjustCapability,supplierDeactivateCapability,supplierReactivateCapability].includes(capability))throw staffError();
 const adjust=capability===supplierBalanceAdjustCapability,activate=capability===supplierReactivateCapability;
 const parsed=(adjust?balanceInput:changeStatusInput).safeParse(req.body);
 if(!parsed.success)throw staffError(400,'STAFF_SUPPLIER_ACTION_INVALID','Έλεγξε τα στοιχεία και επιβεβαίωσε την ενέργεια.');
 const body=parsed.data;
 const operationKey='staff-supplier-'+createHash('sha256').update(JSON.stringify([companyId,user.id,supplierId,capability,body.operationId])).digest('hex');
 const payloadHash=createHash('sha256').update(JSON.stringify(body)).digest('hex');
 const event=adjust?'SUPPLIER_BALANCE_ADJUSTED':activate?'SUPPLIER_REACTIVATED':'SUPPLIER_DEACTIVATED';
 return db.$transaction(async tx=>{
  const grant=await requireStaffCompanyGrant(tx,user,capability);
  if(grant.revision!==initial.revision)throw staffError();
  const [supplier]=await tx.$queryRaw`SELECT "id","active","updatedAt" FROM "Supplier" WHERE "id"=${supplierId} AND "companyId"=${companyId} FOR UPDATE`;
  if(!supplier)throw staffError(404,'STAFF_OBJECT_NOT_FOUND','Δεν βρέθηκε ο προμηθευτής στην εταιρεία.');
  const [prior]=await tx.$queryRaw`SELECT "detail" FROM "BackofficeStaffAudit" WHERE "id"=${operationKey} AND "companyId"=${companyId} AND "actorId"=${user.id} AND "event"=${event}`;
  const result={ok:true,companyId,supplierId,...(adjust?{id:operationKey}:{active:activate})};
  if(prior){
   if(prior.detail.payloadHash!==payloadHash)throw staffError(409,'STAFF_SUPPLIER_ACTION_CHANGED','Η προηγούμενη καταχώριση είχε άλλα στοιχεία.');
   if(!adjust&&supplier.active!==activate)throw staffError(409,'STAFF_SUPPLIER_CHANGED','Η κατάσταση της καρτέλας άλλαξε. Ανανέωσε και ξαναδοκίμασε.');
   return result;
  }
  if(!activate&&supplier.active!==true)throw staffError(409,'STAFF_SUPPLIER_INACTIVE','Ο προμηθευτής είναι ήδη ανενεργός.');
  if(activate&&supplier.active!==false)throw staffError(409,'STAFF_SUPPLIER_ALREADY_ACTIVE','Ο προμηθευτής είναι ήδη ενεργός.');
  if(adjust){
   await tx.$executeRaw`INSERT INTO "SupplierBalanceAdjustment" ("id","companyId","supplierId","amount","note","actorId","actorName","occurredAt")
    VALUES (${operationKey},${companyId},${supplierId},${body.amount},${body.note},${user.id},${user.fullName||"Χρήστης"},${body.occurredAt?new Date(body.occurredAt):new Date()})`;
  }else{
   if(new Date(supplier.updatedAt).toISOString()!==body.updatedAt)throw staffError(409,'STAFF_SUPPLIER_CHANGED','Η καρτέλα άλλαξε. Ανανέωσε και ξαναδοκίμασε.');
   await tx.$executeRaw`UPDATE "Supplier" SET "active"=${activate},"updatedAt"=NOW() WHERE "id"=${supplierId} AND "companyId"=${companyId}`;
  }
  const details=JSON.stringify({supplierId,payloadHash,...(adjust?{amount:body.amount,note:body.note}:{reason:body.reason})});
  await tx.$executeRaw`INSERT INTO "BackofficeStaffAudit" ("id","companyId","actorId","targetUserId","event","detail")
   VALUES (${operationKey},${companyId},${user.id},${user.id},${event},${details}::jsonb)`;
  return result;
 });
}
