import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,symlink,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {monthlyInventorySnapshotInstallRequest as request,monthlyInventoryCaptureInstallRequest as captureRequest,runMonthlyInventorySnapshotInstall as run} from '../scripts/monthly-inventory-snapshot-install.mjs';
import {createMonthlyInventorySnapshotInstallation as create,createMonthlyInventoryCaptureInstallation as createCapture} from '../src/services/monthly-inventory-snapshot-installation.js';
import {createLifecycleExecutionCore} from '../src/services/store-lifecycle-executor.js';
import {monthlyInventorySnapshotLifecycleManifestProposal} from '../src/services/monthly-inventory-snapshot-schema.js';
const revision='a'.repeat(40),env={NODE_ENV:'production',RENDER_SERVICE_ID:'srv-d9isenfavr4c73bdh52g',RENDER_GIT_COMMIT:revision,MWS_MONTHLY_INVENTORY_INSTALL_ENABLED:'true'},actor={id:'synthetic-operator',isSuperAdmin:true},scope={companyId:'synthetic-company',storeId:'synthetic-store'};
const args=['install','--company',scope.companyId,'--store',scope.storeId,'--packet','/synthetic/packet.json','--approval','MONTHLY-INVENTORY-INSTALL-ONLY'];
const refused=e=>e.code==='MONTHLY_INSTALL_OPERATOR_REFUSED';

test('operator purpose, exact service/revision/scope and enabled gate refuse before DB import',()=>{
 const accepted=request(args,env);assert.equal(accepted.sourceRevision,revision);assert.equal(accepted.enabled,true);assert.deepEqual(accepted.scope,scope);assert.equal(accepted.actor.platformRole,'SUPER_ADMIN');assert.ok(Object.isFrozen(accepted));assert.ok(Object.isFrozen(accepted.scope));assert.ok(Object.isFrozen(accepted.actor));
 for(const patch of [{NODE_ENV:'test'},{RENDER_SERVICE_ID:'another-service'},{RENDER_GIT_COMMIT:'A'.repeat(40)},{RENDER_GIT_COMMIT:'a'.repeat(39)},{MWS_MONTHLY_INVENTORY_INSTALL_ENABLED:'TRUE'},{MWS_MONTHLY_INVENTORY_INSTALL_ENABLED:undefined}])assert.throws(()=>request(args,{...env,...patch}),refused);
 for(const input of [[],['reset'],['inspect','--company',scope.companyId],['describe','--store',scope.storeId],[...args,'--store','other'],[...args,'--unknown','value'],[...args,'--odd'],args.map(v=>v==='MONTHLY-INVENTORY-INSTALL-ONLY'?'RESET':v),args.map(v=>v===scope.storeId?' trimmed ':v),args.map(v=>v===scope.storeId?'x\n':v),args.map(v=>v===scope.storeId?'Ω'.repeat(81):v),['inspect','--company',scope.companyId,'--store',scope.storeId,'--packet','/packet']])assert.throws(()=>request(input,env),refused);
 const inspect=request(['inspect','--company',scope.companyId,'--store',scope.storeId],{...env,MWS_MONTHLY_INVENTORY_INSTALL_ENABLED:'false'});assert.equal(inspect.enabled,false);
 assert.deepEqual(request(['describe'],{GIT_COMMIT:revision}),{action:'describe',sourceRevision:revision,enabled:false});
});

test('import and describe need neither database nor recovery/reset adapter; destructive legacy constructor still requires recovery',async()=>{
 const service=create(null,{sourceRevision:revision});assert.ok(Object.isFrozen(service));const description=service.describe();assert.ok(description&&typeof description==='object');assert.equal(description.productionActivated,false);assert.equal(description.captureEnabled,false);
 assert.deepEqual(await run(['describe'],{GIT_COMMIT:revision}),description);
 assert.throws(()=>createLifecycleExecutionCore(monthlyInventorySnapshotLifecycleManifestProposal(),{sourceRevision:revision}),/durable full-restore verification adapter/);
});

