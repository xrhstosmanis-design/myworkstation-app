import test from 'node:test';
import assert from 'node:assert/strict';
import {decideIncidentTransition,INCIDENT_STATUSES,IncidentPolicyError} from '../src/services/installation-support-incident-policy.js';

const scope={companyId:'company-a',storeId:'store-a',actorId:'user-a'};
const state=(status='NEW',version=0)=>({id:'incident-a',companyId:'company-a',storeId:'store-a',status,version});
const req=(targetStatus,extra={})=>({operationId:'operation-0001',expectedVersion:0,targetStatus,...extra});
const decide=(incident,request,extra={})=>decideIncidentTransition({scope,incident,request,receiptCheck:{status:'NOT_FOUND'},...extra});
const throwsCode=(fn,code)=>assert.throws(fn,error=>error instanceof IncidentPolicyError&&error.code===code);
const allowed={NEW:['IN_REVIEW'],IN_REVIEW:['IN_PROGRESS','WAITING'],IN_PROGRESS:['WAITING','AWAITING_CONFIRMATION'],WAITING:['IN_PROGRESS','AWAITING_CONFIRMATION'],AWAITING_CONFIRMATION:['CLOSED'],CLOSED:['IN_REVIEW']};
const details=(from,to)=>to==='CLOSED'?{resolution:'Αντικατάσταση εκτυπωτή',confirmer:'Χειριστής Α'}:from==='CLOSED'?{reason:'Το σφάλμα επανεμφανίστηκε'}:{};

test('all allowed edges advance exactly once and all other status pairs refuse',()=>{
  for(const from of INCIDENT_STATUSES)for(const to of INCIDENT_STATUSES){
    const input=req(to,details(from,to));
    if(allowed[from].includes(to)){const result=decide(state(from),input);assert.equal(result.decision,'TRANSITION');assert.deepEqual(result.result,{status:to,version:1});assert.deepEqual(result.audit,{actorId:'user-a',from,to,fields:Object.keys(input).filter(x=>['reason','resolution','confirmer'].includes(x))});}
    else throwsCode(()=>decide(state(from),input),'INVALID_TRANSITION');
  }
});

test('closing requires a factual resolution and named confirmer; same actor is permitted',()=>{
  throwsCode(()=>decide(state('AWAITING_CONFIRMATION'),req('CLOSED')),'CLOSE_EVIDENCE_REQUIRED');
  throwsCode(()=>decide(state('AWAITING_CONFIRMATION'),req('CLOSED',{resolution:'  ',confirmer:'Χρήστος'})),'INVALID_RESOLUTION');
  throwsCode(()=>decide(state('AWAITING_CONFIRMATION'),req('CLOSED',{resolution:'Επιλύθηκε',confirmer:' '})),'INVALID_CONFIRMER');
  const result=decide(state('AWAITING_CONFIRMATION'),req('CLOSED',{resolution:'  Ελέγχθηκε εκτυπωτής  ',confirmer:' user-a '}));
  assert.equal(result.receipt.operation.request.resolution,'Ελέγχθηκε εκτυπωτής');assert.equal(result.receipt.operation.request.confirmer,'user-a');
  assert.equal(decide(state('AWAITING_CONFIRMATION'),req('CLOSED',{resolution:'ΟΚ',confirmer:'Α'})).decision,'TRANSITION');
  assert.doesNotMatch(JSON.stringify(result.audit),/εκτυπωτής|Ελέγχθηκε/);
});

test('reopening requires a reason and no other transition accepts one',()=>{
  throwsCode(()=>decide(state('CLOSED'),req('IN_REVIEW')),'REOPEN_REASON_REQUIRED');
  throwsCode(()=>decide(state('CLOSED'),req('IN_REVIEW',{reason:' '})),'INVALID_REASON');
  assert.equal(decide(state('CLOSED'),req('IN_REVIEW',{reason:'α'})).decision,'TRANSITION');
  const result=decide(state('CLOSED'),req('IN_REVIEW',{reason:'  Νέα εμφάνιση  '}));assert.equal(result.receipt.operation.request.reason,'Νέα εμφάνιση');
  throwsCode(()=>decide(state('NEW'),req('IN_REVIEW',{reason:'Δεν επιτρέπεται εδώ'})),'UNEXPECTED_REOPEN_REASON');
});

