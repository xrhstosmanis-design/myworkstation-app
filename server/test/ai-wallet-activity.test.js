import test from 'node:test';
import assert from 'node:assert/strict';
import {walletActivityFromRequest,walletActivityForJob,publicWalletActivity,reservationWalletActivity} from '../src/services/ai-wallet-activity.js';

const req=()=>({user:{id:null,operatorId:'operator-a',companyId:'company-a',storeId:'store-a',tokenType:'STORE_OPERATOR',fullName:'Χειριστής Α',role:'MANAGER',terminalPos:'MAIN',operatorSessionId:'SECRET SESSION'},body:{actorId:'forged-owner',fullName:'FORGED',role:'OWNER',source:'Backoffice',secret:'PRIVATE PROMPT'}});
test('activity uses authenticated POS identity even for nullable User FK and never body names, roles, secrets or sessions',()=>{
 const activity=walletActivityFromRequest(req(),{storeId:'store-a',purpose:'PAYMENT_HEADER_READ'});
 assert.deepEqual(activity.actor,{id:'operator-a',name:'Χειριστής Α',role:'MANAGER',kind:'POS_OPERATOR',profile:null});
 assert.equal(activity.surface,'PAYMENT_ENTRY');assert.equal(activity.terminalPos,'MAIN');
 assert.doesNotMatch(JSON.stringify(activity),/FORGED|forged-owner|SECRET|PRIVATE|operatorSessionId/);
 const long=req();long.user.operatorId='x'.repeat(161);assert.equal(walletActivityFromRequest(long,{storeId:'store-a',purpose:'INVOICE_READ'}).actor,null);
 assert.throws(()=>walletActivityFromRequest(req(),{storeId:'foreign-store',purpose:'INVOICE_READ'}),e=>e.code==='AI_WALLET_SCOPE_DENIED');
});
test('support effective Owner and delegated staff retain their actual principal kind and session role',()=>{
 const support=walletActivityFromRequest({user:{id:'platform-user',companyId:'c',tokenType:'BACKOFFICE_USER',fullName:'Support',role:'OWNER',platformRole:'SUPER_ADMIN',isSuperAdmin:true}},{storeId:'s',purpose:'OWNER_ASSISTANT'});
 assert.equal(support.actor.role,'SUPER_ADMIN');assert.equal(support.actor.kind,'SUPPORT');
 const staff=walletActivityFromRequest({user:{id:'staff',companyId:'c',tokenType:'BACKOFFICE_USER',fullName:'Responsible',role:'EMPLOYEE',staffAccess:true},staffGrant:{profile:'MANAGER',capabilities:['cash.read']}},{storeId:'s',purpose:'INVOICE_ASSISTANT'});
 assert.equal(staff.actor.role,'EMPLOYEE');assert.equal(staff.actor.kind,'DELEGATED_USER');assert.equal(staff.actor.profile,'MANAGER');
 assert.doesNotMatch(JSON.stringify(staff),/cash.read|capabilities/);
});
test('owned background job preserves original initiator independently of executor and refuses foreign or forged snapshots',()=>{
 const original=walletActivityFromRequest(req(),{storeId:'store-a',purpose:'PAYMENT_INVOICE_READ',documentNumber:'SYNTHETIC-NEW-E'});
 const background=walletActivityFromRequest({user:{id:null,companyId:'company-a',storeId:'store-a',tokenType:'POS_BACKGROUND',fullName:'SYSTEM EXECUTOR'}},{storeId:'store-a',purpose:'PAYMENT_INVOICE_READ',jobId:'job-a',originalActivity:original});
 assert.deepEqual(background.actor,original.actor);assert.equal(background.execution,'BACKGROUND');assert.equal(background.documentNumber,'SYNTHETIC-NEW-E');assert.equal(background.jobId,'job-a');
 assert.equal(walletActivityForJob({companyId:'foreign',storeId:'foreign-store',purpose:'PAYMENT_INVOICE_READ'},original).actor,null);
 assert.equal(walletActivityForJob({companyId:'company-a',storeId:'store-a',purpose:'PAYMENT_INVOICE_READ'},null).actor,null);
 assert.equal(publicWalletActivity({...original,secret:'NO'},{companyId:'company-a',storeId:'store-a'}),null);
 assert.throws(()=>reservationWalletActivity(original,{companyId:'company-a',storeId:'foreign'}),e=>e.code==='AI_WALLET_INVALID_INPUT');
});
test('reservation metadata is copied and frozen; legacy missing context stays absent without invented historical identity',()=>{
 const a=walletActivityFromRequest(req(),{storeId:'store-a',purpose:'INVOICE_ASSISTANT',documentId:'document-a'});
 const snapshot=reservationWalletActivity(a,{companyId:'company-a',storeId:'store-a'});a.actor.name='Changed later';a.documentId='changed';
 assert.equal(snapshot.actor.name,'Χειριστής Α');assert.equal(snapshot.documentId,'document-a');assert.ok(Object.isFrozen(snapshot.actor));
 assert.equal(reservationWalletActivity(undefined,{companyId:'c',storeId:'s'}),null);assert.equal(publicWalletActivity(null,{companyId:'c',storeId:'s'}),null);
});
