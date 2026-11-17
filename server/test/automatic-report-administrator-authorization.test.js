import test from 'node:test';
import assert from 'node:assert/strict';
import {Prisma} from '@prisma/client';
import {administratorAuthorizationProof,reportRecipientAuthority,authorizeAdministratorRecipient,administratorRecipientSchema} from '../src/services/automatic-report-administrator-authorization.js';

function proof(){const recipient={companyId:'c',storeId:'s',recipientId:'r',email:'mail@example.invalid',version:'1',verifiedAt:null},authorization={revision:'2',recipientVersion:'1',active:true,lifecycleGeneration:'3',allowedFrequencies:['DAILY','MONTHLY'],consentedBy:'report-superadmin:admin',consentedAt:'2026-11-01T07:00:00.000Z'};authorization.proofHash=administratorAuthorizationProof(recipient,authorization);return{recipient,authorization}}
test('explicit administrator provenance authorizes without pretending mailbox verification or recipient consent',()=>{
 const {recipient:r,authorization:c}=proof();assert.deepEqual(reportRecipientAuthority(r,c,{generation:'3',principalId:'admin'}),{basis:'SUPER_ADMIN',authorizedBy:'admin',authorizedAt:c.consentedAt});assert.equal(r.verifiedAt,null);
 for(const field of ['companyId','storeId','recipientId','email','version'])assert.equal(reportRecipientAuthority({...r,[field]:'changed'},c,{generation:'3',principalId:'admin'}),null,field);
 for(const change of [{revision:'3'},{recipientVersion:'2'},{active:false},{revokedAt:c.consentedAt},{lifecycleGeneration:'4'},{allowedFrequencies:['DAILY']},{consentedBy:'report-superadmin:other'},{consentedAt:'2026-11-01T08:00:00.000Z'},{proofHash:'a'.repeat(64)}])assert.equal(reportRecipientAuthority(r,{...c,...change},{generation:'3',principalId:'admin'}),null,JSON.stringify(change));
 assert.equal(reportRecipientAuthority(r,c,{generation:'3',principalId:'other'}),null);assert.equal(reportRecipientAuthority({...r,revokedAt:c.consentedAt},c),null);
 assert.equal(reportRecipientAuthority({...r,verifiedAt:c.consentedAt},{...c,proofHash:'0'.repeat(64)}),null,'invalid admin proof never falls back to verified mailbox');
});
test('legacy recipient proof remains distinct and unverified addresses never auto-promote',()=>{
 const {recipient:r,authorization:c}=proof(),legacy={...c,consentedBy:'report-recipient:r'};
 assert.equal(reportRecipientAuthority(r,legacy),null);assert.equal(reportRecipientAuthority({...r,verifiedAt:c.consentedAt},legacy).basis,'RECIPIENT');
 assert.equal(reportRecipientAuthority(r,null),null);
});
test('administrative Save requires explicit current SuperAdmin and rejects injected authority/duplicate periods before writes',async()=>{
 const input={email:'mail@example.invalid',expectedRecipientVersion:0,expectedAuthorizationRevision:0,expectedGrantRevision:0,expectedPolicyRevision:0,allowedFrequencies:['DAILY'],explicitAuthorization:true};
 assert.throws(()=>administratorRecipientSchema.parse({...input,actorId:'forged'}));assert.throws(()=>administratorRecipientSchema.parse({...input,explicitAuthorization:false}));
 const tx={$queryRaw:async()=>assert.fail('no read'),$executeRaw:async()=>assert.fail('no write')},base={tx,scope:{actorId:'admin',companyId:'c',storeId:'s'},actor:{id:'admin',role:'OWNER'},records:{recipients:[]},now:new Date('2026-11-01T08:00:00Z')};
 await assert.rejects(authorizeAdministratorRecipient(base,input),{code:'REPORT_SUPER_ADMIN_REQUIRED'});
 await assert.rejects(authorizeAdministratorRecipient({...base,actor:{id:'admin',role:'SUPER_ADMIN'}},{...input,allowedFrequencies:['DAILY','DAILY']}),{code:'REPORT_RECIPIENT_INVALID'});
 await assert.rejects(authorizeAdministratorRecipient({...base,actor:{id:'admin',role:'SUPER_ADMIN'}},input),{code:'REPORT_ACTIVATION_REQUIRED'});
});

test('supplier approval writes only monthly records for its report type',async()=>{
 const {recipient}=proof();
 const writes=[];
 const tx={$executeRaw:async(strings,...values)=>writes.push(Prisma.sql(strings,...values))};
 const context={tx,scope:{actorId:'admin',companyId:'c',storeId:'s'},actor:{id:'admin',role:'SUPER_ADMIN',sessionVersion:1},records:{recipients:[{recipient,consent:null}]},generation:'3',activation:{valid:true,enabled:true,epoch:'epoch',activationFingerprint:'fingerprint',issuedAt:'2026-11-01T00:00:00Z',notBefore:'2026-11-01T00:00:00Z'},now:new Date('2026-11-16T21:00:00Z'),reportType:'SUPPLIER_COMPARISON'};
 const input={email:recipient.email,recipientId:recipient.recipientId,expectedRecipientVersion:1,expectedAuthorizationRevision:0,expectedGrantRevision:0,expectedPolicyRevision:0,allowedFrequencies:['MONTHLY'],explicitAuthorization:true};
 await assert.rejects(authorizeAdministratorRecipient(context,{...input,allowedFrequencies:['DAILY']}),{code:'REPORT_FREQUENCIES_INVALID'});
 assert.equal(writes.length,0);
 assert.equal((await authorizeAdministratorRecipient(context,input)).saved,true);
 assert.equal(writes.length,3);
 assert.match(writes[0].text,/^INSERT INTO "AutomaticReportSupplierComparisonConsent"/);
 assert.match(writes[1].text,/^INSERT INTO "AutomaticReportAutomationGrant"/);
 assert.match(writes[2].text,/^INSERT INTO "AutomaticReportDispatchPolicy"/);
 for(const query of writes.slice(1)){
  assert.match(query.text,/"reportType"/);
  assert.ok(query.values.includes('SUPPLIER_COMPARISON'));
 }
});
