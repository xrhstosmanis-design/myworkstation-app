import {readFileSync} from 'node:fs';
import {createLifecycleInstallationCore} from './store-lifecycle-executor.js';
import {reviewedFreshStoreManifest,selectedStoreLifecycleManifest} from './store-lifecycle-manifest.js';
import {requireLifecycleAdmin} from './store-lifecycle-preview.js';
import {readLifecycleInstallationControls,readLifecycleInstallationGlobalState} from './monthly-inventory-snapshot-installation.js';
const quote=value=>'"'+value.replaceAll('"','""')+'"';
const fail=(code='REPORT_EVENT_INSTALL_REFUSED')=>{throw Object.assign(new Error('Event report installation preflight differs.'),{code,status:409})};
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
const migrations=['automatic-report-supplier-comparison.sql','automatic-report-promotion-result.sql','automatic-report-inventory-result.sql'].flatMap(name=>readFileSync(new URL('../../scripts/sql/'+name,import.meta.url),'utf8').split(';').map(sql=>sql.trim()).filter(sql=>sql&&sql!=='BEGIN'&&sql!=='COMMIT'));
export function createAutomaticReportEventInstallation(db,{sourceRevision,enabled=false,profile='BASE'}={}){
 if(!/^[a-f0-9]{40}$/.test(sourceRevision||'')||typeof enabled!=='boolean'||!['BASE','CAPTURE'].includes(profile))fail();
 const source=profile==='CAPTURE'?selectedStoreLifecycleManifest({MWS_STORE_LIFECYCLE_PROFILE:'MONTHLY_INVENTORY_CAPTURE_V1'}):reviewedFreshStoreManifest();
 const target=selectedStoreLifecycleManifest({MWS_STORE_LIFECYCLE_PROFILE:profile==='CAPTURE'?'MONTHLY_INVENTORY_CAPTURE_EVENT_REPORTS_V1':'AUTOMATIC_EVENT_REPORTS_V1'});
 const sourceCore=createLifecycleInstallationCore(source,{sourceRevision}),targetCore=createLifecycleInstallationCore(target,{sourceRevision});
 const oldPlanHash=sourceCore.describe().planHash,targetPlanHash=targetCore.describe().planHash;
 const description={sourceRevision,profile,oldPlanHash,targetPlanHash,targetProfile:profile==='CAPTURE'?'MONTHLY_INVENTORY_CAPTURE_EVENT_REPORTS_V1':'AUTOMATIC_EVENT_REPORTS_V1',productionActivated:false};
 const scopeInput=input=>{if(!input||!text(input.companyId)||!text(input.storeId))fail();return {companyId:input.companyId,storeId:input.storeId}};
 const transaction=(actor,readOnly,fn)=>{const admittedActor=copy(actor);requireLifecycleAdmin(admittedActor);return db.$transaction(async tx=>{
  if(readOnly)await tx.$executeRawUnsafe('SET TRANSACTION READ ONLY');
  await tx.$executeRawUnsafe("SET LOCAL TimeZone='UTC'");await tx.$executeRawUnsafe("SET LOCAL lock_timeout='2s'");await tx.$executeRawUnsafe("SET LOCAL statement_timeout='20s'");
  const [user]=await tx.$queryRawUnsafe(`SELECT "id","role","sessionVersion","mustChangePassword" FROM "User" WHERE "id"=$1${readOnly?'':' FOR SHARE NOWAIT'}`,admittedActor.id);
  if(user?.role!=='SUPER_ADMIN'||user.mustChangePassword===true||admittedActor.sessionVersion!==undefined&&user.sessionVersion!==admittedActor.sessionVersion)fail('REPORT_EVENT_INSTALL_ACTOR_CHANGED');
  if(admittedActor.sessionId){
   const sessions=await tx.$queryRawUnsafe(
    'SELECT "userId" FROM "UserSession" WHERE "id"=$1 AND "revokedAt" IS NULL AND "expiresAt">NOW()'+(readOnly?'':' FOR SHARE NOWAIT'),
    admittedActor.sessionId);
   if(sessions.length!==1||sessions[0].userId!==admittedActor.id)fail('REPORT_EVENT_INSTALL_ACTOR_CHANGED');
  }
  return fn(tx,admittedActor);
 },{isolationLevel:readOnly?'RepeatableRead':'ReadCommitted',timeout:120000,maxWait:3000})};
 async function observe(tx,actor,scope){
  const schema=(await tx.$queryRawUnsafe('SELECT current_schema() AS schema'))[0]?.schema;if(!text(schema))fail();
  const stores=await tx.$queryRawUnsafe(`SELECT "id" FROM ${quote(schema)}."Store" WHERE "id"=$1 AND "companyId"=$2`,scope.storeId,scope.companyId);if(stores.length!==1)fail();
  const controls=await readLifecycleInstallationControls(tx,schema);
  const global=await readLifecycleInstallationGlobalState(tx,schema,controls.names,targetPlanHash);
  const hashes=new Set(global.fences.map(f=>f.planHash));
  if([...hashes].some(value=>![oldPlanHash,targetPlanHash].includes(value))||hashes.size>1)fail('REPORT_EVENT_INSTALL_UNKNOWN_ENROLLMENT');
  const installed=hashes.has(targetPlanHash);
  const additions=await tx.$queryRawUnsafe(`SELECT name FROM unnest($1::text[]) name WHERE to_regclass(format('%I.%I',$2,name)) IS NOT NULL ORDER BY name`,['AutomaticReportSupplierComparisonConsent','AutomaticReportEventConsent'],schema);
  const metadata=installed?await targetCore.inspectInTransaction(tx,actor):await sourceCore.inspectAdditiveInTransaction(tx,actor,{extensions:additions.map(row=>row.name)});
  if(global.reasons.some(reason=>reason!=='MONTHLY_INSTALL_PLAN_TRANSITION_REQUIRED'))fail('REPORT_EVENT_INSTALL_ACTIVE_WORK');
  if(global.fences.length&&!metadata.guardsInstalled)fail();
  const packet={...scope,...description,schema,installed,catalogueSignature:metadata.signature,controlsSignature:controls.signature,globalStateSignature:global.signature};
  return {packet,global,controls,metadata};
 }
 return Object.freeze({describe:()=>copy(description),
  inspect:(actor,input)=>{const scope=scopeInput(input);return transaction(actor,true,async(tx,admittedActor)=>({packet:(await observe(tx,admittedActor,scope)).packet,eligible:true,reasons:[]}))},
  install:(actor,input)=>{
   if(!enabled)fail('REPORT_EVENT_INSTALL_DISABLED');
   if(input?.explicitAuthorization!==true)fail('REPORT_EVENT_INSTALL_AUTHORIZATION_REQUIRED');
   const scope=scopeInput(input),packet=copy(input.packet);if(packet?.sourceRevision!==sourceRevision||packet.oldPlanHash!==oldPlanHash||packet.targetPlanHash!==targetPlanHash)fail();
   return transaction(actor,false,async(tx,admittedActor)=>{
    await tx.$queryRawUnsafe("SELECT pg_advisory_xact_lock(hashtextextended('mws:monthly-snapshot-install-v1',0))");
    const schema=(await tx.$queryRawUnsafe('SELECT current_schema() AS schema'))[0]?.schema;if(schema!==packet.schema)fail();
    const relations=await tx.$queryRawUnsafe(`SELECT c.relname AS name FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname=$1 AND c.relkind IN ('r','p','f') ORDER BY c.relname LIMIT 601`,schema);
    const allowed=new Set([...target.knownTables,'StoreLifecycleFence','StoreLifecycleExecution','StoreLifecycleTombstone','StoreLifecycleRuntime']);
    if(relations.length>600||relations.some(row=>!allowed.has(row.name)))fail();
    const names=relations.map(row=>row.name),ordered=[...(names.includes('StoreLifecycleFence')?['StoreLifecycleFence']:[]),...names.filter(name=>name!=='StoreLifecycleFence').sort()];
    for(const name of ordered)await tx.$executeRawUnsafe(`LOCK TABLE ${quote(schema)}.${quote(name)} IN EXCLUSIVE MODE NOWAIT`);
    const before=await observe(tx,admittedActor,scope);if(JSON.stringify(before.packet)!==JSON.stringify(packet))fail('REPORT_EVENT_INSTALL_STATE_CHANGED');
    if(!packet.installed){
     for(const sql of migrations)await tx.$executeRawUnsafe(sql);
     for(const fence of before.global.fences){
      const changed=await tx.$executeRawUnsafe(`UPDATE ${quote(schema)}."StoreLifecycleFence" SET "planHash"=$1 WHERE "storeId"=$2 AND "companyId"=$3 AND "planHash"=$4 AND "generation"=$5::bigint AND NOT "maintenance" AND NOT "retired" AND "operationId" IS NULL`,targetPlanHash,fence.storeId,fence.companyId,oldPlanHash,fence.generation);
      if(changed!==1)fail('REPORT_EVENT_INSTALL_STATE_CHANGED');
     }
    }
    await targetCore.installInTransaction(tx,admittedActor,scope);
    const after=await observe(tx,admittedActor,scope);if(!after.packet.installed)fail();
    for(const fence of before.global.fences){const next=after.global.fences.find(row=>row.storeId===fence.storeId);if(!next||next.generation!==fence.generation||next.companyId!==fence.companyId)fail();}
    return {...description,installed:true,enrolled:true,companyId:scope.companyId,storeId:scope.storeId,transitionedEnrollments:packet.installed?0:before.global.fences.length,catalogueSignature:after.packet.catalogueSignature,productionActivated:false};
   });
  }
 });
}
