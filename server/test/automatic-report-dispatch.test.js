import test from 'node:test';
import assert from 'node:assert/strict';
import {dispatchPolicyFingerprint} from '../src/services/automatic-report-dispatch-policy.js';
import {readActivation,ACTIVATION_SERVICE_ID} from '../src/services/automatic-report-activation.js';
import {createAutomaticReportDispatcher} from '../src/services/automatic-report-dispatch.js';
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
test('one ReadCommitted preparation transaction persists exact payload and slot, with no send',async()=>{
 const h=fixture();let sends=0;const d=createAutomaticReportDispatcher({...h,clock:()=>NOW,sendMail:async()=>{sends++}});const result=await d.prepare(scope);
 assert.equal(result.slots.length,1);assert.equal(result.slots[0].record.status,'PENDING');assert.equal(h.events.filter(v=>v==='begin').length,1);assert.equal(h.events.at(-1),'commit');assert.equal(sends,0);assert.equal(h.payloads.size,1);
});
test('actual dispatcher/repository/driver sends only after committed attempt and cannot resend terminal slot',async()=>{
 const h=fixture();let sends=0;const d=createAutomaticReportDispatcher({...h,clock:()=>NOW,sendMail:async m=>{sends++;assert.equal([...h.slots.values()][0].status,'ATTEMPTING');assert.equal(h.events.at(-1),'commit');assert.match(m.subject,/ΠΡΟΣΩΡΙΝΗ/);return{accepted:[m.to],rejected:[],messageId:'synthetic'}}});
 const result=await d.dispatch(scope);assert.equal(result.attempted,1);assert.equal(result.outcomes[0].outcome,'ACCEPTED');assert.equal([...h.slots.values()][0].status,'ACCEPTED');await d.dispatch(scope);assert.equal(sends,1);
});
test('default OFF and source HOLD cannot reach SMTP',async()=>{
 const h=fixture();let sends=0;const d=createAutomaticReportDispatcher({...h,clock:()=>NOW,sendMail:async()=>{sends++}});h.setControl({...control,enabled:false});assert.equal((await d.dispatch(scope)).status,'OFF');assert.equal(h.events.length,0);
 h.setControl(control);h.rows[1].status='OPEN';assert.equal((await d.dispatch(scope)).status,'HOLD');assert.equal(sends,0);
});
test('unproven SMTP acceptance persists UNKNOWN and repeated sweep cannot retry',async()=>{
 const h=fixture();let sends=0;const d=createAutomaticReportDispatcher({...h,clock:()=>NOW,sendMail:async()=>{sends++;return{messageId:'planned'}}});assert.equal((await d.dispatch(scope)).outcomes[0].outcome,'UNKNOWN');await d.dispatch(scope);assert.equal(sends,1);
});
