import {storeReportRequestCapability,companyReportKindForStoreCapability} from '../../../shared/backoffice-staff-reports.mjs';
import {requireStaffGrant,staffError} from './backoffice-staff-access.js';
import {companyReportFilters,readCompanyReports} from './backoffice-staff-company-reports.js';
export async function readStaffStoreReport(db,req){
 const path=String(req.originalUrl||req.path||'').split('?')[0],capability=storeReportRequestCapability(req.method,path),kind=companyReportKindForStoreCapability(capability),user=req.user,storeId=user?.storeId;
 if(!kind||user?.staffAccess!==true||!storeId||req.staffGrant?.capability!==capability||req.get('x-backoffice-store-id')!==storeId||req.get('x-backoffice-company-id')!==undefined||req.headers?.['transfer-encoding']||Number(req.headers?.['content-length']||0)>0||req.body&&Object.keys(req.body).length)throw staffError();
 if(req.query?.storeId!==storeId)throw staffError();
 const options={storeScope:storeId};companyReportFilters(req.query,kind,path,options);
 const before=await requireStaffGrant(db,user,storeId,capability);
 const data=await readCompanyReports(db,user.companyId,kind,path,req.query,user,options);
 const after=await requireStaffGrant(db,user,storeId,capability);
 if(before.account.revision!==after.account.revision||before.grant.revision!==after.grant.revision)throw staffError();
 return {...data,scope:'STORE',companyId:user.companyId,storeId};
}
