// Delegated status only; never creates personal enrollment/capture authority.
import {requireStaffGrant,staffError} from './backoffice-staff-access.js';
import {validateMonthlyInventoryCaptureSchema,monthlyInventoryCaptureLifecycleManifestProposal} from './monthly-inventory-capture-schema.js';
import {createHash} from 'node:crypto';
import {monthlyInventorySnapshotPeriod} from './monthly-inventory-snapshot-period.js';
const planHash=createHash('sha256').update(JSON.stringify(monthlyInventoryCaptureLifecycleManifestProposal())).digest('hex');
const unavailable=()=>{throw Object.assign(Error('Monthly status unavailable.'),{status:503})};
async function readFence(db,companyId,storeId){
 const fences=await db.$queryRaw`SELECT "planHash","maintenance","retired","operationId","generation"::text AS generation FROM "StoreLifecycleFence" WHERE "companyId"=${companyId} AND "storeId"=${storeId} LIMIT 2`;
 if(fences.length!==1||fences[0].planHash!==planHash||fences[0].maintenance!==false||fences[0].retired!==false||fences[0].operationId!==null||typeof fences[0].generation!=='string'||!/^(0|[1-9][0-9]*)$/.test(fences[0].generation))unavailable();
 return fences[0].generation;
}
const date=value=>{if(value===null)return null;const parsed=new Date(value);if(!Number.isFinite(parsed.getTime()))unavailable();return parsed.toISOString()};
export async function readMonthlyInventoryCaptureStatus(db,req){
 const companyId=req.user?.companyId,storeId=req.user?.storeId;
 if(req.user?.staffAccess!==true||req.staffGrant?.capability!=='monthly-inventory.read'||req.method!=='GET'||!companyId||!storeId||req.query?.storeId!==storeId||Object.keys(req.query||{}).some(key=>key!=='storeId')||req.headers?.['transfer-encoding']||Number(req.headers?.['content-length']||0)>0||req.body&&Object.keys(req.body).length)throw staffError();
 await requireStaffGrant(db,req.user,storeId,'monthly-inventory.read');
 const schema=await validateMonthlyInventoryCaptureSchema(db);
 if(schema?.available!==true||schema.lifecycleGuardsInstalled!==true)unavailable();
 const generation=await readFence(db,companyId,storeId);
 const rows=await db.$queryRaw`SELECT g."active",g."firstIssueMonth",g."firstScheduledFor",g."grantedAt",g."revokedAt" FROM "MonthlyInventoryCaptureGrant" g JOIN "Store" s ON s."id"=g."storeId" AND s."companyId"=g."companyId" JOIN "StoreLifecycleFence" f ON f."storeId"=g."storeId" AND f."companyId"=g."companyId" AND f."generation"=g."lifecycleGeneration" WHERE g."companyId"=${companyId} AND g."storeId"=${storeId} AND g."purpose"='MONTHLY_INVENTORY_CAPTURE' AND s."active"=true LIMIT 2`;
 if(rows.length>1)unavailable();
 const row=rows[0];let grant=null;
 if(row){
  if(typeof row.active!=='boolean'||row.firstIssueMonth!==null&&(typeof row.firstIssueMonth!=='string'||!/^20\d{2}-(0[1-9]|1[0-2])$/.test(row.firstIssueMonth)))unavailable();
  grant={active:row.active,firstIssueMonth:row.firstIssueMonth,firstScheduledFor:date(row.firstScheduledFor),grantedAt:date(row.grantedAt),revokedAt:date(row.revokedAt)};
  const initial=grant.firstIssueMonth===null&&grant.firstScheduledFor===null&&grant.grantedAt===null;
  const activated=grant.firstIssueMonth!==null&&grant.firstScheduledFor!==null&&grant.grantedAt!==null;
  if(!initial&&!activated||grant.active&&(!activated||grant.revokedAt!==null)||activated&&(monthlyInventorySnapshotPeriod(grant.firstIssueMonth).scheduledFor!==grant.firstScheduledFor||grant.firstScheduledFor<grant.grantedAt)||grant.revokedAt!==null&&grant.grantedAt!==null&&grant.revokedAt<grant.grantedAt)unavailable();
 }
 if(await readFence(db,companyId,storeId)!==generation)unavailable();
 await requireStaffGrant(db,req.user,storeId,'monthly-inventory.read');
 return {companyId,storeId,readOnly:true,status:'STATE',grant};
}
