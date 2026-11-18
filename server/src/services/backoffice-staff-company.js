import {staffCompanyCapabilities,staffCompanyProtocol,staffCompanyRequestCapability,validStaffCompanyCapabilities} from '../../../shared/backoffice-staff-company.mjs';
import {liveStaff,staffError} from './backoffice-staff-access.js';
import {companyModuleState} from '../middleware/module-access.js';
import {isBackofficeCompanyInstalled} from './backoffice-company-profile.js';
export const companyAuthorityDescription=()=>({protocol:staffCompanyProtocol,capabilities:[...staffCompanyCapabilities]});
export async function readStaffCompanyPolicy(db,userId,companyId){
 const rows=await db.$queryRaw`SELECT "companyCapabilities" FROM "BackofficeStaffAccount" WHERE "userId"=${userId} AND "companyId"=${companyId} AND "active"=true FOR SHARE`;
 if(rows.length!==1||!validStaffCompanyCapabilities(rows[0].companyCapabilities))throw staffError();
 return [...rows[0].companyCapabilities];
}
export async function requireStaffCompanyGrant(db,user,capability){
 const account=await liveStaff(db,user);
 if(account.mustChangePassword||!staffCompanyCapabilities.includes(capability)||user.storeId||user.platformRole==='SUPER_ADMIN')throw staffError();
 if(!await isBackofficeCompanyInstalled(db))throw staffError(503,'STAFF_COMPANY_UNAVAILABLE','Οι εταιρικές παραχωρήσεις δεν έχουν εγκατασταθεί στην ενεργή έκδοση.');
 const capabilities=await readStaffCompanyPolicy(db,user.id,user.companyId);
 if(!capabilities.includes(capability))throw staffError();
 const license=await companyModuleState(user.companyId,{db});
 if(!license?.licenseAllowed)throw staffError(403,'LICENSE_INACTIVE');
 if(!license.activeModules?.includes(capability==='customers.read'?'POS':'INVENTORY'))throw staffError(403,'MODULE_DISABLED');
 return {capability,companyId:account.companyId,revision:account.revision};
}
export async function enforceStaffCompanyRequest(db,req){
 const companyId=req.get('x-backoffice-company-id'),path=String(req.originalUrl||req.path||'').split('?')[0];
 const capability=staffCompanyRequestCapability(req.method,path);
 if(!capability||companyId!==req.user?.companyId||req.get('x-backoffice-store-id')!==undefined||req.user?.storeId||Object.keys(req.query||{}).length||req.headers?.['transfer-encoding']||Number(req.headers?.['content-length']||0)>0||req.body&&Object.keys(req.body).length)throw staffError();
 req.staffCompanyGrant=await requireStaffCompanyGrant(db,req.user,capability);
 return true;
}
export async function readStaffCompanyDirectory(db,req){
 const capability=staffCompanyRequestCapability(req.method,String(req.originalUrl||req.path||'').split('?')[0]);
 if(!capability||req.user?.staffAccess!==true||req.staffCompanyGrant?.capability!==capability||req.staffCompanyGrant.companyId!==req.user.companyId)throw staffError();
 await enforceStaffCompanyRequest(db,req);
 const companyId=req.user.companyId;let items;
 // The projections match the three canonical native directory GETs. No
 // bootstrap, master selectors, detail joins or business writes run here.
 if(capability==='stores.read')items=await db.store.findMany({where:{companyId},select:{id:true,name:true,city:true,active:true},orderBy:{name:'asc'},take:10001});
 else if(capability==='suppliers.read')items=await db.$queryRaw`SELECT "id","name","taxId","email","phone","city","active" FROM "Supplier" WHERE "companyId"=${companyId} ORDER BY "name","id" LIMIT 10001`;
 else items=await db.$queryRaw`SELECT "id","name","phone","email","discountPercent","creditLimit","balance","active" FROM "Customer" WHERE "companyId"=${companyId} ORDER BY "name","id" LIMIT 10001`;
 if(items.length>10000)throw staffError(503,'STAFF_COMPANY_LIMIT','Ο κατάλογος υπερβαίνει το όριο προβολής.');
 const fields=capability==='stores.read'?['id','name','city','active']:capability==='suppliers.read'?['id','name','taxId','email','phone','city','active']:['id','name','phone','email','discountPercent','creditLimit','balance','active'];
 items=items.map(row=>{
  if(typeof row.id!=='string'||!row.id||typeof row.name!=='string'||typeof row.active!=='boolean'||fields.some(key=>!Object.hasOwn(row,key)))throw staffError(503,'STAFF_COMPANY_DATA_INVALID');
  return Object.fromEntries(fields.map(key=>[key,row[key]]));
 });
 // Preserve the exact account policy revision: revoke-and-regrant during the
 // read cannot reuse an older response, even when it restores the same key.
 const after=await requireStaffCompanyGrant(db,req.user,capability);
 if(after.revision!==req.staffCompanyGrant.revision)throw staffError();
 return {scope:'COMPANY',companyId,items};
}
