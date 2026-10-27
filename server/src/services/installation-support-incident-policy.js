// Pure preparation only. This module does not authenticate, authorize, persist,
// or mount an incident workflow. The caller must supply server-validated scope
// and a trusted receipt lookup performed under its own atomicity guarantees.
export const INCIDENT_STATUSES=Object.freeze(['NEW','IN_REVIEW','IN_PROGRESS','WAITING','AWAITING_CONFIRMATION','CLOSED']);
const EDGES=Object.freeze({
  NEW:Object.freeze(['IN_REVIEW']),
  IN_REVIEW:Object.freeze(['IN_PROGRESS','WAITING']),
  IN_PROGRESS:Object.freeze(['WAITING','AWAITING_CONFIRMATION']),
  WAITING:Object.freeze(['IN_PROGRESS','AWAITING_CONFIRMATION']),
  AWAITING_CONFIRMATION:Object.freeze(['CLOSED']),
  CLOSED:Object.freeze(['IN_REVIEW'])
});

export class IncidentPolicyError extends Error{
  constructor(code){super(code);this.name='IncidentPolicyError';this.code=code}
}
const refuse=code=>{throw new IncidentPolicyError(code)};

// Do not invoke accessors or accept unknown fields in data passed across a
// future API boundary. This validation does not itself establish trust.
function object(value,allowed,required=[]){
  if(value===null||typeof value!=='object'||Array.isArray(value))refuse('INVALID_OBJECT');
  const proto=Object.getPrototypeOf(value);
  if(proto!==Object.prototype&&proto!==null)refuse('INVALID_OBJECT');
  const descriptors=Object.getOwnPropertyDescriptors(value),keys=Reflect.ownKeys(descriptors);
  if(keys.some(key=>typeof key!=='string'||!allowed.includes(key)||!('value' in descriptors[key])))refuse('INVALID_FIELDS');
  if(required.some(key=>!Object.hasOwn(descriptors,key)))refuse('MISSING_FIELD');
  return Object.fromEntries(keys.map(key=>[key,descriptors[key].value]));
}
function text(value,max,code,min=1){
  if(typeof value!=='string'||value.length>max)refuse(code);
  if(/[\u0000-\u001f\u007f-\u009f\u2028\u2029]/u.test(value))refuse(code);
  const normalized=value.trim();
  if(normalized.length<min||normalized.length>max)refuse(code);
  return normalized;
}
function version(value){if(!Number.isSafeInteger(value)||value<0)refuse('INVALID_VERSION');return value}
function status(value){if(typeof value!=='string'||!INCIDENT_STATUSES.includes(value))refuse('INVALID_STATUS');return value}
function sameFields(a,b){const ak=Object.keys(a),bk=Object.keys(b);return ak.length===bk.length&&ak.every(key=>Object.hasOwn(b,key)&&a[key]===b[key])}

/**
 * Produce a decision, never perform it. `scope` must be built from an already
 * authenticated/authorized server principal, not request JSON. A trusted
 * receipt lookup is deliberately explicit: absent/UNKNOWN returns
 * RECEIPT_REQUIRED; NOT_FOUND means the caller has checked authoritative
 * storage; FOUND requires the caller's trusted stored receipt. A future caller
 * must lock/check/write the receipt, state and audit atomically. Never accept a
 * receipt from an untrusted client or claim these pure rules ensure idempotency.
 * REPLAY returns the original historical result, not necessarily the current
 * incident state; a future UI adapter must fetch current state separately.
 * The confirmer is bounded claimed text, not a verified identity. The future
 * integrating server must authenticate and authorize/validate that identity.
 */
