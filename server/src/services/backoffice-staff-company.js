import {PERSONNEL_BASIC,resolvePersonnelPackageStates} from '../personnel-packages.js';
import {staffCompanyCapabilities,staffCompanyModules,staffCompanyProtocol,staffCompanyRequestCapability,validStaffCompanyCapabilities} from '../../../shared/backoffice-staff-company.mjs';
import {readCompanyCommerceData} from './backoffice-staff-company-commerce.js';
import {managementVatExemptions} from '../lib/management-vat-exemptions.js';
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
 if(capability==='workforce-role-registry.read'){
  const rows=await db.$queryRaw`SELECT p."storeId",p."moduleKey",p."active",p."startsAt",p."endsAt" FROM "StorePaidModule" p JOIN "Store" s ON s."id"=p."storeId" AND s."companyId"=p."companyId" WHERE s."companyId"=${user.companyId} AND s."active"=true AND p."moduleKey" IN ('PERSONNEL_BASIC','PERSONNEL_PRO','PERSONNEL_AI','AI_STAFF_SCHEDULER') LIMIT 50001`;
  if(rows.length>50000)throw staffError(503,'STAFF_COMPANY_LIMIT');
  const grouped=new Map();for(const row of rows){if(!grouped.has(row.storeId))grouped.set(row.storeId,[]);grouped.get(row.storeId).push(row)}
  const now=new Date();if(![...grouped.values()].some(rows=>resolvePersonnelPackageStates(rows,now).states[PERSONNEL_BASIC].effectiveActive))throw staffError(403,'MODULE_DISABLED');
 }else if(!license.activeModules?.includes(staffCompanyModules[capability]))throw staffError(403,'MODULE_DISABLED');
 return {capability,companyId:account.companyId,revision:account.revision};
}
function validCompanyQuery(query,capability){
 if(query!==undefined&&(!query||typeof query!=='object'||Array.isArray(query)))return false;
 const names=Reflect.ownKeys(query||{});
 if(names.length===0)return true;
 const key=capability==='categories.read'?'categoryId':capability==='company-products.read'?'q':null;
 if(!key||names.length!==1||names[0]!==key)return false;
 const descriptor=Object.getOwnPropertyDescriptor(query,key);
 return Object.hasOwn(descriptor,'value')&&typeof descriptor.value==='string'&&(key==='q'||descriptor.value.length>0)&&descriptor.value.length<=(key==='q'?120:160)&&descriptor.value.trim()===descriptor.value&&!/[\u0000-\u001f\u007f]/.test(descriptor.value);
}
export async function enforceStaffCompanyRequest(db,req){
 const companyId=req.get('x-backoffice-company-id'),path=String(req.originalUrl||req.path||'').split('?')[0];
 const capability=staffCompanyRequestCapability(req.method,path);
 if(!capability||companyId!==req.user?.companyId||req.get('x-backoffice-store-id')!==undefined||req.user?.storeId||!validCompanyQuery(req.query,capability)||req.headers?.['transfer-encoding']||Number(req.headers?.['content-length']||0)>0||req.body&&Object.keys(req.body).length)throw staffError();
 req.staffCompanyGrant=await requireStaffCompanyGrant(db,req.user,capability);
 return true;
}
export async function readStaffCompanyDirectory(db,req){
 const capability=staffCompanyRequestCapability(req.method,String(req.originalUrl||req.path||'').split('?')[0]);
 if(!capability||req.user?.staffAccess!==true||req.staffCompanyGrant?.capability!==capability||req.staffCompanyGrant.companyId!==req.user.companyId)throw staffError();
 await enforceStaffCompanyRequest(db,req);
 const companyId=req.user.companyId;
 if(capability==='workforce-role-registry.read'){
  const raw=await db.$queryRaw`SELECT r."id",r."companyId",r."name",r."code",r."description",r."active",r."createdAt",r."updatedAt",(SELECT COUNT(*)::int FROM "WorkforceEmployeeRole" a JOIN "WorkforceEmployee" e ON e."id"=a."employeeId" AND e."companyId"=r."companyId" WHERE a."roleId"=r."id") AS "employeeCount",(SELECT COUNT(*)::int FROM "WorkforceShiftTemplate" t JOIN "Store" s ON s."id"=t."storeId" AND s."companyId"=t."companyId" WHERE t."requiredRoleId"=r."id" AND t."companyId"=r."companyId") AS "shiftTemplateCount" FROM "WorkforceRole" r WHERE r."companyId"=${companyId} ORDER BY r."active" DESC,r."name",r."id" LIMIT 10001`;
  const items=boundedRows(raw).map(row=>{const v=namedActive(fields(row,['id','companyId','name','code','description','active','employeeCount','shiftTemplateCount','createdAt','updatedAt']));if(v.companyId!==companyId)structureInvalid();textField(v.code);textField(v.description,true);finiteField(v.employeeCount,{integer:true});finiteField(v.shiftTemplateCount,{integer:true});for(const key of ['createdAt','updatedAt']){const d=new Date(v[key]);if(v[key]==null||!Number.isFinite(d.getTime()))structureInvalid();v[key]=d.toISOString()}return v});
  const after=await requireStaffCompanyGrant(db,req.user,capability);if(after.revision!==req.staffCompanyGrant.revision)throw staffError();
  return {scope:'COMPANY',companyId,items,count:items.length};
 }

 if(['company-products.read','purchases.read','recipes.read','supplier-details.read'].includes(capability)){
  const payload=await readCompanyCommerceData(db,{companyId,capability,path:String(req.originalUrl||req.path||'').split('?')[0],query:req.query||{}});
  const after=await requireStaffCompanyGrant(db,req.user,capability);
  if(after.revision!==req.staffCompanyGrant.revision)throw staffError();
  return {scope:'COMPANY',companyId,...payload};
 }
 if(['categories.read','vat-departments.read','product-companies.read'].includes(capability)){
  const payload=await readCompanyStructures(db,companyId,capability,req.query?.categoryId);
  const after=await requireStaffCompanyGrant(db,req.user,capability);
  if(after.revision!==req.staffCompanyGrant.revision)throw staffError();
  return {scope:'COMPANY',companyId,...payload};
 }
 let items;
 // Projections match the individually admitted native directory GETs. No
 // bootstrap, master selectors, detail joins or business writes run here.
 if(capability==='stores.read')items=await db.store.findMany({where:{companyId},select:{id:true,name:true,city:true,active:true},orderBy:{name:'asc'},take:10001});
 else if(capability==='suppliers.read')items=await db.$queryRaw`SELECT "id","name","taxId","email","phone","city","active" FROM "Supplier" WHERE "companyId"=${companyId} ORDER BY "name","id" LIMIT 10001`;
 else if(capability==='customers.read')items=await db.$queryRaw`SELECT "id","name","phone","email","discountPercent","creditLimit","balance","active" FROM "Customer" WHERE "companyId"=${companyId} ORDER BY "name","id" LIMIT 10001`;
 else if(capability==='expense-categories.read')items=await db.$queryRaw`SELECT c."id",c."description",c."active",c."createdAt",c."updatedAt",COUNT(t."id") FILTER (WHERE t."type"='OTHER_EXPENSE')::int AS "usageCount" FROM "ManagementExpenseCategory" c LEFT JOIN "StoreTransaction" t ON t."companyId"=${companyId} AND t."expenseCategoryId"=c."id" WHERE c."companyId"=${companyId} GROUP BY c."id" ORDER BY c."active" DESC,c."description",c."id" LIMIT 10001`;
 else if(capability==='customer-categories.read')items=await db.$queryRaw`SELECT c."id",c."description",c."selectable",c."allowCredit",c."saleAtCostOrWholesale",c."deferred",c."active",c."createdAt",c."updatedAt",COUNT(cu."id")::int AS "usageCount" FROM "ManagementCustomerCategory" c LEFT JOIN "Customer" cu ON cu."companyId"=${companyId} AND cu."customerCategoryId"=c."id" WHERE c."companyId"=${companyId} GROUP BY c."id" ORDER BY c."description",c."id" LIMIT 10001`;
 else if(capability==='professions.read')items=await db.$queryRaw`SELECT p."id",p."code",p."description",p."active",p."createdAt",p."updatedAt",COUNT(c."id")::int AS "customerCount" FROM "ManagementCustomerProfession" p LEFT JOIN "Customer" c ON c."companyId"=p."companyId" AND c."customerProfessionId"=p."id" WHERE p."companyId"=${companyId} GROUP BY p."id" ORDER BY CASE WHEN p."code" ~ '^[0-9]+$' THEN LPAD(p."code",20,'0') ELSE p."code" END NULLS LAST,p."description",p."id" LIMIT 10001`;
 else if(capability==='shipping-methods.read')items=await db.$queryRaw`SELECT "id","code","description","active","createdAt","updatedAt" FROM "ManagementShippingMethod" WHERE "companyId"=${companyId} AND "active"=true ORDER BY CASE WHEN "code" ~ '^[0-9]+$' THEN "code"::numeric ELSE NULL END NULLS LAST,"code","id" LIMIT 10001`;
 else if(capability==='banks.read')items=await db.$queryRaw`SELECT "id","internalCode","name","accountingAccount","auxiliaryName","active","createdAt","updatedAt" FROM "ManagementBank" WHERE "companyId"=${companyId} AND "active"=true ORDER BY "name","internalCode","id" LIMIT 10001`;
 else throw staffError();
 if(items.length>10000)throw staffError(503,'STAFF_COMPANY_LIMIT','Ο κατάλογος υπερβαίνει το όριο προβολής.');
 const fieldsByCapability={
  'banks.read':['id','internalCode','name','accountingAccount','auxiliaryName','active','createdAt','updatedAt'],
  'stores.read':['id','name','city','active'],
  'suppliers.read':['id','name','taxId','email','phone','city','active'],
  'customers.read':['id','name','phone','email','discountPercent','creditLimit','balance','active'],
  'expense-categories.read':['id','description','active','createdAt','updatedAt','usageCount'],
  'customer-categories.read':['id','description','selectable','allowCredit','saleAtCostOrWholesale','deferred','active','createdAt','updatedAt','usageCount'],
  'professions.read':['id','code','description','active','createdAt','updatedAt','customerCount'],
  'shipping-methods.read':['id','code','description','active','createdAt','updatedAt']
 };
 const allowedFields=fieldsByCapability[capability],invalid=()=>{throw staffError(503,'STAFF_COMPANY_DATA_INVALID')};
 items=items.map(row=>{
  if(typeof row.id!=='string'||!row.id||typeof row[allowedFields.includes('name')?'name':'description']!=='string'||typeof row.active!=='boolean'||allowedFields.some(key=>!Object.hasOwn(row,key)))invalid();
  const item=Object.fromEntries(allowedFields.map(key=>[key,row[key]]));
  for(const key of ['selectable','allowCredit','saleAtCostOrWholesale','deferred'])if(allowedFields.includes(key)&&typeof item[key]!=='boolean')invalid();
  for(const key of ['usageCount','customerCount'])if(allowedFields.includes(key)){if(typeof item[key]!=='number'&&typeof item[key]!=='string'||item[key]==='')invalid();item[key]=Number(item[key]);if(!Number.isSafeInteger(item[key])||item[key]<0)invalid();}
  for(const key of ['createdAt','updatedAt'])if(allowedFields.includes(key)){if(!(item[key] instanceof Date)&&typeof item[key]!=='string'||item[key]==='')invalid();const date=new Date(item[key]);if(!Number.isFinite(date.getTime()))invalid();item[key]=date.toISOString();}
  if(allowedFields.includes('code')&&typeof item.code!=='string'&&!(capability==='professions.read'&&item.code===null))invalid();
  if(['shipping-methods.read','banks.read'].includes(capability)&&!item.active)invalid();
  if(capability==='banks.read'&&(typeof item.internalCode!=='string'||!item.internalCode||['accountingAccount','auxiliaryName'].some(key=>item[key]!==null&&typeof item[key]!=='string')))invalid();
  return item;
 });
 // Preserve the exact account policy revision: revoke-and-regrant during the
 // read cannot reuse an older response, even when it restores the same key.
 const after=await requireStaffCompanyGrant(db,req.user,capability);
 if(after.revision!==req.staffCompanyGrant.revision)throw staffError();
 return {scope:'COMPANY',companyId,items};
}

