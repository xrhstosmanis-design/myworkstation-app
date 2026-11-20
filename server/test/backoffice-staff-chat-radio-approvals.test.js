import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import crypto from 'node:crypto';
import express from 'express';
import {z} from 'zod';
import {chatTopic,topicRow} from '../src/chat-topics.mjs';
import {mountChatGroups} from '../src/chat-groups.mjs';
import {searchChatMessages} from '../src/chat-search-forward.mjs';
import {enforceBackofficeStaff,requireStaffGrant,staffError} from '../src/services/backoffice-staff-access.js';
import {ownerRestrictedModuleKeys} from '../src/services/module-catalog.js';

const forbidden=()=>assert.fail('delegated read attempted DDL, audit/read receipt, provider, lifecycle, configuration or financial mutation');
const staff=()=>({id:'staff',companyId:'company',role:'EMPLOYEE',tokenType:'BACKOFFICE_USER',staffAccess:true,sessionId:'session',sessionVersion:0});
async function moduleRuntime(db){const source=await readFile(new URL('../src/middleware/module-access.js',import.meta.url),'utf8');return new Function('prisma','ownerRestrictedModuleKeys',source.replace(/^import .*;\s*$/gm,'').replace(/^export /gm,'')+'\nreturn {requireCompanyModule,requireStoreModule,companyModuleState,effectiveModuleEnabled,isPlatformSuperAdmin};')(db,ownerRestrictedModuleKeys);}
async function listen(db,path,router,guard){
 const app=express();app.use(express.json());app.use(async(req,res,next)=>{req.user=staff();try{await enforceBackofficeStaff(db,req,res);next()}catch(error){next(error)}});app.use(path,...(guard?[guard]:[]),router);app.use((error,_req,res,_next)=>res.status(error.status||500).json({error:error.message,code:error.code}));
 const server=await new Promise(resolve=>{const handle=app.listen(0,'127.0.0.1',()=>resolve(handle))});
 return {async request(suffix,{header='store',method='GET'}={}){const response=await fetch(`http://127.0.0.1:${server.address().port}${path}${suffix}`,{method,headers:{'x-backoffice-store-id':header}});return {status:response.status,body:await response.json()}},async close(){server.closeAllConnections();await new Promise(resolve=>server.close(resolve))}};
}
function evaluate(source,env){return new Function(...Object.keys(env),source.replace(/^import .*;\s*$/gm,'').replace('export default router;','return router;').replace(/^export /gm,''))(...Object.values(env))}

