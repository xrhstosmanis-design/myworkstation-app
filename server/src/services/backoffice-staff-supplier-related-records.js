import {randomUUID} from 'node:crypto';
import {staffSupplierManagementRoute} from '../../../shared/backoffice-staff-company.mjs';
import {staffError} from './backoffice-staff-access.js';
import {requireStaffCompanyGrant} from './backoffice-staff-company.js';
import {createSupplierRelatedRecord,lockSupplierRelatedRecords,parseSupplierRelatedRecord,removeSupplierRelatedRecord} from './supplier-related-records.js';

export async function mutateStaffSupplierRelatedRecord(db,req){
 const route=staffSupplierManagementRoute(req.method,String(req.originalUrl||req.path||''));
 const {user,staffCompanyGrant:initial}=req;
 if(!route?.resource||req.params.partyId!==route.supplierId||req.params.itemId!==route.itemId||user?.staffAccess!==true||initial?.capability!==route.capability||initial.companyId!==user.companyId||req.get('x-backoffice-company-id')!==user.companyId||req.get('x-backoffice-store-id')!==undefined)throw staffError();
 let body;
 if(!route.itemId){
  try{body=parseSupplierRelatedRecord(route.resource,req.body,{strict:true})}
  catch(error){if(error?.name!=='ZodError')throw error;throw staffError(400,'STAFF_SUPPLIER_RECORD_INVALID','Έλεγξε τα στοιχεία του προμηθευτή.')}
 }else if(req.body&&Object.keys(req.body).length)throw staffError();
 const companyId=user.companyId,scope={...route,companyId};
 return db.$transaction(async tx=>{
  const grant=await requireStaffCompanyGrant(tx,user,route.capability);
  if(grant.revision!==initial.revision)throw staffError();
  await lockSupplierRelatedRecords(tx,companyId,route.supplierId,{activeOnly:true});
  const id=route.itemId??await createSupplierRelatedRecord(tx,scope,body);
  if(route.itemId&&await removeSupplierRelatedRecord(tx,scope)!==1)throw staffError(404,'STAFF_OBJECT_NOT_FOUND','Δεν βρέθηκε η εγγραφή του επιλεγμένου προμηθευτή.');
  const event=route.itemId?'SUPPLIER_RELATED_RECORD_REMOVED':'SUPPLIER_RELATED_RECORD_CREATED';
  const detail={supplierId:route.supplierId,resource:route.resource,itemId:id};
  await tx.$executeRaw`INSERT INTO "BackofficeStaffAudit" ("id","companyId","actorId","targetUserId","event","detail") VALUES (${randomUUID()},${companyId},${user.id},${user.id},${event},${JSON.stringify(detail)}::jsonb)`;
  return {ok:true,companyId,...detail};
 });
}