test('scope, identity, version, status and input shape fail closed',()=>{
  throwsCode(()=>decide(state(),req('IN_REVIEW'),{scope:{...scope,actorId:''}}),'INVALID_ACTOR');
  throwsCode(()=>decide(state(),req('IN_REVIEW'),{scope:{...scope,companyId:'foreign'}}),'INCIDENT_SCOPE_MISMATCH');
  throwsCode(()=>decide(state(),req('IN_REVIEW'),{scope:{...scope,storeId:'foreign'}}),'INCIDENT_SCOPE_MISMATCH');
  throwsCode(()=>decide(state('NEW',3),req('IN_REVIEW')),'VERSION_CONFLICT');
  throwsCode(()=>decide(state(),req('UNKNOWN')),'INVALID_STATUS');
  throwsCode(()=>decide(state(),{...req('IN_REVIEW'),expectedVersion:Number.MAX_SAFE_INTEGER}),'VERSION_EXHAUSTED');
  assert.equal(decide(state('NEW',Number.MAX_SAFE_INTEGER-1),{...req('IN_REVIEW'),expectedVersion:Number.MAX_SAFE_INTEGER-1}).result.version,Number.MAX_SAFE_INTEGER);
  throwsCode(()=>decide(state(),{...req('IN_REVIEW'),password:'secret'}),'INVALID_FIELDS');
  throwsCode(()=>decide(state(),req('IN_REVIEW',{reason:'line\nbreak'})),'INVALID_REASON');
  throwsCode(()=>decide(state(),req('IN_REVIEW',{reason:'\nabc'})),'INVALID_REASON');
  throwsCode(()=>decide(state(),req('IN_REVIEW',{reason:'x'.repeat(1001)})),'INVALID_REASON');
  throwsCode(()=>decide(state(),req('IN_REVIEW',{reason:' '.repeat(1001)+'x'})),'INVALID_REASON');
  throwsCode(()=>decide(state(),req('IN_REVIEW',{resolution:'unneeded',confirmer:'user'})),'UNEXPECTED_CLOSE_EVIDENCE');
});

test('no receipt lookup cannot certify absence and causes no transition',()=>{
  const input={scope,incident:state(),request:req('IN_REVIEW')};
  assert.deepEqual(decideIncidentTransition(input),{decision:'RECEIPT_REQUIRED'});
  assert.deepEqual(decideIncidentTransition({...input,receiptCheck:{status:'UNKNOWN'}}),{decision:'RECEIPT_REQUIRED'});
  throwsCode(()=>decideIncidentTransition({...input,receiptCheck:{status:'UNKNOWN',receipt:{}}}),'INVALID_RECEIPT_CHECK');
  assert.equal(decideIncidentTransition({...input,receiptCheck:{status:'NOT_FOUND'}}).decision,'TRANSITION');
});