test('native chat reads preserve scoped metadata and validated attachment audit without receipts or writer rights',async()=>{
 let capabilities=['chat.read'],moduleActive=true,withdraw=false,moduleWithdraw=false,reads=0,audits=0,revokeAfterAudit=false,badChecksum=false;
 const pdf=Buffer.from('%PDF-1.7\nSynthetic attachment\n'),checksum=crypto.createHash('sha256').update(pdf).digest('hex');
 const message={id:'message',senderId:'sender',senderName:'Synthetic sender',category:'GENERAL',body:'Synthetic message',createdAt:'2026-11-18T10:00:00Z',inTimeline:true,pinned:false,hasAttachment:true,attachmentName:'synthetic.pdf'};
 const db={company:{findUnique:async()=>({id:'company',active:true,licenseStatus:'ACTIVE',modules:[{moduleKey:'STORE_CHAT',active:moduleActive}]})},store:{findUnique:async({where})=>where.id==='store'?{id:'store',companyId:'company',name:'Synthetic store'}:{id:where.id,companyId:'foreign',name:'Foreign'}},employee:{findMany:forbidden},$executeRaw:async(strings,...values)=>{assert.ok(strings.join('?').includes('INSERT INTO \"WorkforceAuditLog\"'));assert.ok(values.includes('STORE_CHAT_ATTACHMENT_OPENED'));assert.ok(values.includes('company'));assert.ok(values.includes('store'));audits++;if(revokeAfterAudit)capabilities=[];},
  $executeRawUnsafe:async sql=>{assert.equal(sql,"SET LOCAL statement_timeout = '1500ms'")},$transaction:async fn=>fn(db),
  $queryRawUnsafe:async(sql,...values)=>{assert.ok(sql.includes('WITH candidates AS MATERIALIZED'));assert.deepEqual(values.slice(0,2),['company','store']);assert.match(sql,/m\."companyId"=\$1 AND m\."storeId"=\$2/);reads++;if(withdraw)capabilities=[];if(moduleWithdraw)moduleActive=false;return [{...message}]},
  $queryRaw:async(strings,...values)=>{
   const sql=strings.join('?');if(sql.includes('FROM "BackofficeStaffAccount" a'))return [{mustChangePassword:false}];if(sql.includes('FROM "BackofficeStaffGrant" g'))return values[2]==='store'?[{profile:'AUDITOR',capabilities}]:[];if(sql.includes('FROM "StorePaidModule"'))return [];
   assert.ok(values.includes('company'));assert.ok(values.includes('store'));assert.equal(values.includes('foreign'),false);
   if(sql.includes('FROM "StoreChatMessage" WHERE "id"')){reads++;assert.ok(values.includes('message'));if(withdraw)capabilities=[];return [{attachmentName:'synthetic.pdf',attachmentMimeType:'application/pdf',attachmentSize:pdf.length,attachmentChecksum:badChecksum?'0'.repeat(64):checksum,attachmentData:pdf.toString('base64')}];}
   if(sql.includes('FROM "StoreChatSettings"'))return [{invoiceAiReaderEnabled:true,photosEnabled:true,pdfEnabled:true,downloadsEnabled:true,employeeTaskCreationEnabled:true}];
   assert.ok(sql.includes('WITH timeline AS MATERIALIZED'));assert.match(sql,/candidate\."companyId"=\? AND candidate\."storeId"=\?/);assert.doesNotMatch(sql,/ AS "attachmentData"|SELECT.*m\."attachmentData"[, ]/);reads++;if(withdraw)capabilities=[];if(moduleWithdraw)moduleActive=false;return [{...message}];
  }
 };
 const modules=await moduleRuntime(db),source=await readFile(new URL('../src/routes/store-chat.js',import.meta.url),'utf8');
 const env={chatTopic,topicRow,mountChatGroups,searchChatMessages,forwardChatMessage:forbidden,forwardInput:forbidden,mobileChatStores:forbidden,ensureStoreChatInteractions:forbidden,chatSendContext:forbidden,acknowledgeChatDelivery:forbidden,setChatReaction:forbidden,sendNativeChatPush:forbidden,nativePushStatus:forbidden,renewChatOperatorSession:forbidden,parseVoiceAttachment:forbidden,parseVideoAttachment:forbidden,crypto,express,prisma:db,companyModuleState:modules.companyModuleState,effectiveModuleEnabled:modules.effectiveModuleEnabled,isPlatformSuperAdmin:modules.isPlatformSuperAdmin,requireStoreModule:modules.requireStoreModule,ensureStoreChatPushSchema:forbidden,saveStoreChatPushSubscription:forbidden,sendStoreChatPush:forbidden,storeChatPushPublicKey:forbidden,requireStaffGrant,staffError};
 const router=evaluate(source,env),app=await listen(db,'/api/store-chat',router,modules.requireStoreModule('STORE_CHAT'));
 try{
  for(const path of ['/stores/store/messages?topic=GENERAL','/stores/store/messages/search?q=Synthetic&topic=GENERAL']){
   capabilities=['chat.read'];moduleActive=true;const result=await app.request(path);assert.equal(result.status,200,JSON.stringify(result.body));assert.equal(result.body.companyId,'company');assert.equal(result.body.storeId,'store');assert.equal(result.body.rows[0].body,'Synthetic message');
   if(!path.includes('/search'))for(const value of Object.values(result.body.permissions))assert.equal(value,false);
   const before=reads;for(const input of [{path:path.replace('/store/','/foreign/'),header:'foreign'},{path:path.replace('/store/','/foreign/')},{path,header:''},{path,method:'POST'},{path:'/stores/store/messages/message/attachment?download=1'},{path:'/stores/store/messages/delivered',method:'POST'},{path:'/stores/store/messages/message/read',method:'POST'},{path:'/stores/store/forward-targets'},{path:'/stores/store/messages/message/forward',method:'POST'},{path:'/stores/store/push-key'}]){const {path:target,...options}=input;assert.equal((await app.request(target,options)).status,403,JSON.stringify(input))}assert.equal(reads,before);
   capabilities=['pending.read'];assert.equal((await app.request(path)).status,403);capabilities=['chat.read'];moduleActive=false;assert.equal((await app.request(path)).status,403);moduleActive=true;
   moduleWithdraw=true;const disabled=await app.request(path);assert.equal(disabled.status,403);assert.equal(Object.hasOwn(disabled.body,'rows'),false);moduleWithdraw=false;moduleActive=true;
   withdraw=true;const revoked=await app.request(path);assert.equal(revoked.status,403);assert.equal(Object.hasOwn(revoked.body,'rows'),false);withdraw=false;
  }
  capabilities=['chat.read'];assert.equal((await app.request('/stores/store/messages/search?q=x')).status,400);assert.equal((await app.request('/stores/store/messages?topic=INVALID')).status,400);
  const attachmentPath='/stores/store/messages/message/attachment';capabilities=['chat.read'];const attachment=await app.request(attachmentPath);assert.equal(attachment.status,200,JSON.stringify(attachment.body));assert.equal(attachment.body.companyId,'company');assert.equal(attachment.body.storeId,'store');assert.equal(attachment.body.messageId,'message');assert.equal(attachment.body.dataUrl,'data:application/pdf;base64,'+pdf.toString('base64'));assert.equal(audits,1);
  badChecksum=true;const corrupt=await app.request(attachmentPath);assert.ok([400,409].includes(corrupt.status),JSON.stringify(corrupt));assert.equal(Object.hasOwn(corrupt.body,'dataUrl'),false);assert.equal(audits,1);badChecksum=false;
  withdraw=true;const revokedPreview=await app.request(attachmentPath);assert.equal(revokedPreview.status,403);assert.equal(Object.hasOwn(revokedPreview.body,'dataUrl'),false);assert.equal(audits,1);withdraw=false;capabilities=['chat.read'];
  revokeAfterAudit=true;const finalRevoked=await app.request(attachmentPath);assert.equal(finalRevoked.status,403);assert.equal(Object.hasOwn(finalRevoked.body,'dataUrl'),false);assert.equal(audits,2);revokeAfterAudit=false;
 }finally{await app.close()}
});

