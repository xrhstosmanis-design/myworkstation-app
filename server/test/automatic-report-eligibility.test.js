import test from 'node:test';
import assert from 'node:assert/strict';
import {dispatchPolicyFingerprint} from '../src/services/automatic-report-dispatch-policy.js';
import {readActivation,ACTIVATION_SERVICE_ID} from '../src/services/automatic-report-activation.js';
import {createAutomaticReportEligibilityReader,automaticReportScopeInput} from '../src/services/automatic-report-eligibility.js';
const NOW='2026-10-22T12:00:00.000Z';
const control=readActivation({RENDER_SERVICE_ID:ACTIVATION_SERVICE_ID,AUTOMATIC_REPORT_ACTIVATION_CONTROL:JSON.stringify({v:1,serviceId:ACTIVATION_SERVICE_ID,epoch:'11111111-1111-4111-8111-111111111111',issuedAt:'2026-10-19T00:00:00.000Z',notBefore:'2026-10-20T04:00:00.000Z',enabled:true})});
const scope={companyId:'c',storeId:'s',frequency:'DAILY'};
function fixture(){
 const events=[],payloads=new Map(),slots=new Map();let currentControl=control;
 const configuration={dayStartHour:7,secondShiftStartHour:15,thirdShiftStartHour:23,terminals:[{terminalPos:'MAIN',requiredSlots:[1,2,3]}],cashRule:{mode:'FULL',deliveryTerminalPattern:'DELIVERY',carryOverEnabled:true,posEftposEnabled:true}};
 const rule={...configuration.cashRule,updatedAt:new Date('2026-10-19T00:00:00.000Z')};
 const rows=Array.from({length:3},(_,i)=>({id:'shift'+i,companyId:'c',storeId:'s',terminalPos:'MAIN',status:'CLOSED',openedBy:'operator',openedByName:'Synthetic',openedAt:new Date(Date.parse('2026-10-21T04:00:00.000Z')+i*28800000),closedAt:new Date(Date.parse('2026-10-21T04:00:00.000Z')+(i+1)*28800000),variance:-i,updatedAt:new Date('2026-10-22T04:00:00.000Z')}));
 const company={id:'c',active:true,licenseStatus:'ACTIVE',subscriptionEndsAt:null},store={id:'s',companyId:'c',name:'Synthetic',active:true},principal={id:'sa',role:'SUPER_ADMIN',sessionVersion:1};
 const auth={policy:{revision:'1',dispatchEnabled:true,allowsProvisional:true,allowedFrequencies:['DAILY'],lifecycleGeneration:'1'},grant:{revision:'1',active:true,principalId:'sa',principalSessionVersion:1,allowedFrequencies:['DAILY'],lifecycleGeneration:'1',activationEpoch:control.epoch,activationFingerprint:control.activationFingerprint,notBefore:control.notBefore,createdAt:'2026-10-19T01:00:00.000Z',grantedAt:'2026-10-19T01:00:00.000Z'},recipients:[{recipient:{recipientId:'r',email:'recipient@example.invalid',version:'1',verifiedAt:'2026-10-19T02:00:00.000Z',revokedAt:null},consent:{revision:'1',recipientVersion:'1',active:true,allowedFrequencies:['DAILY'],lifecycleGeneration:'1',consentedAt:'2026-10-19T02:00:00.000Z',proofHash:'a'.repeat(64)}}]};
 const tx={
  user:{findUnique:async()=>principal},store:{findFirst:async()=>store},
  $queryRawUnsafe:async(sql,...values)=>{events.push(sql.includes('current_schema')?'metadata':'lifecycle');if(sql.includes('current_schema'))return[{schema:'test',fence:'test.StoreLifecycleFence'}];if(sql.includes('set_config'))return[];return[{companyId:'c',generation:'1',maintenance:false,retired:false}]},
  $executeRaw:async strings=>{events.push(strings.join('?'));return 0},
  $executeRawUnsafe:async sql=>{events.push(sql);return 0},
  $queryRaw:async(strings,...values)=>{
   const sql=strings.join('?');events.push(sql);
   if(sql.includes('AutomaticReportDeliverySlot')){
    const project=r=>({slotId:r.slotId,companyId:r.input.companyId,storeId:r.input.storeId,version:String(r.version),status:r.status,token:r.token,record:structuredClone(r)});
    if(sql.startsWith('INSERT')){if(slots.has(values[0]))return[];const r=JSON.parse(values[6]);slots.set(r.slotId,r);return[{slotId:r.slotId}]}
    if(sql.startsWith('UPDATE')){const before=slots.get(values[6]);assert.equal(values[7],BigInt(before.version));const r=JSON.parse(values[3]);slots.set(r.slotId,r);return[project(r)]}
    const r=slots.get(values[2]);return r?[project(r)]:[];
   }
   if(sql.includes('FROM "Company"'))return[company];
   if(sql.includes('FROM "Store"'))return[store];
   if(sql.includes('FROM "AutomaticReportAutomationGrant"'))return[{principalId:'sa'}];
   if(sql.includes('FROM "User"'))return[principal];
   if(sql.includes('FROM "CompanyModule"'))return[{active:true,startsAt:null,endsAt:null}];
   if(sql.includes('FROM "StorePaidModule"'))return[];
   if(sql.includes('FROM "AutomaticReportSettings"'))return[{configurationJson:configuration,version:1}];
   if(sql.includes('FROM "CashControlStoreRule"'))return[rule];
   if(sql.includes('FROM "CashShiftSession"'))return rows;
   throw new Error('Unhandled synthetic SQL: '+sql);
  }
 };
 const db={$transaction:async(fn,options)=>{assert.equal(options.isolationLevel,'ReadCommitted');events.push('begin');const before=structuredClone([...slots]);try{const result=await fn(tx);events.push('commit');return result}catch(e){slots.clear();for(const[k,v]of before)slots.set(k,v);events.push('rollback');throw e}}};
 const persistence={dispatchPolicyFingerprint,readLockedDispatchAuthorization:async()=>{events.push('authorization');return auth},putImmutablePayload:async(_tx,{payload})=>{events.push('payload-put');payloads.set(payload.payloadFingerprint,payload);return{created:true,payload}},readImmutablePayload:async(_tx,{payloadFingerprint})=>payloads.get(payloadFingerprint)};
 return {db,tx,persistence,events,auth,rows,company,store,principal,configuration,payloads,slots,activationProvider:()=>currentControl,setControl:value=>{currentControl=value}};
}
test('actual source/payload preparation fences configuration and binds real principal, consent and period',async()=>{
 const h=fixture(),read=createAutomaticReportEligibilityReader(h),c=await read.readContext(h.tx,scope,NOW);
 assert.equal(c.inputs.length,1);assert.equal(c.inputs[0].recipient,'recipient@example.invalid');assert.equal(c.inputs[0].periodFrom,'2026-10-21T04:00:00.000Z');
 const storeLock=h.events.findIndex(s=>s.startsWith('LOCK TABLE')&&s.includes('"test"."Store"'));
 const fenceLock=h.events.findIndex(s=>s.startsWith('LOCK TABLE')&&s.includes('"StoreLifecycleFence"'));
 const reportLock=h.events.findIndex(s=>s.startsWith('LOCK TABLE')&&s.includes('"AutomaticReportDeliverySlot"'));
 const lock=h.events.findIndex(s=>s.startsWith('LOCK TABLE "CompanyModule"'));
 assert.ok(storeLock>=0&&storeLock<fenceLock&&fenceLock<reportLock);
 assert.ok(reportLock<h.events.findIndex(s=>s.includes('FROM "Company"')));
 assert.ok(lock>h.events.findIndex(s=>s.includes('FROM "User"')));assert.ok(lock<h.events.findIndex(s=>s.includes('FROM "CompanyModule"')));assert.ok(h.events.findIndex(s=>s.includes('FROM "CashShiftSession"'))>lock);
 await h.persistence.putImmutablePayload(h.tx,{payload:c.payload});assert.equal((await read({tx:h.tx,companyId:'c',storeId:'s',input:c.inputs[0],now:NOW})).consentActive,true);
});
test('authoritative revocation/role/session/license/settings and activation changes cannot authorize',async()=>{
 for(const change of [h=>h.auth.recipients[0].consent.active=false,h=>h.auth.recipients[0].recipient.revokedAt=NOW,h=>h.auth.recipients[0].consent.consentedAt='2026-10-18T00:00:00.000Z',h=>h.principal.role='OWNER',h=>h.principal.sessionVersion++,h=>h.company.active=false,h=>h.store.active=false,h=>h.auth.grant.activationEpoch='changed',h=>h.auth.grant.lifecycleGeneration='0',h=>h.auth.policy.allowedFrequencies=[],h=>h.auth.grant.notBefore=NOW,h=>h.rows[2].status='OPEN',h=>h.setControl({...control,enabled:false})]){
  const h=fixture();change(h);await assert.rejects(createAutomaticReportEligibilityReader(h).readContext(h.tx,scope,NOW));
 }
});
test('start compares immutable input and exact stored bytes to freshly rebuilt source',async()=>{
 for(const change of [(h,c)=>h.payloads.set(c.payload.payloadFingerprint,{...c.payload,body:'corrupt'}),(h,c)=>h.rows[0].variance=-99,(h,c)=>c.inputs[0].snapshot.consentRevision=2]){
  const h=fixture(),read=createAutomaticReportEligibilityReader(h),c=await read.readContext(h.tx,scope,NOW);h.payloads.set(c.payload.payloadFingerprint,c.payload);change(h,c);
  await assert.rejects(read({tx:h.tx,companyId:'c',storeId:'s',input:c.inputs[0],now:NOW}));
 }
});
test('configuration first-insert lock busy fails before source and no fallback/retry',async()=>{
 const h=fixture();h.tx.$executeRaw=async()=>{throw Object.assign(new Error('busy'),{code:'55P03'})};await assert.rejects(createAutomaticReportEligibilityReader(h).readContext(h.tx,scope,NOW));assert.equal(h.events.some(s=>s.includes('FROM "CashShiftSession"')),false);
});
test('partial installer report-table contention refuses before authorization or financial source',async()=>{
 const h=fixture(),execute=h.tx.$executeRawUnsafe;
 h.tx.$executeRawUnsafe=async sql=>{if(sql.includes('"AutomaticReportDeliverySlot"'))throw Object.assign(new Error('busy'),{code:'55P03'});return execute(sql)};
 await assert.rejects(createAutomaticReportEligibilityReader(h).readContext(h.tx,scope,NOW),e=>e.code==='REPORT_DISPATCH_BUSY');
 assert.equal(h.events.includes('authorization'),false);assert.equal(h.events.some(s=>s.includes('FROM "Company"')||s.includes('FROM "CashShiftSession"')),false);
});
test('scope own-data validation never invokes getters or falls back to company',()=>{
 let reads=0;for(const raw of [null,{},Object.create(scope),{...scope,storeId:''},{...scope,frequency:'YEARLY'},{...scope,extra:true},{...scope,get storeId(){reads++;return 's'}}])assert.throws(()=>automaticReportScopeInput(raw));assert.equal(reads,0);
});
test('fresh consent cannot backfill an older period and activation changes during source work fail closed',async()=>{
 const h=fixture();h.auth.recipients[0].consent.consentedAt='2026-10-21T06:00:00.000Z';await assert.rejects(createAutomaticReportEligibilityReader(h).readContext(h.tx,scope,NOW));
 const fresh=fixture(),query=fresh.tx.$queryRaw;fresh.tx.$queryRaw=async(strings,...values)=>{const result=await query(strings,...values);if(strings.join('?').includes('FROM "CashShiftSession"'))fresh.setControl({...control,enabled:false});return result};
 await assert.rejects(createAutomaticReportEligibilityReader(fresh).readContext(fresh.tx,scope,NOW));
});

