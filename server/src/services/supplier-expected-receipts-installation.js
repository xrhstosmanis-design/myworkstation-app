import {readFileSync} from 'node:fs';
import {EXPECTED_RECEIPT_SOURCE_PROFILE,EXPECTED_RECEIPT_TARGET_PROFILE} from './supplier-expected-receipts-lifecycle-profile.js';
import {collectExpectedReceiptCatalog} from './supplier-expected-receipts-compatibility.js';
import {createLifecycleInstallationCore} from './store-lifecycle-executor.js';
import {reviewedFreshStoreManifest,selectedStoreLifecycleManifest} from './store-lifecycle-manifest.js';
import {requireLifecycleAdmin} from './store-lifecycle-preview.js';
import {readLifecycleInstallationControls,readLifecycleInstallationGlobalState} from './monthly-inventory-snapshot-installation.js';
const quote=value=>'"'+value.replaceAll('"','""')+'"';
const fail=(code='EXPECTED_RECEIPT_INSTALL_REFUSED')=>{throw Object.assign(new Error('Event report installation preflight differs.'),{code,status:409})};
const copy=value=>{
 if(value===null||typeof value!=='object')return value;
 if(Array.isArray(value))return value.map(copy);
 if(![Object.prototype,null].includes(Object.getPrototypeOf(value)))fail();
 const result={};
 for(const [key,descriptor] of Object.entries(Object.getOwnPropertyDescriptors(value))){
  if(!Object.hasOwn(descriptor,'value'))fail();
  Object.defineProperty(result,key,{value:copy(descriptor.value),enumerable:true,writable:true,configurable:true});
 }
 return result;
};
const text=value=>typeof value==='string'&&value.trim()===value&&value.length>0&&value.length<=160&&!/[\u0000-\u001f\u007f]/.test(value);
const migrations=readFileSync(new URL('../../scripts/sql/supplier-expected-receipts-installation.sql',import.meta.url),'utf8').split(';').map(s=>s.trim()).filter(Boolean);
export function createExpectedReceiptInstallation(db,{sourceRevision,enabled=false}={}){
 if(!/^[a-f0-9]{40}$/.test(sourceRevision||'')||typeof enabled!=='boolean')fail();
 const source=selectedStoreLifecycleManifest({MWS_STORE_LIFECYCLE_PROFILE:EXPECTED_RECEIPT_SOURCE_PROFILE});
 const targetProfile=EXPECTED_RECEIPT_TARGET_PROFILE,profile='NO14';
 const target=selectedStoreLifecycleManifest({MWS_STORE_LIFECYCLE_PROFILE:targetProfile});
 const sourceCore=createLifecycleInstallationCore(source,{sourceRevision}),targetCore=createLifecycleInstallationCore(target,{sourceRevision});
 const oldPlanHash=sourceCore.describe().planHash,targetPlanHash=targetCore.describe().planHash;
 const description={sourceRevision,profile,oldPlanHash,targetPlanHash,targetProfile,productionActivated:false};
 const scopeInput=input=>{if(!input||!text(input.companyId)||!text(input.storeId))fail();return {companyId:input.companyId,storeId:input.storeId}};
 const transaction=(actor,readOnly,fn)=>{const admittedActor=copy(actor);requireLifecycleAdmin(admittedActor);if(!admittedActor.sessionId||admittedActor.supportContext||(admittedActor.tokenType!==undefined&&admittedActor.tokenType!=='BACKOFFICE_USER'))fail('EXPECTED_RECEIPT_INSTALL_ACTOR_CHANGED');return db.$transaction(async tx=>{
  if(readOnly)await tx.$executeRawUnsafe('SET TRANSACTION READ ONLY');
  await tx.$executeRawUnsafe("SET LOCAL TimeZone='UTC'");await tx.$executeRawUnsafe("SET LOCAL lock_timeout='2s'");await tx.$executeRawUnsafe("SET LOCAL statement_timeout='20s'");
  const [user]=await tx.$queryRawUnsafe(`SELECT "id","role","sessionVersion","mustChangePassword" FROM "User" WHERE "id"=$1${readOnly?'':' FOR SHARE NOWAIT'}`,admittedActor.id);
  if(user?.role!=='SUPER_ADMIN'||user.mustChangePassword===true||user.sessionVersion!==admittedActor.sessionVersion)fail('EXPECTED_RECEIPT_INSTALL_ACTOR_CHANGED');
  if(admittedActor.sessionId){
   const sessions=await tx.$queryRawUnsafe(
    'SELECT "userId" FROM "UserSession" WHERE "id"=$1 AND "revokedAt" IS NULL AND "expiresAt">NOW()'+(readOnly?'':' FOR SHARE NOWAIT'),
    admittedActor.sessionId);
   if(sessions.length!==1||sessions[0].userId!==admittedActor.id)fail('EXPECTED_RECEIPT_INSTALL_ACTOR_CHANGED');
  }
  return fn(tx,admittedActor);
 },{isolationLevel:readOnly?'RepeatableRead':'ReadCommitted',timeout:120000,maxWait:3000})};
 async function observe(tx,actor,scope){
  const schema=(await tx.$queryRawUnsafe('SELECT current_schema() AS schema'))[0]?.schema;if(!text(schema))fail();
  const stores=await tx.$queryRawUnsafe(`SELECT "id" FROM ${quote(schema)}."Store" WHERE "id"=$1 AND "companyId"=$2`,scope.storeId,scope.companyId);if(stores.length!==1)fail();
  const controls=await readLifecycleInstallationControls(tx,schema);
  const global=await readLifecycleInstallationGlobalState(tx,schema,controls.names,targetPlanHash);
  const hashes=new Set(global.fences.map(f=>f.planHash));
  if([...hashes].some(value=>![oldPlanHash,targetPlanHash].includes(value))||hashes.size>1)fail('EXPECTED_RECEIPT_INSTALL_UNKNOWN_ENROLLMENT');
  if(!global.fences.length||!global.fences.some(f=>f.storeId===scope.storeId&&f.companyId===scope.companyId))fail('EXPECTED_RECEIPT_INSTALL_ENROLLMENT_REQUIRED');
  const installed=hashes.has(targetPlanHash);
  const catalog=await collectExpectedReceiptCatalog(tx,{schema});
  if(!installed&&catalog.tables.length)fail('EXPECTED_RECEIPT_INSTALL_PARTIAL_SCHEMA');
  const metadata=await (installed?targetCore:sourceCore).inspectInTransaction(tx,actor);
  if(global.reasons.some(reason=>reason!=='MONTHLY_INSTALL_PLAN_TRANSITION_REQUIRED'))fail('EXPECTED_RECEIPT_INSTALL_ACTIVE_WORK');
  if(global.fences.length&&!metadata.guardsInstalled)fail();
  const packet={...scope,...description,actorId:actor.id,schema,installed,catalogueSignature:metadata.signature,controlsSignature:controls.signature,globalStateSignature:global.signature,enrollments:global.fences.map(f=>({storeId:f.storeId,companyId:f.companyId,generation:f.generation}))};
  return {packet,global,controls,metadata};
 }
 return Object.freeze({describe:()=>copy(description),
  inspect:(actor,input)=>{const scope=scopeInput(input);return transaction(actor,true,async(tx,admittedActor)=>({packet:(await observe(tx,admittedActor,scope)).packet,eligible:enabled,reasons:enabled?[]:['EXPECTED_RECEIPT_INSTALL_DISABLED']}))},
  install:(actor,input)=>{
   if(!enabled)fail('EXPECTED_RECEIPT_INSTALL_DISABLED');
   if(input?.explicitAuthorization!==true)fail('EXPECTED_RECEIPT_INSTALL_AUTHORIZATION_REQUIRED');
   const scope=scopeInput(input),packet=copy(input.packet);const expectedKeys=['companyId','storeId','sourceRevision','profile','oldPlanHash','targetPlanHash','targetProfile','productionActivated','actorId','schema','installed','catalogueSignature','controlsSignature','globalStateSignature','enrollments'];
   if(!packet||JSON.stringify(Object.keys(packet).sort())!==JSON.stringify(expectedKeys.sort())||packet.companyId!==scope.companyId||packet.storeId!==scope.storeId||packet.actorId!==actor.id||packet.sourceRevision!==sourceRevision||packet.oldPlanHash!==oldPlanHash||packet.targetPlanHash!==targetPlanHash||packet.targetProfile!==targetProfile||packet.profile!==profile||packet.productionActivated!==false||typeof packet.installed!=='boolean'||['catalogueSignature','controlsSignature','globalStateSignature'].some(k=>!/^[a-f0-9]{64}$/.test(packet[k]||''))||!Array.isArray(packet.enrollments))fail();
   return transaction(actor,false,async(tx,admittedActor)=>{
    await tx.$queryRawUnsafe("SELECT 1 AS locked FROM pg_advisory_xact_lock(hashtextextended('mws:monthly-snapshot-install-v1',0))");
    const schema=(await tx.$queryRawUnsafe('SELECT current_schema() AS schema'))[0]?.schema;if(schema!==packet.schema)fail();
    const relations=await tx.$queryRawUnsafe(`SELECT c.relname AS name FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname=$1 AND c.relkind IN ('r','p','f') ORDER BY c.relname LIMIT 601`,schema);
    const allowed=new Set([...target.knownTables,'StoreLifecycleFence','StoreLifecycleExecution','StoreLifecycleTombstone','StoreLifecycleRuntime']);
    if(relations.length>600||relations.some(row=>!allowed.has(row.name)))fail();
    const names=relations.map(row=>row.name),ordered=[...(names.includes('StoreLifecycleFence')?['StoreLifecycleFence']:[]),...names.filter(name=>name!=='StoreLifecycleFence').sort()];
    for(const name of ordered)await tx.$executeRawUnsafe(`LOCK TABLE ${quote(schema)}.${quote(name)} IN EXCLUSIVE MODE NOWAIT`);
    const before=await observe(tx,admittedActor,scope);
    if(before.packet.installed){
     if(JSON.stringify(before.packet.enrollments)!==JSON.stringify(packet.enrollments))fail('EXPECTED_RECEIPT_INSTALL_STATE_CHANGED');
     return {...description,installed:true,alreadyInstalled:true,verifiedCurrentTarget:true,originalOperationReceipt:false,companyId:scope.companyId,storeId:scope.storeId,catalogueSignature:before.packet.catalogueSignature};
    }
    if(JSON.stringify(before.packet)!==JSON.stringify(packet))fail('EXPECTED_RECEIPT_INSTALL_STATE_CHANGED');
    if(!packet.installed){
     for(const sql of migrations)await tx.$executeRawUnsafe(sql);
     for(const fence of before.global.fences){
      const changed=await tx.$executeRawUnsafe(`UPDATE ${quote(schema)}."StoreLifecycleFence" SET "planHash"=$1 WHERE "storeId"=$2 AND "companyId"=$3 AND "planHash"=$4 AND "generation"=$5::bigint AND NOT "maintenance" AND NOT "retired" AND "operationId" IS NULL`,targetPlanHash,fence.storeId,fence.companyId,oldPlanHash,fence.generation);
      if(changed!==1)fail('EXPECTED_RECEIPT_INSTALL_STATE_CHANGED');
     }
    }
    // Existing V3 guards are verified, never rewritten or re-enrolled.
    const after=await observe(tx,admittedActor,scope);if(!after.packet.installed)fail();
    for(const fence of before.global.fences){const next=after.global.fences.find(row=>row.storeId===fence.storeId);if(!next||next.generation!==fence.generation||next.companyId!==fence.companyId)fail();}
    return {...description,installed:true,enrolled:true,companyId:scope.companyId,storeId:scope.storeId,transitionedEnrollments:packet.installed?0:before.global.fences.length,catalogueSignature:after.packet.catalogueSignature,productionActivated:false};
   });
  }
 });
}