test('native radio read returns only allowed station names and state with no playback URLs, catalog or persistence',async()=>{
 let capabilities=['radio.read'],moduleActive=true,nativeModuleActive=true,withdraw=false,moduleWithdraw=false,reads=0;
 const db={company:{findUnique:async()=>({id:'company',active:true,licenseStatus:'ACTIVE',modules:[{moduleKey:'STORE_MODE',active:true},{moduleKey:'ONLINE_RADIO',active:moduleActive}]})},store:{findFirst:async({where})=>where.id==='store'&&where.companyId==='company'&&where.active?{id:'store',name:'Synthetic store',companyId:'company'}:null},$transaction:forbidden,$executeRaw:forbidden,$executeRawUnsafe:forbidden,
  $queryRaw:async(strings,...values)=>{
   const sql=strings.join('?');if(sql.includes('FROM "BackofficeStaffAccount" a'))return [{mustChangePassword:false}];if(sql.includes('FROM "BackofficeStaffGrant" g'))return values[2]==='store'?[{profile:'AUDITOR',capabilities}]:[];
   if(sql.includes('SELECT EXISTS(SELECT 1 FROM "StorePaidModule"')){assert.ok(values.includes('company'));assert.ok(values.includes('store'));return [{enabled:nativeModuleActive}];}
   if(sql.includes('FROM "StorePaidModule"'))return [];
   reads++;assert.equal(values.includes('foreign'),false);
   if(sql.includes('FROM "StoreOnlineRadioConfig"')){assert.ok(values.includes('company'));assert.ok(values.includes('store'));return [{enabled:true,allowedStationIds:['station']}];}
   if(sql.includes('FROM "PosOnlineRadioState"')){assert.ok(values.includes('company'));assert.ok(values.includes('store'));return [{stationId:'station',volume:0.4}];}
   assert.ok(sql.includes('FROM "OnlineRadioStation"'));assert.match(sql,/"id"=ANY\(/);assert.ok(values.some(value=>Array.isArray(value)&&value[0]==='station'));assert.doesNotMatch(sql,/streamUrl|SELECT \*/);if(withdraw)capabilities=[];if(moduleWithdraw)nativeModuleActive=false;return [{id:'station',name:'Synthetic station'}];
  }
 };
 const modules=await moduleRuntime(db),source=await readFile(new URL('../src/routes/store-pos-catalog.js',import.meta.url),'utf8');
 const env={packageCatalog:forbidden,revalidateCostRequest:forbidden,customerSearchScope:forbidden,readLifecycleGeneration:forbidden,Router:express.Router,crypto,prisma:db,advancedOnlineProductSearch:forbidden,z,getStoreLabelSettings:forbidden,registerPermanentPriceRoutes:()=>{},registerPosNewProductRoutes:()=>{},posNewProductAllowed:forbidden,requireStaffGrant,staffError};
 const router=evaluate(source,env),app=await listen(db,'/api/store-pos',router,modules.requireCompanyModule('STORE_MODE'));
 try{
  const path='/stores/store/online-radio',result=await app.request(path);assert.equal(result.status,200,JSON.stringify(result.body));assert.equal(result.body.companyId,'company');assert.equal(result.body.storeId,'store');assert.equal(result.body.stations[0].name,'Synthetic station');assert.equal(result.body.state.volume,0.4);assert.equal(JSON.stringify(result.body).includes('streamUrl'),false);assert.equal(Object.hasOwn(result.body,'availableStations'),false);
  const before=reads;for(const input of [{path:'/stores/foreign/online-radio',header:'foreign'},{path:'/stores/foreign/online-radio'},{path,header:''},{path:'/stores/store/online-radio/config',method:'PUT'},{path:'/stores/store/online-radio/state',method:'PUT'},{path:'/stores/store/products'}]){const {path:target,...options}=input;assert.equal((await app.request(target,options)).status,403,JSON.stringify(input))}assert.equal(reads,before);
  capabilities=['printers.read'];assert.equal((await app.request(path)).status,403);capabilities=['radio.read'];moduleActive=false;assert.equal((await app.request(path)).status,403);moduleActive=true;nativeModuleActive=false;assert.equal((await app.request(path)).status,403);nativeModuleActive=true;
  moduleWithdraw=true;const disabled=await app.request(path);assert.equal(disabled.status,403);assert.equal(Object.hasOwn(disabled.body,'stations'),false);moduleWithdraw=false;nativeModuleActive=true;
  withdraw=true;const revoked=await app.request(path);assert.equal(revoked.status,403);assert.equal(Object.hasOwn(revoked.body,'stations'),false);withdraw=false;
 }finally{await app.close()}
});

test('native pending approval lists retain scoped calculations without bootstrap, company selectors or confirmation authority',async()=>{
 let capabilities=['approvals.read'],moduleActive=true,withdraw=false,moduleWithdraw=false,reads=0;
 const db={company:{findUnique:async()=>({id:'company',active:true,licenseStatus:'ACTIVE',modules:[{moduleKey:'STORE_MODE',active:true},{moduleKey:'CASH_CONTROL',active:moduleActive}]})},$transaction:forbidden,$executeRaw:forbidden,$executeRawUnsafe:forbidden,
  $queryRaw:async(strings,...values)=>{
   const sql=strings.join('?');if(sql.includes('FROM "BackofficeStaffAccount" a'))return [{mustChangePassword:false}];if(sql.includes('FROM "BackofficeStaffGrant" g'))return values[2]==='store'?[{profile:'AUDITOR',capabilities}]:[];if(sql.includes('FROM "StorePaidModule"'))return [];
   reads++;assert.ok(values.includes('company'));assert.ok(values.includes('store'));assert.equal(values.includes('foreign'),false);if(withdraw)capabilities=[];if(moduleWithdraw)moduleActive=false;
   if(sql.includes('FROM "SupplierPaymentSettlement" ss')&&!sql.includes('FROM "BankLedgerEntry" e')){assert.match(sql,/t\."storeId"=ss\."storeId"/);assert.match(sql,/p\."storeId"=ss\."storeId"/);return [{id:'settlement',amount:'10.00',hasAttachment:true,advanceDeclared:true,allocations:[{purchaseDocumentId:'document',documentNumber:'A1',amount:'8.00'}]}];}
   if(sql.includes('FROM "OtherExpenseReview" er')&&!sql.includes('FROM "BankLedgerEntry" e')){assert.match(sql,/t\."storeId"=er\."storeId"/);return [{id:'expense',amount:'3.20',description:'Synthetic expense',paymentMethod:'CASH',hasAttachment:true}];}
   assert.ok(sql.includes('FROM "BankLedgerEntry" e'));assert.match(sql,/a\."companyId"=e\."companyId"/);assert.match(sql,/a\."storeId"=e\."storeId"/);return [{id:'bank-entry',amount:'4.20',status:'PENDING_REVIEW'}];
  }
 };
 const source=await readFile(new URL('../src/routes/store-transactions.js',import.meta.url),'utf8');
 const env={findMyDataPurchase:forbidden,hasMyDataPurchaseLines:forbidden,findExistingInvoicePaymentReview:forbidden,lockInvoiceStore:forbidden,requireStaffAction:forbidden,supplierAdvanceContext:forbidden,associateExpenseAsAdvance:forbidden,allocateSupplierAdvance:forbidden,requireStaffGrant,staffError,createPendingInvoicePayment:forbidden,readPendingInvoices:forbidden,capturePendingInvoice:forbidden,supplierCreditCashContext:forbidden,applySupplierCreditCash:forbidden,assertCreditCashUnlinked:forbidden,executeHotTableBootstrap:forbidden,Router:express.Router,crypto,z,prisma:db,auth:(_req,_res,next)=>next(),sendLedgerAlertEmail:forbidden,expenseReviewStatus:forbidden,ownerSupplierProofError:forbidden,readBankDepositProofPdf:forbidden,readSupplierProofPdf:forbidden,supplierProofMismatch:forbidden,recordCashTransfer:forbidden,canCorrectPayment:forbidden,correctPaymentAmount:forbidden,paymentCorrectionContext:forbidden};
 const router=evaluate(source,env),app=await listen(db,'/api/transactions',router);
 try{
  for(const kind of ['supplier-settlements','other-expenses','bank-ledger']){
   capabilities=['approvals.read'];moduleActive=true;const path='/'+kind+'/review?storeId=store',result=await app.request(path);assert.equal(result.status,200,JSON.stringify(result.body));assert.equal(result.body.companyId,'company');assert.equal(result.body.storeId,'store');assert.equal(result.body.items.length,1);assert.equal(Object.hasOwn(result.body,'companies'),false);assert.equal(Object.hasOwn(result.body,'stores'),false);
   if(kind==='supplier-settlements'){assert.equal(result.body.items[0].amount,10);assert.equal(result.body.items[0].automaticCheck.allocationTotal,8);assert.equal(result.body.items[0].advanceAmount,2)}else if(kind==='other-expenses'){assert.equal(result.body.items[0].amount,3.2);assert.equal(result.body.items[0].automaticCheck.matched,true)}else assert.equal(result.body.items[0].amount,4.2);
   const before=reads;for(const input of [{path:'/'+kind+'/review'},{path:path.replace('storeId=store','storeId=foreign'),header:'foreign'},{path:path.replace('storeId=store','storeId=foreign')},{path:path+'&companyId=foreign'},{path,header:''},{path,method:'POST'},{path:'/'+kind+'/id/review',method:'POST'},{path:'/supplier-settlements/id/attachment'},{path:'/other-expenses/id/supplier-advance'},{path:'/bank-ledger/summary?storeId=store'}]){const {path:target,...options}=input;assert.equal((await app.request(target,options)).status,403,JSON.stringify(input))}assert.equal(reads,before);
   capabilities=['payments.read'];assert.equal((await app.request(path)).status,403);capabilities=['approvals.read'];moduleActive=false;assert.equal((await app.request(path)).status,403);moduleActive=true;
   moduleWithdraw=true;const disabled=await app.request(path);assert.equal(disabled.status,403);assert.equal(Object.hasOwn(disabled.body,'items'),false);moduleWithdraw=false;moduleActive=true;
   withdraw=true;const revoked=await app.request(path);assert.equal(revoked.status,403);assert.equal(Object.hasOwn(revoked.body,'items'),false);withdraw=false;
  }
 }finally{await app.close()}
});