test('service actor, closed inputs and disabled installation fail before transaction or startup work',async()=>{
 let calls=0;const db={$transaction(){calls++;throw new Error('DB must not start')}};
 const disabled=create(db,{sourceRevision:revision});await assert.rejects(disabled.install(actor,{...scope,packet:{}}));assert.equal(calls,0);
 const service=create(db,{sourceRevision:revision,enabled:true});
 for(const bad of [null,{}, {id:'fake',role:'SUPER_ADMIN'},{id:'owner',role:'OWNER'}])await assert.rejects(service.inspect(bad,scope));
 let getterCalls=0;const getter={companyId:scope.companyId,get storeId(){getterCalls++;return scope.storeId}};
 for(const input of [null,{}, {...scope,extra:'private'}, {...scope,storeId:''},{...scope,storeId:' foreign '},getter])await assert.rejects(service.inspect(actor,input));
 assert.equal(getterCalls,0);assert.equal(calls,0);
 for(const sourceRevision of [undefined,'A'.repeat(40),'a'.repeat(39)])assert.throws(()=>create(db,{sourceRevision,enabled:true}));
});

test('reviewed packets require complete exact scope/hash/state admission and never infer absent generation zero',async()=>{
 let calls=0;const service=create({$transaction(){calls++;throw new Error('DB must not start')}},{sourceRevision:revision,enabled:true}),description=service.describe();
 const packet={...scope,sourceRevision:revision,schema:'public',profile:'BASE',catalogueSignature:'b'.repeat(64),globalStateSignature:'c'.repeat(64),oldPlanHash:description.oldPlanHash,targetPlanHash:description.targetPlanHash,guardsInstalled:false,enrollment:{enrolled:false,generation:null,planHash:null,maintenance:null,retired:null,operationId:null}};
 const changes=[{sourceRevision:'d'.repeat(40)},{storeId:'sibling'},{companyId:'foreign-company'},{oldPlanHash:'f'.repeat(64)},{targetPlanHash:'e'.repeat(64)},{profile:'AUTO'},{catalogueSignature:'b'.repeat(63)},{globalStateSignature:null},{guardsInstalled:'false'},{privateGrant:'unreviewed'}];
 for(const change of changes)await assert.rejects(service.install(actor,{...scope,packet:{...packet,...change}}));
 for(const change of [{generation:'0'},{maintenance:false},{retired:false},{operationId:'operation'},{planHash:description.targetPlanHash},{privateEpoch:'0'}])await assert.rejects(service.install(actor,{...scope,packet:{...packet,enrollment:{...packet.enrollment,...change}}}));
 for(const generation of ['01','-1','9223372036854775808',0])await assert.rejects(service.install(actor,{...scope,packet:{...packet,enrollment:{enrolled:true,generation,planHash:description.targetPlanHash,maintenance:false,retired:false,operationId:null}}}));
 let getters=0;const getter={...packet};Object.defineProperty(getter,'catalogueSignature',{enumerable:true,get(){getters++;return packet.catalogueSignature}});await assert.rejects(service.install(actor,{...scope,packet:getter}));assert.equal(getters,0);assert.equal(calls,0);
});

test('operator reads one bounded regular UTF8 packet before any DB import',async()=>{
 const directory=await mkdtemp(path.join(tmpdir(),'monthly-install-packet-'));
 try{
  const file=path.join(directory,'packet.json'),link=path.join(directory,'link.json');await writeFile(file,'{}');await symlink(file,link);
  const invoke=packet=>run(args.map(v=>v==='/synthetic/packet.json'?packet:v),env);
  await assert.rejects(invoke(link));await assert.rejects(invoke(directory));
  for(const bytes of [Buffer.alloc(65537,32),Buffer.from([0xff,0xff]),Buffer.from('{broken'),Buffer.from('')]){await writeFile(file,bytes);await assert.rejects(invoke(file));}
 }finally{await rm(directory,{recursive:true,force:true});}
});


