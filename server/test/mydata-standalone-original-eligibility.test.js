import test from 'node:test';
import assert from 'node:assert/strict';
import {evaluateStandaloneDeliveryAttachment as evaluate} from '../src/lib/mydata-standalone-original-eligibility.js';

const scope={companyId:'company',storeId:'store',inboxId:'inbox'};
const scoped=(id,extra={})=>({id,companyId:scope.companyId,storeId:scope.storeId,inboxId:null,inboundId:null,attachmentId:null,documentId:null,attachmentFilename:null,mark:null,...extra});
const sourceNames=['inbound','inbox','jobs','documents','orders','aliases','paymentAllocations','attachments','transactions'];
const observedLinks={inbound:['inboxId','mark'],inbox:['attachmentId','status'],jobs:['attachmentId','inboxId','inboundId'],documents:['inboxId'],orders:['inboxId'],aliases:['inboxId','mark'],paymentAllocations:['documentId'],transactions:['attachmentFilename']};
function snapshot(){return {complete:true,available:Object.fromEntries(sourceNames.map(name=>[name,true])),facts:{
 inbound:[scoped('inbound',{inboxId:'inbox',invoiceType:'9.3',totalGross:'0.0000',totalNet:'0',totalVat:0,currency:'EUR',issuerVat:'099999999',counterpartVat:'088888888',mark:'40000000993',documentNumber:'93',rawPayload:{xml:'unchanged'}})],
 inbox:[scoped('inbox',{status:'RECEIVED',attachmentId:null})],jobs:[],documents:[],orders:[],aliases:[],paymentAllocations:[],attachments:[]},transactions:[]};}
const rows=(value,name)=>name==='transactions'?value.transactions:value.facts[name];
const reject=(value,reason)=>{const result=evaluate(value,scope);assert.equal(result.eligible,false);assert.equal(result.mode,null);assert.equal(result.replay,false);if(reason)assert.equal(result.reason,reason);};
function freeze(value){if(value&&typeof value==='object'){Object.freeze(value);for(const child of Object.values(value))freeze(child);}return value;}

