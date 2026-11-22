import {randomUUID} from 'node:crypto';
import {z} from 'zod';
import {staffSupplierManagementRoute,supplierFiscalCapability} from '../../../shared/backoffice-staff-company.mjs';
import {staffError} from './backoffice-staff-access.js';
import {requireStaffCompanyGrant} from './backoffice-staff-company.js';

const text=max=>z.string().trim().max(max).nullable();
const fiscalSchema=z.object({
 taxOffice:text(120),accountingCode:text(80),legacyCode:text(40),erpCode:text(80),
 myfEnabled:z.boolean(),supplierCategory:z.enum(['A','B','C']),scope:z.enum(['INTERNAL','EXTERNAL']),
 paymentPreference:z.enum(['CREDIT','CASH']),vatMode:z.enum(['NORMAL','REDUCED','EXEMPT']),
 updatedAt:z.string().datetime()
}).strict();

export async function updateStaffSupplierFiscal(db,req){
 const route=staffSupplierManagementRoute(req.method,String(req.originalUrl||req.path||''));
 const {user,staffCompanyGrant:initial}=req,capability=supplierFiscalCapability;
 if(route?.capability!==capability||req.params.partyId!==route.supplierId||user?.staffAccess!==true||
   initial?.capability!==capability||initial.companyId!==user.companyId||
   req.get('x-backoffice-company-id')!==user.companyId||req.get('x-backoffice-store-id')!==undefined)throw staffError();
 const parsed=fiscalSchema.safeParse(req.body);
 if(!parsed.success)throw staffError(400,'STAFF_SUPPLIER_FISCAL_INVALID','Έλεγξε τις φορολογικές και λογιστικές ρυθμίσεις προμηθευτή.');
 const {updatedAt,...after}=parsed.data,{companyId}=user,{supplierId}=route;
 return db.$transaction(async tx=>{
  const live=await requireStaffCompanyGrant(tx,user,capability);
  if(live.revision!==initial.revision)throw staffError();
  const [supplier]=await tx.$queryRaw`
   SELECT "taxOffice","accountingCode","legacyCode","erpCode","myfEnabled","supplierCategory","scope","paymentPreference","vatMode","updatedAt"
   FROM "Supplier" WHERE "id"=${supplierId} AND "companyId"=${companyId} AND "active"=true FOR UPDATE`;
  if(!supplier)throw staffError(404,'STAFF_OBJECT_NOT_FOUND','Δεν βρέθηκε ενεργός προμηθευτής στην εταιρεία.');
  const fields=Object.keys(after).filter(key=>supplier[key]!==after[key]);
  if(!fields.length)return {ok:true,companyId,supplierId};
  if(new Date(supplier.updatedAt).toISOString()!==updatedAt)throw staffError(409,'STAFF_SUPPLIER_FISCAL_CHANGED','Η καρτέλα άλλαξε. Ανανέωσε και ξαναδοκίμασε.');
  await tx.$executeRaw`
   UPDATE "Supplier" SET "taxOffice"=${after.taxOffice},"accountingCode"=${after.accountingCode},
   "legacyCode"=${after.legacyCode},"erpCode"=${after.erpCode},"myfEnabled"=${after.myfEnabled},
   "supplierCategory"=${after.supplierCategory},"scope"=${after.scope},"paymentPreference"=${after.paymentPreference},
   "vatMode"=${after.vatMode},"updatedAt"=NOW()
   WHERE "id"=${supplierId} AND "companyId"=${companyId}`;
  const changes=Object.fromEntries(fields.map(key=>[key,{before:supplier[key],after:after[key]}]));
  const detail=JSON.stringify({supplierId,changes});
  await tx.$executeRaw`INSERT INTO "BackofficeStaffAudit" ("id","companyId","actorId","targetUserId","event","detail")
   VALUES (${randomUUID()},${companyId},${user.id},${user.id},'SUPPLIER_FISCAL_UPDATED',${detail}::jsonb)`;
  return {ok:true,companyId,supplierId};
 });
}
