import {createHash,randomUUID} from 'node:crypto';
import {z} from 'zod';
import {staffSupplierManagementRoute,supplierManualCreateCapability} from '../../../shared/backoffice-staff-company.mjs';
import {requireStaffCompanyGrant} from './backoffice-staff-company.js';
import {staffError} from './backoffice-staff-access.js';

const capability=supplierManualCreateCapability;
const optional=max=>z.string().trim().max(max).optional().nullable();
const createBody=z.object({
 requestId:z.string().uuid(),name:z.string().trim().min(1).max(180),taxId:optional(30),
 email:z.string().trim().max(254).email().optional().nullable(),phone:optional(40),address:optional(250),city:optional(120)
}).strict();
const hash=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
const duplicate=()=>staffError(409,'STAFF_SUPPLIER_TAX_ID_EXISTS','Υπάρχει ήδη καρτέλα με αυτό το ΑΦΜ στην εταιρεία.');

export async function createStaffSupplierManually(db,req){
 const route=staffSupplierManagementRoute(req.method,String(req.originalUrl||req.path||''));
 const {user,staffCompanyGrant:initial}=req;
 if(route?.capability!==capability||user?.staffAccess!==true||initial?.capability!==capability||
    initial.companyId!==user.companyId||req.get('x-backoffice-company-id')!==user.companyId||req.get('x-backoffice-store-id')!==undefined)throw staffError();
 const parsed=createBody.safeParse(req.body);
 if(!parsed.success)throw staffError(400,'STAFF_SUPPLIER_INVALID','Έλεγξε τα στοιχεία του νέου προμηθευτή.');
 const {requestId,name,email,phone,address,city}=parsed.data,companyId=user.companyId;
 const suppliedTaxId=parsed.data.taxId?.toUpperCase()||null;
 const greekTaxId=/^(?:EL|GR)?[0-9 -]+$/.test(suppliedTaxId||'')?suppliedTaxId.replace(/\D/g,''):null;
 const taxId=greekTaxId?.length===9?greekTaxId:suppliedTaxId;
 const values=[name,taxId,email||null,phone||null,address||null,city||null];
 const operationKey='staff-supplier-manual:'+hash([companyId,user.id,requestId]);
 const bodyHash=hash(values);
 return db.$transaction(async tx=>{
  const live=await requireStaffCompanyGrant(tx,user,capability);
  if(live.revision!==initial.revision)throw staffError();
  await tx.$queryRaw`SELECT (pg_advisory_xact_lock(hashtext(${operationKey})) IS NULL) AS "locked"`;
  const [prior]=await tx.$queryRaw`SELECT "detail" FROM "BackofficeStaffAudit" WHERE "id"=${operationKey} AND "companyId"=${companyId} AND "actorId"=${user.id} AND "event"='SUPPLIER_MANUALLY_CREATED' LIMIT 1`;
  if(prior){
   if(prior.detail.bodyHash!==bodyHash)throw staffError(409,'STAFF_SUPPLIER_REQUEST_CHANGED','Το προηγούμενο αίτημα είχε διαφορετικά στοιχεία.');
   return {ok:true,companyId,supplierId:prior.detail.supplierId,replay:true};
  }
  if(taxId){
   if(greekTaxId?.length===9)await tx.$queryRaw`SELECT (pg_advisory_xact_lock(hashtext(${'invoice-issuer-supplier:'+companyId+':'+taxId})) IS NULL) AS "locked"`;
   const [same]=await tx.$queryRaw`
    SELECT "id" FROM "Supplier" WHERE "companyId"=${companyId}
     AND (UPPER(TRIM("taxId"))=${taxId}
      OR (${greekTaxId?.length===9} AND regexp_replace(COALESCE("taxId",''),'[^0-9]','','g')=${taxId}))
    LIMIT 1`;
   if(same)throw duplicate();
  }
  const supplierId=randomUUID();
  const [inserted]=await tx.$queryRaw`
   INSERT INTO "Supplier" ("id","companyId","name","taxId","email","phone","address","city")
   VALUES (${supplierId},${companyId},${values[0]},${values[1]},${values[2]},${values[3]},${values[4]},${values[5]})
   ON CONFLICT ("companyId","taxId") WHERE "taxId" IS NOT NULL DO NOTHING RETURNING "id"`;
  if(!inserted)throw duplicate();
  const detail=JSON.stringify({supplierId,bodyHash,hasTaxId:Boolean(taxId)});
  await tx.$executeRaw`INSERT INTO "BackofficeStaffAudit" ("id","companyId","actorId","targetUserId","event","detail")
   VALUES (${operationKey},${companyId},${user.id},${user.id},'SUPPLIER_MANUALLY_CREATED',${detail}::jsonb)`;
  return {ok:true,companyId,supplierId,replay:false};
 });
}