test('trusted exact receipt permits replay after further changes without another mutation',()=>{
  const input=req('IN_REVIEW'),first=decide(state(),input);
  const replay=decide(state('IN_PROGRESS',7),input,{receiptCheck:{status:'FOUND',receipt:first.receipt}});
  assert.deepEqual(replay,{decision:'REPLAY',result:{status:'IN_REVIEW',version:1}});
  assert.equal(Object.hasOwn(replay,'audit'),false);assert.equal(Object.hasOwn(replay,'receipt'),false);
  throwsCode(()=>decide(state(),req('WAITING'),{receiptCheck:{status:'FOUND',receipt:first.receipt}}),'IDEMPOTENCY_CONFLICT');
  throwsCode(()=>decide(state(),input,{scope:{...scope,actorId:'user-b'},receiptCheck:{status:'FOUND',receipt:first.receipt}}),'IDEMPOTENCY_CONFLICT');
  throwsCode(()=>decide({...state(),id:'incident-b'},input,{receiptCheck:{status:'FOUND',receipt:first.receipt}}),'IDEMPOTENCY_CONFLICT');
  const r=first.receipt,ordered={result:r.result,operation:{request:{targetStatus:r.operation.request.targetStatus,expectedVersion:r.operation.request.expectedVersion,operationId:r.operation.request.operationId},scope:{actorId:'user-a',storeId:'store-a',companyId:'company-a'},incidentId:'incident-a'}};
  assert.equal(decide(state('IN_PROGRESS',7),input,{receiptCheck:{receipt:ordered,status:'FOUND'}}).decision,'REPLAY');
  throwsCode(()=>decide(state(),input,{receiptCheck:{status:'FOUND',receipt:{...first.receipt,result:{status:'CLOSED',version:1}}}}),'INVALID_RECEIPT');
  const badRequest={...first.receipt.operation.request,reason:undefined},badOperation={...first.receipt.operation,request:badRequest};
  throwsCode(()=>decide(state(),input,{receiptCheck:{status:'FOUND',receipt:{...first.receipt,operation:badOperation}}}),'IDEMPOTENCY_CONFLICT');
});

test('receipt cannot replay against older or inconsistent same-version incident state',()=>{
  const input=req('IN_REVIEW'),first=decide(state(),input),check={receiptCheck:{status:'FOUND',receipt:first.receipt}};
  throwsCode(()=>decide(state('NEW',0),input,check),'RECEIPT_STATE_MISMATCH');
  throwsCode(()=>decide(state('WAITING',1),input,check),'RECEIPT_STATE_MISMATCH');
  assert.deepEqual(decide(state('IN_REVIEW',1),input,check),{decision:'REPLAY',result:{status:'IN_REVIEW',version:1}});
  assert.deepEqual(decide(state('CLOSED',7),input,check),{decision:'REPLAY',result:{status:'IN_REVIEW',version:1}});
});

test('close and reopen exact retries preserve original decision and changed payload conflicts',()=>{
  for(const [from,to,extra] of [['AWAITING_CONFIRMATION','CLOSED',{resolution:'Αλλάχτηκε',confirmer:'user-a'}],['CLOSED','IN_REVIEW',{reason:'Νέο πρόβλημα'}]]){
    const request=req(to,extra),first=decide(state(from),request);
    const result=decide(state(to,1),request,{receiptCheck:{status:'FOUND',receipt:first.receipt}});assert.equal(result.decision,'REPLAY');
    const changed=to==='CLOSED'?{...request,resolution:'Άλλη λύση'}:{...request,reason:'Άλλη αιτία'};
    throwsCode(()=>decide(state(to,1),changed,{receiptCheck:{status:'FOUND',receipt:first.receipt}}),'IDEMPOTENCY_CONFLICT');
  }
});

test('normalization is deterministic, input objects stay unchanged and accessors are not invoked',()=>{
  const data={scope:{...scope},incident:state('AWAITING_CONFIRMATION'),request:req('CLOSED',{resolution:'  Επιλύθηκε  ',confirmer:'  Χρήστος  '}),receiptCheck:{status:'NOT_FOUND'}};
  const before=structuredClone(data),one=decideIncidentTransition(data),two=decideIncidentTransition(data);assert.deepEqual(data,before);assert.deepEqual(one,two);
  let invoked=0;const hostile={...scope};Object.defineProperty(hostile,'actorId',{enumerable:true,get(){invoked++;return 'user-a'}});
  throwsCode(()=>decideIncidentTransition({...data,scope:hostile}),'INVALID_FIELDS');assert.equal(invoked,0);
  const bad=Object.create({companyId:'company-a'});bad.storeId='store-a';bad.actorId='user-a';throwsCode(()=>decideIncidentTransition({...data,scope:bad}),'INVALID_OBJECT');
});