export function decideIncidentTransition(input){
  const top=object(input,['scope','incident','request','receiptCheck'],['scope','incident','request']);
  const suppliedScope=object(top.scope,['companyId','storeId','actorId'],['companyId','storeId','actorId']);
  const scope={companyId:text(suppliedScope.companyId,160,'INVALID_SCOPE'),storeId:text(suppliedScope.storeId,160,'INVALID_SCOPE'),actorId:text(suppliedScope.actorId,160,'INVALID_ACTOR')};
  const suppliedIncident=object(top.incident,['id','companyId','storeId','status','version'],['id','companyId','storeId','status','version']);
  const incident={id:text(suppliedIncident.id,160,'INVALID_INCIDENT'),companyId:text(suppliedIncident.companyId,160,'INVALID_SCOPE'),storeId:text(suppliedIncident.storeId,160,'INVALID_SCOPE'),status:status(suppliedIncident.status),version:version(suppliedIncident.version)};
  if(incident.companyId!==scope.companyId||incident.storeId!==scope.storeId)refuse('INCIDENT_SCOPE_MISMATCH');
  const supplied=object(top.request,['operationId','expectedVersion','targetStatus','reason','resolution','confirmer'],['operationId','expectedVersion','targetStatus']);
  const request={operationId:text(supplied.operationId,128,'INVALID_OPERATION'),expectedVersion:version(supplied.expectedVersion),targetStatus:status(supplied.targetStatus)};
  const has=(name)=>Object.hasOwn(supplied,name);
  if(request.targetStatus==='CLOSED'){
    if(!has('resolution')||!has('confirmer'))refuse('CLOSE_EVIDENCE_REQUIRED');
    request.resolution=text(supplied.resolution,2000,'INVALID_RESOLUTION');
    request.confirmer=text(supplied.confirmer,160,'INVALID_CONFIRMER');
  }else if(has('resolution')||has('confirmer'))refuse('UNEXPECTED_CLOSE_EVIDENCE');
  if(has('reason'))request.reason=text(supplied.reason,1000,'INVALID_REASON');
  if(request.expectedVersion===Number.MAX_SAFE_INTEGER)refuse('VERSION_EXHAUSTED');

  // Receipt fields are trusted server-side data, not a caller-provided claim.
  // Fixed canonical ordering makes comparison deterministic without timestamps.
  const operation={incidentId:incident.id,scope,request};
  if(!Object.hasOwn(top,'receiptCheck'))return {decision:'RECEIPT_REQUIRED'};
  const check=object(top.receiptCheck,['status','receipt'],['status']);
  if(check.status==='UNKNOWN'){
    if(Object.hasOwn(check,'receipt'))refuse('INVALID_RECEIPT_CHECK');
    return {decision:'RECEIPT_REQUIRED'};
  }
  if(check.status==='FOUND'){
    if(!Object.hasOwn(check,'receipt'))refuse('INVALID_RECEIPT_CHECK');
    const receipt=object(check.receipt,['operation','result'],['operation','result']);
    const saved=object(receipt.operation,['incidentId','scope','request'],['incidentId','scope','request']);
    const savedScope=object(saved.scope,['companyId','storeId','actorId'],['companyId','storeId','actorId']);
    const savedRequest=object(saved.request,['operationId','expectedVersion','targetStatus','reason','resolution','confirmer'],['operationId','expectedVersion','targetStatus']);
    // Rebuild in canonical order so property ordering cannot turn a valid retry
    // into a false conflict. Request values must already be normalized.
    const priorRequest={operationId:savedRequest.operationId,expectedVersion:savedRequest.expectedVersion,targetStatus:savedRequest.targetStatus};
    if(Object.hasOwn(savedRequest,'resolution'))priorRequest.resolution=savedRequest.resolution;
    if(Object.hasOwn(savedRequest,'confirmer'))priorRequest.confirmer=savedRequest.confirmer;
    if(Object.hasOwn(savedRequest,'reason'))priorRequest.reason=savedRequest.reason;
    const prior={incidentId:saved.incidentId,scope:{companyId:savedScope.companyId,storeId:savedScope.storeId,actorId:savedScope.actorId},request:priorRequest};
    if(operation.incidentId!==prior.incidentId||!sameFields(operation.scope,prior.scope)||!sameFields(operation.request,prior.request))refuse('IDEMPOTENCY_CONFLICT');
    const savedResult=object(receipt.result,['status','version'],['status','version']);
    if(savedResult.status!==request.targetStatus||savedResult.version!==request.expectedVersion+1)refuse('INVALID_RECEIPT');
    // A trusted receipt cannot prove a replay against an older restored state,
    // or a same-version state that disagrees with the recorded result.
    if(incident.version<savedResult.version||(incident.version===savedResult.version&&incident.status!==savedResult.status))refuse('RECEIPT_STATE_MISMATCH');
    return {decision:'REPLAY',result:{status:savedResult.status,version:savedResult.version}};
  }
  if(check.status!=='NOT_FOUND'||Object.hasOwn(check,'receipt'))refuse('INVALID_RECEIPT_CHECK');
  if(request.expectedVersion!==incident.version)refuse('VERSION_CONFLICT');
  if(!EDGES[incident.status].includes(request.targetStatus))refuse('INVALID_TRANSITION');
  if(incident.status==='CLOSED'){
    if(!has('reason'))refuse('REOPEN_REASON_REQUIRED');
  }else if(has('reason'))refuse('UNEXPECTED_REOPEN_REASON');
  const result={status:request.targetStatus,version:incident.version+1};
  // Explicit result and receipt candidate are pure data only. Audit summary
  // contains names of supplied fields, not their potentially sensitive values.
  return {decision:'TRANSITION',result,receipt:{operation,result},audit:{actorId:scope.actorId,from:incident.status,to:request.targetStatus,fields:Object.keys(request).filter(key=>['reason','resolution','confirmer'].includes(key))}};
}