const structureInvalid=()=>{throw staffError(503,'STAFF_COMPANY_DATA_INVALID')};
function boundedRows(rows){if(!Array.isArray(rows))structureInvalid();if(rows.length>10000)throw staffError(503,'STAFF_COMPANY_LIMIT');return rows}
function fields(row,names){if(!row||names.some(key=>!Object.hasOwn(row,key)))structureInvalid();return Object.fromEntries(names.map(key=>[key,row[key]]))}
function textField(value,nullable=false){if(nullable&&value===null)return value;if(typeof value!=='string')structureInvalid();return value}
function finiteField(value,{integer=false,min=0,max=Number.MAX_SAFE_INTEGER,nullable=false}={}){if(nullable&&value===null)return value;if(typeof value!=='number'||!Number.isFinite(value)||value<min||value>max||integer&&!Number.isSafeInteger(value))structureInvalid();return value}
function namedActive(row){if(typeof row.id!=='string'||!row.id||typeof row.name!=='string'||typeof row.active!=='boolean')structureInvalid();return row}
// Called only after exact company admission above. This local helper never
// invokes the native seed/mapping/bootstrap helpers or product drilldowns.
async function readCompanyStructures(db,companyId,capability,categoryId){
 if(capability==='categories.read'){
  const raw=await db.$queryRaw`SELECT c."id",c."legacyCode",c."name",c."active",COUNT(DISTINCT sc."id") FILTER (WHERE sc."active"=true)::int AS "subcategoryCount",COUNT(DISTINCT p."id")::int AS "productCount" FROM "ProductCategory" c LEFT JOIN "ProductSubcategory" sc ON sc."categoryId"=c."id" AND sc."companyId"=${companyId} LEFT JOIN "Product" p ON p."categoryId"=c."id" AND p."companyId"=${companyId} WHERE c."companyId"=${companyId} GROUP BY c."id" ORDER BY c."name",c."id" LIMIT 10001`;
  const categories=boundedRows(raw).map(row=>{
   const value=namedActive(fields(row,['id','legacyCode','name','active','subcategoryCount','productCount']));
   textField(value.legacyCode,true);finiteField(value.subcategoryCount,{integer:true});finiteField(value.productCount,{integer:true});return value;
  });
  if(categoryId!==undefined&&!categories.some(row=>row.id===categoryId))throw staffError(404,'STAFF_COMPANY_CATEGORY_NOT_FOUND','Δεν βρέθηκε η κατηγορία στην εταιρεία.');
  const selectedCategoryId=categoryId??categories.find(row=>row.active)?.id??categories[0]?.id??null;
  const totalProducts=categories.reduce((sum,row)=>sum+row.productCount,0);finiteField(totalProducts,{integer:true});
  for(const row of categories)row.percent=totalProducts?row.productCount*100/totalProducts:0;
  const selected=selectedCategoryId===null?[]:await db.$queryRaw`SELECT sc."id",sc."categoryId",sc."legacyCode",sc."name",sc."property",sc."points"::double precision AS "points",sc."pluGroup",sc."classification",sc."eshopCode",sc."active",COUNT(DISTINCT p."id")::int AS "productCount" FROM "ProductSubcategory" sc JOIN "ProductCategory" parent ON parent."id"=sc."categoryId" AND parent."companyId"=sc."companyId" LEFT JOIN "Product" p ON p."subcategoryId"=sc."id" AND p."companyId"=${companyId} WHERE sc."companyId"=${companyId} AND sc."categoryId"=${selectedCategoryId} GROUP BY sc."id" ORDER BY sc."name",sc."id" LIMIT 10001`;
  const subcategories=boundedRows(selected).map(row=>{
   const value=namedActive(fields(row,['id','categoryId','legacyCode','name','property','points','pluGroup','classification','eshopCode','active','productCount']));
   if(value.categoryId!==selectedCategoryId||!['STOCK_ITEM','NON_STOCK'].includes(value.property)||!['MERCHANDISE','SERVICE','PRODUCT','FIXED_ASSET'].includes(value.classification))structureInvalid();
   textField(value.legacyCode,true);textField(value.eshopCode,true);finiteField(value.points);finiteField(value.pluGroup,{integer:true});finiteField(value.productCount,{integer:true});return value;
  });
  return {categories,subcategories,totalProducts,selectedCategoryId};
 }
 if(capability==='vat-departments.read'){
  const raw=await db.$queryRaw`SELECT vd."id",vd."legacyVatCode",vd."cashRegisterDepartment",vd."description",vd."vatRate"::double precision AS "vatRate",vd."commerce",vd."exemptionCode",vd."exemptionDescription",vd."active",COUNT(p."id")::int AS "productCount" FROM "ManagementVatDepartment" vd LEFT JOIN "Product" p ON p."vatDepartmentId"=vd."id" AND p."companyId"=${companyId} WHERE vd."companyId"=${companyId} GROUP BY vd."id" ORDER BY vd."cashRegisterDepartment" NULLS LAST,vd."vatRate",vd."description",vd."id" LIMIT 10001`;
  const items=boundedRows(raw).map(row=>{
   const value=fields(row,['id','legacyVatCode','cashRegisterDepartment','description','vatRate','commerce','exemptionCode','exemptionDescription','active','productCount']);
   if(typeof value.id!=='string'||!value.id||typeof value.description!=='string'||typeof value.commerce!=='boolean'||typeof value.active!=='boolean')structureInvalid();
   for(const key of ['legacyVatCode','exemptionCode','exemptionDescription'])textField(value[key],true);
   finiteField(value.cashRegisterDepartment,{integer:true,max:9999,nullable:true});finiteField(value.vatRate,{max:100});finiteField(value.productCount,{integer:true});return value;
  });
  return {items,exemptions:managementVatExemptions.map(({code,description})=>({code,description}))};
 }
 if(capability==='product-companies.read'){
  const raw=await db.$queryRaw`SELECT c."id",c."name",c."active",c."systemKey",COUNT(p."id")::int AS "productCount" FROM "ManagementProductCompany" c LEFT JOIN "Product" p ON p."companyId"=${companyId} AND p."productCompanyId"=c."id" WHERE c."companyId"=${companyId} GROUP BY c."id" ORDER BY CASE WHEN c."systemKey"='UNASSIGNED' THEN 0 ELSE 1 END,c."name",c."id" LIMIT 10001`;
  const totals=await db.$queryRaw`SELECT COUNT(*)::int AS count FROM "Product" WHERE "companyId"=${companyId}`;
  if(totals.length!==1)structureInvalid();const totalProducts=finiteField(totals[0].count,{integer:true});
  const items=boundedRows(raw).map(row=>{
   const value=namedActive(fields(row,['id','name','active','systemKey','productCount']));
   textField(value.systemKey,true);finiteField(value.productCount,{integer:true});if(value.productCount>totalProducts)structureInvalid();
   return {...value,percent:totalProducts?value.productCount*100/totalProducts:0};
  });
  return {items,totalProducts};
 }
 throw staffError();
}