test('pure prerequisite accepts a complete standalone zero delivery snapshot without mutation',()=>{
 const value=freeze(snapshot()),before=JSON.stringify(value);
 assert.deepEqual(evaluate(value,freeze({...scope})),{eligible:true,mode:'ATTACHMENT_ONLY',replay:false,reason:'STANDALONE_ZERO_MYDATA_9_3_V1'});
 assert.equal(JSON.stringify(value),before);
});
test('scoped existing PDF permits replay without treating metadata as new PDF verification',()=>{
 const value=snapshot();value.facts.inbox[0].attachmentId='pdf';value.facts.attachments.push(scoped('pdf',{mimeType:'application/pdf',hasContent:true,checksum:'a'.repeat(64)}));
 assert.equal(evaluate(freeze(value),scope).replay,true);
 for(const patch of [{mimeType:'text/html'},{hasContent:false},{checksum:'bad'}]){const changed=structuredClone(value);Object.assign(changed.facts.attachments[0],patch);reject(changed,'INVALID_ATTACHMENT');}
 const missing=structuredClone(value);missing.facts.attachments=[];reject(missing,'INVALID_ATTACHMENT');
 const shared=structuredClone(value);shared.facts.inbox.push(scoped('other',{status:'RECEIVED',attachmentId:'pdf'}));reject(shared,'SHARED_ATTACHMENT');
});
test('all source coverage, arrays, uniqueness and scope are mandatory even for unrelated rows',()=>{
 for(const flag of [false,undefined,'true',1]){const value=snapshot();value.complete=flag;reject(value,'INCOMPLETE_SNAPSHOT');}
 for(const name of sourceNames){
  for(const flag of [false,undefined,'true',1]){const value=snapshot();value.available[name]=flag;reject(value,'INCOMPLETE_SOURCE');}
  const missing=snapshot();if(name==='transactions')delete missing.transactions;else delete missing.facts[name];reject(missing,'INCOMPLETE_SOURCE');
  for(const patch of [{companyId:'foreign'},{storeId:'foreign'},{companyId:undefined},{storeId:undefined}]){const value=snapshot();rows(value,name).push(scoped('unrelated',patch));reject(value,'SCOPE_CONFLICT');}
  const duplicate=snapshot();rows(duplicate,name).push(scoped('duplicate'),scoped('duplicate'));reject(duplicate,'AMBIGUOUS_SOURCE');
  for(const malformed of [null,{},'row']){const value=snapshot();rows(value,name).push(malformed);reject(value,'AMBIGUOUS_SOURCE');}
 }
});
test('strict identity and exact zero on all three money fields prevent rounded or malformed exemptions',()=>{
 for(const key of ['totalGross','totalNet','totalVat']){
  for(const amount of ['0.004','-0.004','0.01',1,-1,null,undefined,false,'',' ','0e0','-0','NaN',{},[]]){const value=snapshot();value.facts.inbound[0][key]=amount;reject(value,'NOT_ZERO_DELIVERY_NOTE');}
  for(const amount of ['0','+00.000','0,000',0]){const value=snapshot();value.facts.inbound[0][key]=amount;assert.equal(evaluate(value,scope).eligible,true);}
 }
 for(const type of ['1.1','5.1','9.30',null,undefined]){const value=snapshot();value.facts.inbound[0].invoiceType=type;reject(value,'NOT_ZERO_DELIVERY_NOTE');}
 for(const patch of [{currency:'USD'},{currency:null},{issuerVat:'bad'},{counterpartVat:'bad'},{issuerVat:999999999},{counterpartVat:888888888},{mark:''},{mark:'abc'},{documentNumber:''}]){const value=snapshot();Object.assign(value.facts.inbound[0],patch);reject(value,patch.mark===''?'INCOMPLETE_LINK_METADATA':'INVALID_IDENTITY');}
});
test('pointer key presence including null or empty values refuses without sanitizing evidence',()=>{
 for(const key of ['originalJobId','mydataDraftOrderId','mydataDraftDocumentId','mydataPosReceipt','commonDraft'])for(const pointer of [null,'',false,{},'linked']){
  const value=snapshot();value.facts.inbound[0].rawPayload[key]=pointer;const before=JSON.stringify(value);reject(freeze(value),'IDENTITY_POINTER_PRESENT');assert.equal(JSON.stringify(value),before);
 }
 for(const raw of [null,[],false,'xml',new Date(),Object.create({originalJobId:null})]){const value=snapshot();value.facts.inbound[0].rawPayload=raw;reject(value,'IDENTITY_POINTER_PRESENT');}
 for(const state of ['IN_REVIEW','PROCESSED','DELETED']){const value=snapshot();value.facts.inbox[0].status=state;reject(value,'INBOX_NOT_RECEIVED');}
 const missingStatus=snapshot();missingStatus.facts.inbox[0].status=null;reject(missingStatus,'INCOMPLETE_LINK_METADATA');
});
test('unrelated scoped records do not manufacture a relationship and capped sources refuse',()=>{
 const value=snapshot();
 value.facts.inbound.push(scoped('other-source',{inboxId:'other-inbox',mark:'40000000994'}));
 value.facts.inbox.push(scoped('other-inbox',{attachmentId:null,status:'RECEIVED'}));
 for(const name of ['jobs','documents','orders','aliases','paymentAllocations','attachments','transactions'])rows(value,name).push(scoped('other-'+name,{inboxId:'other-inbox',inboundId:'other-source',attachmentId:'other-pdf',documentId:'other-document',attachmentFilename:'other-pdf',mark:'40000000994'}));
 assert.equal(evaluate(freeze(value),scope).eligible,true);
 const capped=snapshot();capped.transactions=Array.from({length:20001},(_,i)=>scoped('payment-'+i));reject(capped,'INCOMPLETE_SOURCE');
 for(const [name,fields] of Object.entries(observedLinks))for(const key of fields){
  const complete=snapshot(),records=rows(complete,name);
  if(!records.length)records.push(scoped('observed',Object.fromEntries(fields.map(field=>[field,null]))));
  // An observed null relationship is valid for unrelated records. Inbound and
  // inbox have nonnullable identity/status fields and use the existing fixture.
  assert.equal(evaluate(complete,scope).eligible,true);
  for(const invalid of [undefined,{},[],1,false,'']){
   const missing=structuredClone(complete);if(invalid===undefined)delete rows(missing,name)[0][key];else rows(missing,name)[0][key]=invalid;
   reject(missing,'INCOMPLETE_LINK_METADATA');
  }
 }
});
test('existing ordinary no-link proof rejects duplicate identities and each known relationship',()=>{
 const mutations=[
  value=>value.facts.inbound.push(scoped('second',{...value.facts.inbound[0],id:'second'})),
  value=>value.facts.inbound.push(scoped('other-inbound',{inboxId:'other',mark:value.facts.inbound[0].mark})),
  value=>{value.facts.inbound[0].draftOrderId='order';},
  value=>value.facts.aliases.push(scoped('alias',{inboxId:'inbox'})),
  value=>value.facts.aliases.push(scoped('alias',{mark:value.facts.inbound[0].mark})),
  value=>value.facts.jobs.push(scoped('job',{inboxId:'inbox'})),
  value=>value.facts.jobs.push(scoped('job',{inboundId:'inbound'})),
  value=>value.facts.documents.push(scoped('document',{inboxId:'inbox'})),
  value=>value.facts.orders.push(scoped('order',{inboxId:'inbox'})),
  value=>value.facts.paymentAllocations.push(scoped('allocation',{documentId:'inbound'})),
  value=>value.facts.paymentAllocations.push(scoped('allocation',{documentId:'inbox'})),
  value=>value.transactions.push(scoped('payment',{attachmentFilename:'inbox'})),
  value=>value.transactions.push(scoped('payment',{attachmentFilename:'inbound'})),
 ];
 for(const mutate of mutations){const value=snapshot();mutate(value);reject(value);}
 const attached=snapshot();attached.facts.inbox[0].attachmentId='pdf';attached.facts.attachments.push(scoped('pdf',{mimeType:'application/pdf',hasContent:true,checksum:'b'.repeat(64)}));
 for(const [name,extra] of [['jobs',{attachmentId:'pdf'}],['transactions',{attachmentFilename:'pdf'}]]){const value=structuredClone(attached);rows(value,name).push(scoped('linked',extra));reject(value);}
});
test('refusal diagnostics stay bounded and do not expose supplied source or financial fields',()=>{
 const value=snapshot();value.facts.inbound[0].rawPayload.originalJobId='private-identifier';value.secret='private-source-token';
 assert.deepEqual(evaluate(value,scope),{eligible:false,mode:null,replay:false,reason:'IDENTITY_POINTER_PRESENT'});
 for(const invalidScope of [null,{}, {...scope,companyId:''},{...scope,inboxId:' inbox'}, {...scope,storeId:1}])assert.equal(evaluate(value,invalidScope).reason,'INVALID_SCOPE');
 for(const invalid of [null,[],{}, {complete:true}])reject(invalid);
});
