import {randomUUID} from 'node:crypto';
import {z} from 'zod';
import {staffSupplierContactId,supplierContactCapability} from '../../../shared/backoffice-staff-company.mjs';
import {staffError} from './backoffice-staff-access.js';
import {requireStaffCompanyGrant} from './backoffice-staff-company.js';

const contactBody=z.object({
 name:z.string().trim().min(1).max(180),
 phone:z.string().trim().max(40).nullable(),
 mobile:z.string().trim().max(40).nullable(),
 email:z.string().trim().max(254).email().nullable(),
 updatedAt:z.string().datetime()
}).strict();

export async function updateStaffSupplierContact(db,req){
 const supplierId=staffSupplierContactId(req.method,String(req.originalUrl||req.path||'').split('?')[0]);
 const {user,staffCompanyGrant:initial}=req;
 if(!supplierId||req.params.partyId!==supplierId||user?.staffAccess!==true||initial?.capability!==supplierContactCapability||initial.companyId!==user.companyId||req.get('x-backoffice-company-id')!==user.companyId||req.get('x-backoffice-store-id')!==undefined)throw staffError();
 const parsed=contactBody.safeParse(req.body);
 if(!parsed.success)throw staffError(400,'STAFF_SUPPLIER_CONTACT_INVALID','Έλεγξε τα στοιχεία επικοινωνίας του προμηθευτή.');
 const {name,phone,mobile,email,updatedAt}=parsed.data,companyId=user.companyId;
 return db.$transaction(async tx=>{
  const grant=await requireStaffCompanyGrant(tx,user,supplierContactCapability);
  if(grant.revision!==initial.revision)throw staffError();
  const [supplier]=await tx.$queryRaw`SELECT "id","name","phone","mobile","email","updatedAt" FROM "Supplier" WHERE "id"=${supplierId} AND "companyId"=${companyId} AND "active"=true FOR UPDATE`;
  if(!supplier)throw staffError(404,'STAFF_OBJECT_NOT_FOUND','Δεν βρέθηκε ενεργός προμηθευτής στην εταιρεία.');
  const unchanged=supplier.name===name&&supplier.phone===phone&&supplier.mobile===mobile&&supplier.email===email;
  if(unchanged)return {ok:true,companyId,supplierId};
  if(new Date(supplier.updatedAt).toISOString()!==updatedAt)throw staffError(409,'STAFF_SUPPLIER_CONTACT_CHANGED','Η καρτέλα άλλαξε. Ανανέωσε και ξαναδοκίμασε.');
  await tx.$executeRaw`UPDATE "Supplier" SET "name"=${name},"phone"=${phone},"mobile"=${mobile},"email"=${email},"updatedAt"=NOW() WHERE "id"=${supplierId} AND "companyId"=${companyId}`;
  const changed=['name','phone','mobile','email'].filter(key=>supplier[key]!==parsed.data[key]);
  await tx.$executeRaw`INSERT INTO "BackofficeStaffAudit" ("id","companyId","actorId","targetUserId","event","detail") VALUES (${randomUUID()},${companyId},${user.id},${user.id},'SUPPLIER_CONTACT_UPDATED',${JSON.stringify({supplierId,changed})}::jsonb)`;
  return {ok:true,companyId,supplierId};
 });
}
