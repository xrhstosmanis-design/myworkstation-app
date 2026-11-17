import test from 'node:test';
import assert from 'node:assert/strict';
import {Prisma} from '@prisma/client';
import {authorizeAdministratorRecipient,administratorAuthorizationProof,reportRecipientAuthority} from '../src/services/automatic-report-administrator-authorization.js';

test('promotion recipient authorization is event-scoped and preserves cash invitations',async()=>{
 const writes=[];
 const recipient={companyId:'c',storeId:'s',recipientId:'r',email:'mail@example.invalid',version:'1'};
 const context={tx:{$executeRaw:async(strings,...values)=>writes.push(Prisma.sql(strings,...values))},scope:{actorId:'admin',companyId:'c',storeId:'s'},actor:{id:'admin',role:'SUPER_ADMIN',sessionVersion:1},records:{recipients:[{recipient,consent:null}]},generation:'3',activation:{valid:true,enabled:false,epoch:'epoch',activationFingerprint:'fingerprint',issuedAt:'2026-11-01T00:00:00Z',notBefore:'2026-11-01T00:00:00Z'},now:new Date('2026-11-17T12:00:00Z'),reportType:'PROMOTION_RESULT'};
 const input={email:recipient.email,recipientId:'r',expectedRecipientVersion:1,expectedAuthorizationRevision:0,expectedGrantRevision:0,expectedPolicyRevision:0,allowedFrequencies:['EVENT'],explicitAuthorization:true};
 await assert.rejects(authorizeAdministratorRecipient(context,{...input,allowedFrequencies:['MONTHLY']}),{code:'REPORT_FREQUENCIES_INVALID'});
 assert.equal(writes.length,0);
 assert.equal((await authorizeAdministratorRecipient(context,input)).saved,true);
 assert.equal(writes.length,3);
 assert.match(writes[0].text,/INSERT INTO "AutomaticReportEventConsent"/);
 assert.match(writes[0].text,/ON CONFLICT \("companyId","storeId","reportType","recipientId"\)/);
 assert.ok(writes[0].values.includes('PROMOTION_RESULT'));
 assert.ok(writes.every(query=>!query.text.includes('challengeHash')));
 const consent={reportType:'PROMOTION_RESULT',revision:'1',recipientVersion:'1',active:true,lifecycleGeneration:'3',allowedFrequencies:['EVENT'],consentedBy:'report-superadmin:admin',consentedAt:context.now};
 consent.proofHash=administratorAuthorizationProof(recipient,consent);
 assert.equal(reportRecipientAuthority(recipient,consent,{generation:'3',principalId:'admin'}).basis,'SUPER_ADMIN');
 assert.equal(reportRecipientAuthority(recipient,{...consent,reportType:'OTHER'},{generation:'3',principalId:'admin'}),null);
});