test('CAPTURE3 is a separate closed purpose/profile with its own dormant enablement and no legacy output changes',async()=>{
 const capEnv={...env,MWS_MONTHLY_INVENTORY_CAPTURE_INSTALL_ENABLED:'true'};
 const capArgs=[...args.map(value=>value==='MONTHLY-INVENTORY-INSTALL-ONLY'?'MONTHLY-INVENTORY-CAPTURE3-INSTALL-ONLY':value),'--profile','CAPTURE3'];
 const accepted=captureRequest(capArgs,capEnv);assert.equal(accepted.installationProfile,'CAPTURE3');assert.equal(accepted.actor.id,'service-operator:render:MONTHLY-INVENTORY-CAPTURE3-INSTALL-ONLY');assert.equal(accepted.enabled,true);assert.deepEqual(accepted.scope,scope);
 assert.throws(()=>request(capArgs,capEnv),refused);
 assert.equal(request(args.map(value=>value===scope.companyId?'--profile':value),env).scope.companyId,'--profile');assert.equal(captureRequest(capArgs.map(value=>value===scope.companyId?'--profile':value),capEnv).scope.companyId,'--profile');
 for(const input of [args,[...capArgs,'--profile','CAPTURE3'],capArgs.map(value=>value==='CAPTURE3'?'AUTO':value),capArgs.map(value=>value==='MONTHLY-INVENTORY-CAPTURE3-INSTALL-ONLY'?'MONTHLY-INVENTORY-INSTALL-ONLY':value),['describe','--profile','SNAPSHOT']])assert.throws(()=>captureRequest(input,capEnv),refused);
 for(const value of [undefined,'TRUE','false'])assert.throws(()=>captureRequest(capArgs,{...capEnv,MWS_MONTHLY_INVENTORY_CAPTURE_INSTALL_ENABLED:value}),refused);
 const description=createCapture(null,{sourceRevision:revision}).describe(),legacy=create(null,{sourceRevision:revision}).describe();
 assert.equal(description.installationProfile,'CAPTURE3');assert.equal(description.oldPlanHash,legacy.oldPlanHash);assert.notEqual(description.targetPlanHash,legacy.targetPlanHash);assert.equal(description.productionActivated,false);assert.equal(description.captureEnabled,false);
 assert.deepEqual(await run(['describe','--profile','CAPTURE3'],{GIT_COMMIT:revision}),description);
 assert.equal(Object.hasOwn(legacy,'installationProfile'),false);assert.deepEqual(request(['describe'],{GIT_COMMIT:revision}),{action:'describe',sourceRevision:revision,enabled:false});assert.deepEqual(await run(['describe'],{GIT_COMMIT:revision}),legacy);
});

test('CAPTURE3 rejects snapshot packets and malformed scope before database access',async()=>{
 let calls=0;const db={$transaction(){calls++;throw new Error('DB must not start')}};
 const cap=createCapture(db,{sourceRevision:revision,enabled:true}),legacy=create(null,{sourceRevision:revision}).describe();
 const packet={...scope,sourceRevision:revision,schema:'public',profile:'BASE',catalogueSignature:'b'.repeat(64),globalStateSignature:'c'.repeat(64),oldPlanHash:legacy.oldPlanHash,targetPlanHash:legacy.targetPlanHash,guardsInstalled:false,enrollment:{enrolled:false,generation:null,planHash:null,maintenance:null,retired:null,operationId:null}};
 await assert.rejects(cap.install(actor,{...scope,packet}),{code:'MONTHLY_INSTALL_STATE_CHANGED'});
 await assert.rejects(cap.inspect(actor,{...scope,extra:true}));await assert.rejects(createCapture(db,{sourceRevision:revision}).install(actor,{...scope,packet}));assert.equal(calls,0);
});