test('separate SuperAdmin authority prepares and starts a report without forged verification or mailbox consent',async()=>{
 const {administratorAuthorizationProof}=await import('../src/services/automatic-report-administrator-authorization.js');
 const {createDeliverySlot}=await import('../src/services/automatic-report-delivery-lifecycle.js');
 const h=fixture(),pair=h.auth.recipients[0];Object.assign(pair.recipient,{companyId:'c',storeId:'s',verifiedAt:null});Object.assign(pair.consent,{consentedBy:'report-superadmin:sa'});pair.consent.proofHash=administratorAuthorizationProof(pair.recipient,pair.consent);
 const read=createAutomaticReportEligibilityReader(h),c=await read.readContext(h.tx,scope,NOW);assert.equal(c.inputs.length,1);await h.persistence.putImmutablePayload(h.tx,{payload:c.payload});
 const assertion=await read({tx:h.tx,companyId:'c',storeId:'s',input:c.inputs[0],now:NOW});assert.equal(assertion.recipientVerified,false);assert.equal(assertion.consentActive,false);assert.equal(assertion.recipientAuthorizationBasis,'SUPER_ADMIN');assert.equal(assertion.administratorAuthorizationActive,true);
 assert.equal(createDeliverySlot(c.inputs[0],{now:NOW,current:assertion}).status,'PENDING');
 for(const change of [{administratorAuthorizationActive:false},{administratorAuthorizationActive:undefined},{recipientAuthorizationBasis:'OWNER'},{consentActive:true},{principalAuthorized:false}])assert.throws(()=>createDeliverySlot(c.inputs[0],{now:NOW,current:{...assertion,...change}}));
 pair.consent.active=false;await assert.rejects(read({tx:h.tx,companyId:'c',storeId:'s',input:c.inputs[0],now:NOW}),'revocation is checked at start, not only at preparation');
});
test('administrative proof does not bypass tamper, principal, lifecycle, cutoff, closed-day or source HOLD',async()=>{
 const {administratorAuthorizationProof}=await import('../src/services/automatic-report-administrator-authorization.js');
 for(const change of [h=>h.auth.recipients[0].consent.proofHash='f'.repeat(64),h=>h.auth.recipients[0].recipient.email='other@example.invalid',h=>h.auth.recipients[0].recipient.version='2',h=>h.auth.recipients[0].consent.lifecycleGeneration='2',h=>h.auth.grant.principalId='other',h=>h.auth.recipients[0].consent.consentedAt=NOW,h=>h.rows[1].status='OPEN']){
  const h=fixture(),pair=h.auth.recipients[0];Object.assign(pair.recipient,{companyId:'c',storeId:'s',verifiedAt:null});pair.consent.consentedBy='report-superadmin:sa';pair.consent.proofHash=administratorAuthorizationProof(pair.recipient,pair.consent);change(h);await assert.rejects(createAutomaticReportEligibilityReader(h).readContext(h.tx,scope,NOW));
 }
});
