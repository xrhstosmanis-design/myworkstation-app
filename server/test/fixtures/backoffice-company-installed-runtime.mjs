import assert from 'node:assert/strict';
import {isBackofficeCompanyInstalled,backofficeCompanyProfile} from '../../src/services/backoffice-company-profile.js';
import {lifecycleWorkerCapabilityMac} from '../../src/services/store-lifecycle-worker-ready.js';
import {LIFECYCLE_ROW_DIGEST_FORMAT} from '../../src/services/store-lifecycle-recovery-stream.js';
import {createStaffAccount,updateStaffAccount} from '../../src/services/backoffice-staff-accounts.js';
import {requireStaffCompanyGrant,enforceStaffCompanyRequest,readStaffCompanyDirectory} from '../../src/services/backoffice-staff-company.js';

export async function verifyInstalledCompanyRuntime({db,profile,revision,secret,planHash}){
 const keys=['MWS_STORE_LIFECYCLE_PROFILE','RENDER_GIT_COMMIT','BACKUP_MONITOR_SECRET'],saved=Object.fromEntries(keys.map(key=>[key,process.env[key]]));
 const env={MWS_STORE_LIFECYCLE_PROFILE:`BACKOFFICE_COMPANY_${profile}_V1`,RENDER_GIT_COMMIT:revision,BACKUP_MONITOR_SECRET:secret};Object.assign(process.env,env);
 const writeHeartbeat=async(changes={},wrongMac=false)=>{const json=JSON.stringify({protocol:'MWS_STORE_RECOVERY_CAPABILITY_V1',manifestHash:planHash,workerRevision:revision,checkedAt:new Date().toISOString(),storagePolicyVerified:true,rowDigestFormat:LIFECYCLE_ROW_DIGEST_FORMAT,...changes});await db.$executeRawUnsafe('UPDATE "StoreLifecycleRuntime" SET "heartbeatJson"=$1,"mac"=$2 WHERE "id"=\'backup-worker\'',json,wrongMac?'0'.repeat(64):lifecycleWorkerCapabilityMac(secret,json))};
 try{
  assert.equal(backofficeCompanyProfile(env).planHash,planHash);
  await writeHeartbeat();assert.equal(await isBackofficeCompanyInstalled(db),true,'actual installed catalogue and paired signed worker must authorize runtime');
  await writeHeartbeat({workerRevision:'b'.repeat(40)});assert.equal(await isBackofficeCompanyInstalled(db),false,'signed worker from other revision is unavailable');
  await writeHeartbeat({manifestHash:'0'.repeat(64)});assert.equal(await isBackofficeCompanyInstalled(db),false,'old/foreign plan is unavailable');
  await writeHeartbeat({},true);assert.equal(await isBackofficeCompanyInstalled(db),false,'invalid MAC is unavailable');
  await writeHeartbeat();assert.equal(await isBackofficeCompanyInstalled(db,{env:{...env,MWS_STORE_LIFECYCLE_PROFILE:'BASE'}}),false,'legacy runtime profile cannot activate new policy');
  await db.$executeRawUnsafe('UPDATE "Company" SET "active"=true,"licenseStatus"=\'ACTIVE\',"subscriptionEndsAt"=NOW()+INTERVAL \'1 year\' WHERE "id"=\'company\'');
  for(const module of ['INVENTORY','POS','CASH_CONTROL'])await db.$executeRawUnsafe('INSERT INTO "CompanyModule"("id","companyId","moduleKey","active","updatedAt") VALUES ($1,\'company\',$2,true,NOW()) ON CONFLICT ("companyId","moduleKey") DO UPDATE SET "active"=true,"updatedAt"=NOW()',`native-company-${module}`,module);
  await db.$executeRawUnsafe('INSERT INTO "User"("id","companyId","email","passwordHash","fullName","role","updatedAt") VALUES (\'company-owner\',\'company\',\'company-owner@native.invalid\',\'NOT-LOGIN\',\'Native Owner\',\'OWNER\',NOW())');
  await db.$executeRawUnsafe('INSERT INTO "UserSession"("id","userId","expiresAt") VALUES (\'company-owner-session\',\'company-owner\',NOW()+INTERVAL \'1 hour\')');
  const owner={id:'company-owner',companyId:'company',role:'OWNER',tokenType:'BACKOFFICE_USER',sessionId:'company-owner-session',sessionVersion:0};
  const capabilities=['stores.read','suppliers.read','customers.read','expense-categories.read','customer-categories.read','professions.read','shipping-methods.read'];
  const created=await createStaffAccount(db,owner,{username:'company.only.native',fullName:'Company Only Native',pin:'987654',grants:[],companyCapabilities:capabilities});
  assert.equal((await db.$queryRawUnsafe('SELECT 1 FROM "BackofficeStaffGrant" WHERE "userId"=$1',created.id)).length,0,'native Owner can create company-only account without any store grant');
  await db.$executeRawUnsafe('INSERT INTO "UserSession"("id","userId","expiresAt") VALUES (\'company-only-session\',$1,NOW()+INTERVAL \'1 hour\')',created.id);
  const user={id:created.id,companyId:'company',role:'EMPLOYEE',tokenType:'BACKOFFICE_USER',staffAccess:true,sessionId:'company-only-session',sessionVersion:0};
  await writeHeartbeat({},true);await assert.rejects(requireStaffCompanyGrant(db,user,'stores.read'),{code:'STAFF_COMPANY_UNAVAILABLE'});await writeHeartbeat();
  for(const table of ['Supplier','Customer'])for(const company of ['company','foreign'])await db.$executeRawUnsafe(`INSERT INTO "${table}"("id","companyId","name") VALUES($1,$2,$3)`,`${table}-${company}`,company,`${table}-${company}`);
  for(const table of ['ManagementExpenseCategory','ManagementCustomerCategory','ManagementCustomerProfession','ManagementShippingMethod'])for(const company of ['company','foreign']){
   const code=company==='company'?'101':'102';
   if(table==='ManagementShippingMethod')await db.$executeRawUnsafe(`INSERT INTO "${table}"("id","companyId","code","description") VALUES($1,$2,$3,$4)`,`${table}-${company}`,company,code,`${table}-${company}`);
   else await db.$executeRawUnsafe(`INSERT INTO "${table}"("id","companyId","description") VALUES($1,$2,$3)`,`${table}-${company}`,company,`${table}-${company}`);
  }
  await db.$executeRawUnsafe(`INSERT INTO "ManagementShippingMethod"("id","companyId","code","description","active") VALUES('shipping-inactive','company','999','Inactive',false)`);
  await db.$executeRawUnsafe(`INSERT INTO "ManagementCustomerProfession"("id","companyId","code","description","active") VALUES('profession-inactive','company','200','Inactive',false)`);
  // Deliberate historical cross-company references must not inflate counts.
  await db.$executeRawUnsafe(`UPDATE "Customer" SET "customerCategoryId"='ManagementCustomerCategory-company',"customerProfessionId"='ManagementCustomerProfession-company' WHERE "id" IN ('Customer-company','Customer-foreign')`);
  await db.$transaction(async tx=>{
   await tx.$queryRawUnsafe(`SELECT set_config('mws.lifecycle_generations',$1,true)`,JSON.stringify({selected:'7',foreign:'0'}));
   for(const[company,store]of[['company','selected'],['foreign','foreign']])await tx.$executeRawUnsafe(`INSERT INTO "StoreTransaction"("id","companyId","storeId","type","amount","actorId","actorName","expenseCategoryId") VALUES($1,$2,$3,'OTHER_EXPENSE',5,'admin','Native','ManagementExpenseCategory-company')`,'category-use-'+company,company,store);
  });
  const noWriteReadDb=new Proxy(db,{get(target,key){if(['$executeRaw','$executeRawUnsafe','$transaction'].includes(key))return()=>assert.fail('company directory read attempted mutation, DDL or a writer transaction');const value=Reflect.get(target,key);return typeof value==='function'?value.bind(target):value}});
  const request=(path,headers={})=>{const h={'x-backoffice-company-id':'company',...headers};return{method:'GET',originalUrl:path,user,query:{},headers:h,get:key=>h[key.toLowerCase()]}};
  const routes=[['stores.read','/api/owner-products/stores'],['suppliers.read','/api/commerce/suppliers'],['customers.read','/api/commerce/customers'],['expense-categories.read','/api/management/expense-categories'],['customer-categories.read','/api/management/customer-categories'],['professions.read','/api/management/professions'],['shipping-methods.read','/api/management/business-units/shipping-methods']];
  for(const [capability,path]of routes){assert.equal((await requireStaffCompanyGrant(noWriteReadDb,user,capability)).revision,1);const req=request(path);await enforceStaffCompanyRequest(noWriteReadDb,req);const result=await readStaffCompanyDirectory(noWriteReadDb,req);assert.equal(result.scope,'COMPANY');assert.equal(result.companyId,'company');assert.ok(result.items.length>0);assert.ok(!result.items.some(row=>row.id==='foreign'||row.id.endsWith('-foreign')));assert.ok(!result.items.some(row=>Object.hasOwn(row,'companyId')||Object.hasOwn(row,'memberCard')));}
  for(const[capability,path]of routes.slice(3)){
   const req=request(path);await enforceStaffCompanyRequest(noWriteReadDb,req);const result=await readStaffCompanyDirectory(noWriteReadDb,req);
   for(const item of result.items){assert.match(item.createdAt,/Z$/);assert.match(item.updatedAt,/Z$/);assert.equal(Object.hasOwn(item,'companyId'),false)}
   if(capability==='expense-categories.read'||capability==='customer-categories.read')assert.equal(result.items[0].usageCount,1,'foreign historical reference is excluded from company counts');
   if(capability==='professions.read'){const own=result.items.find(row=>row.id==='ManagementCustomerProfession-company');assert.equal(own.code,null);assert.equal(own.customerCount,1);assert.ok(result.items.some(row=>row.id==='profession-inactive'))}
   if(capability==='shipping-methods.read'){assert.equal(result.items.some(row=>row.id==='shipping-inactive'),false);assert.ok(result.items.every(row=>row.active))}
  }
  await db.$executeRawUnsafe(`UPDATE "CompanyModule" SET "active"=false WHERE "companyId"='company'`);
  for(const capability of ['customer-categories.read','professions.read','shipping-methods.read'])assert.equal((await requireStaffCompanyGrant(noWriteReadDb,user,capability)).capability,capability,'CORE views require no paid module or StoreGrant');
  await assert.rejects(requireStaffCompanyGrant(noWriteReadDb,user,'expense-categories.read'),{code:'MODULE_DISABLED'});
  await db.$executeRawUnsafe(`UPDATE "CompanyModule" SET "active"=true WHERE "companyId"='company'`);
  await db.$executeRawUnsafe(`UPDATE "Company" SET "licenseStatus"='EXPIRED' WHERE "id"='company'`);await assert.rejects(requireStaffCompanyGrant(noWriteReadDb,user,'professions.read'),{code:'LICENSE_INACTIVE'});await db.$executeRawUnsafe(`UPDATE "Company" SET "licenseStatus"='ACTIVE' WHERE "id"='company'`);
  for(const headers of [{'x-backoffice-store-id':''},{'x-backoffice-store-id':'selected'},{'x-backoffice-company-id':'foreign'}])await assert.rejects(enforceStaffCompanyRequest(db,request('/api/owner-products/stores',headers)),{code:'STAFF_ACCESS_DENIED'});
  await db.$executeRawUnsafe('UPDATE "CompanyModule" SET "active"=false WHERE "companyId"=\'company\' AND "moduleKey"=\'INVENTORY\'');await assert.rejects(requireStaffCompanyGrant(db,user,'stores.read'),{code:'MODULE_DISABLED'});await db.$executeRawUnsafe('UPDATE "CompanyModule" SET "active"=true WHERE "companyId"=\'company\' AND "moduleKey"=\'INVENTORY\'');
  // The actual SQL read is followed by a real policy revision change. No
  // installed/readiness function is stubbed; an older read must be withheld.
  const req=request('/api/owner-products/stores');await enforceStaffCompanyRequest(db,req);let changed=false;
  const wrapped=new Proxy(db,{get(target,key){if(key==='store')return new Proxy(target.store,{get(store,operation){if(operation==='findMany')return async args=>{const rows=await store.findMany(args);if(!changed){changed=true;await db.$executeRawUnsafe('UPDATE "BackofficeStaffAccount" SET "revision"="revision"+1 WHERE "userId"=$1',created.id)}return rows};return store[operation]}});const value=Reflect.get(target,key);return typeof value==='function'?value.bind(target):value}});
  await assert.rejects(readStaffCompanyDirectory(wrapped,req),{code:'STAFF_ACCESS_DENIED'});assert.equal(changed,true);
  assert.deepEqual(await updateStaffAccount(db,owner,created.id,{expectedRevision:2,active:true,grants:[],companyCapabilities:[]}),{id:created.id,revision:3});
  const stored=(await db.$queryRawUnsafe('SELECT "companyCapabilities","revision" FROM "BackofficeStaffAccount" WHERE "userId"=$1',created.id))[0];assert.deepEqual(stored.companyCapabilities,[]);assert.equal(stored.revision,3);
  await assert.rejects(requireStaffCompanyGrant(db,user,'stores.read'),{code:'STAFF_SESSION_INVALID'});
  await db.$executeRawUnsafe('INSERT INTO "UserSession"("id","userId","expiresAt") VALUES (\'company-only-new-session\',$1,NOW()+INTERVAL \'1 hour\')',created.id);
  await assert.rejects(requireStaffCompanyGrant(db,{...user,sessionId:'company-only-new-session',sessionVersion:1},'stores.read'),{code:'STAFF_ACCESS_DENIED'});
 }finally{for(const key of keys){if(saved[key]===undefined)delete process.env[key];else process.env[key]=saved[key]}}
}
