import {staffCompanyCapabilities,staffCompanyModules,staffCompanyProtocol,staffCompanyRequestCapability,validStaffCompanyCapabilities} from '../../../shared/backoffice-staff-company.mjs';
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
 if(!license.activeModules?.includes(staffCompanyModules[capability]))throw staffError(403,'MODULE_DISABLED');
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
 // Projections match the individually admitted native directory GETs. No
 // bootstrap, master selectors, detail joins or business writes run here.
 if(capability==='stores.read')items=await db.store.findMany({where:{companyId},select:{id:true,name:true,city:true,active:true},orderBy:{name:'asc'},take:10001});
 else if(capability==='suppliers.read')items=await db.$queryRaw`SELECT "id","name","taxId","email","phone","city","active" FROM "Supplier" WHERE "companyId"=${companyId} ORDER BY "name","id" LIMIT 10001`;
 else if(capability==='customers.read')items=await db.$queryRaw`SELECT "id","name","phone","email","discountPercent","creditLimit","balance","active" FROM "Customer" WHERE "companyId"=${companyId} ORDER BY "name","id" LIMIT 10001`;
 else if(capability==='expense-categories.read')items=await db.$queryRaw`SELECT c."id",c."description",c."active",c."createdAt",c."updatedAt",COUNT(t."id") FILTER (WHERE t."type"='OTHER_EXPENSE')::int AS "usageCount" FROM "ManagementExpenseCategory" c LEFT JOIN "StoreTransaction" t ON t."companyId"=${companyId} AND t."expenseCategoryId"=c."id" WHERE c."companyId"=${companyId} GROUP BY c."id" ORDER BY c."active" DESC,c."description",c."id" LIMIT 10001`;
 else if(capability==='customer-categories.read')items=await db.$queryRaw`SELECT c."id",c."description",c."selectable",c."allowCredit",c."saleAtCostOrWholesale",c."deferred",c."active",c."createdAt",c."updatedAt",COUNT(cu."id")::int AS "usageCount" FROM "ManagementCustomerCategory" c LEFT JOIN "Customer" cu ON cu."companyId"=${companyId} AND cu."customerCategoryId"=c."id" WHERE c."companyId"=${companyId} GROUP BY c."id" ORDER BY c."description",c."id" LIMIT 10001`;
 else if(capability==='professions.read')items=await db.$queryRaw`SELECT p."id",p."code",p."description",p."active",p."createdAt",p."updatedAt",COUNT(c."id")::int AS "customerCount" FROM "ManagementCustomerProfession" p LEFT JOIN "Customer" c ON c."companyId"=p."companyId" AND c."customerProfessionId"=p."id" WHERE p."companyId"=${companyId} GROUP BY p."id" ORDER BY CASE WHEN p."code" ~ '^[0-9]+$' THEN LPAD(p."code",20,'0') ELSE p."code" END NULLS LAST,p."description",p."id" LIMIT 10001`;
 else if(capability==='shipping-methods.read')items=await db.$queryRaw`SELECT "id","code","description","active","createdAt","updatedAt" FROM "ManagementShippingMethod" WHERE "companyId"=${companyId} AND "active"=true ORDER BY CASE WHEN "code" ~ '^[0-9]+$' THEN "code"::numeric ELSE NULL END NULLS LAST,"code","id" LIMIT 10001`;
 else throw staffError();
 if(items.length>10000)throw staffError(503,'STAFF_COMPANY_LIMIT','Ο κατάλογος υπερβαίνει το όριο προβολής.');
 const fieldsByCapability={
  'stores.read':['id','name','city','active'],
  'suppliers.read':['id','name','taxId','email','phone','city','active'],
  'customers.read':['id','name','phone','email','discountPercent','creditLimit','balance','active'],
  'expense-categories.read':['id','description','active','createdAt','updatedAt','usageCount'],
  'customer-categories.read':['id','description','selectable','allowCredit','saleAtCostOrWholesale','deferred','active','createdAt','updatedAt','usageCount'],
  'professions.read':['id','code','description','active','createdAt','updatedAt','customerCount'],
  'shipping-methods.read':['id','code','description','active','createdAt','updatedAt']
 };
 const fields=fieldsByCapability[capability],invalid=()=>{throw staffError(503,'STAFF_COMPANY_DATA_INVALID')};
 items=items.map(row=>{
  if(typeof row.id!=='string'||!row.id||typeof row[fields.includes('name')?'name':'description']!=='string'||typeof row.active!=='boolean'||fields.some(key=>!Object.hasOwn(row,key)))invalid();
  const item=Object.fromEntries(fields.map(key=>[key,row[key]]));
  for(const key of ['selectable','allowCredit','saleAtCostOrWholesale','deferred'])if(fields.includes(key)&&typeof item[key]!=='boolean')invalid();
  for(const key of ['usageCount','customerCount'])if(fields.includes(key)){if(typeof item[key]!=='number'&&typeof item[key]!=='string'||item[key]==='')invalid();item[key]=Number(item[key]);if(!Number.isSafeInteger(item[key])||item[key]<0)invalid();}
  for(const key of ['createdAt','updatedAt'])if(fields.includes(key)){if(!(item[key] instanceof Date)&&typeof item[key]!=='string'||item[key]==='')invalid();const date=new Date(item[key]);if(!Number.isFinite(date.getTime()))invalid();item[key]=date.toISOString();}
  if(fields.includes('code')&&typeof item.code!=='string'&&!(capability==='professions.read'&&item.code===null))invalid();
  if(capability==='shipping-methods.read'&&!item.active)invalid();
  return item;
 });
 // Preserve the exact account policy revision: revoke-and-regrant during the
 // read cannot reuse an older response, even when it restores the same key.
 const after=await requireStaffCompanyGrant(db,req.user,capability);
 if(after.revision!==req.staffCompanyGrant.revision)throw staffError();
 return {scope:'COMPANY',companyId,items};
}
