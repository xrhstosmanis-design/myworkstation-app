import {createAutomaticReportDeliveryRepository} from './automatic-report-delivery-repository.js';
import {createAutomaticReportMailAdapter} from './automatic-report-mail-adapter.js';

// Dormant composition only. A production caller still needs reviewed durable
// enrollment, authoritative eligibility/writer locks, consent and recovery.
// No SMTP client, credentials, schema creation, scheduler or runtime mounting.
const invalid=()=>{throw Object.assign(new Error('Invalid report delivery request.'),{code:'INVALID_DELIVERY_REQUEST'});};
function instant(clock){
  const value=clock();
  if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value)||!Number.isFinite(Date.parse(value))||new Date(value).toISOString()!==value)invalid();
  return value;
}
function request(raw,now){
  if(!raw||typeof raw!=='object'||Array.isArray(raw)||![Object.prototype,null].includes(Object.getPrototypeOf(raw)))invalid();
  const keys=['scope','expectedVersion','token','payload'],descriptors=Object.getOwnPropertyDescriptors(raw);
  if(Reflect.ownKeys(descriptors).length!==keys.length||keys.some(key=>!descriptors[key]?.enumerable||!Object.hasOwn(descriptors[key],'value')))invalid();
  // The adapter immediately detaches/validates nested metadata before awaiting
  // the real repository. Never spread caller data or evaluate caller getters.
  return {...Object.fromEntries(keys.map(key=>[key,descriptors[key].value])),now};
}
const unresolved=reason=>Object.freeze({outcome:'UNKNOWN',recorded:false,recoveryRequired:true,automaticRetryAllowed:false,reason});

export function createAutomaticReportDeliveryDriver({db,readEligibility,sendMail,clock=()=>new Date().toISOString()}){
  if(typeof clock!=='function'||typeof sendMail!=='function')invalid();
  const repository=createAutomaticReportDeliveryRepository({db,readEligibility});
  return Object.freeze({async attempt(raw){
    let args;
    try{args=request(raw,instant(clock));}catch{invalid();}
    // Per-call state prevents concurrent attempts from sharing a start receipt.
    let startEntered=false,committed;
    const adapter=createAutomaticReportMailAdapter({
      startAttempt:async(scope,options)=>{
        startEntered=true;
        committed=await repository.start(scope,options);
        return committed;
      },
      sendMail:async message=>{
        // A slow start commit must not authorize external I/O after lease expiry
        // or a backwards clock. This check makes no fresh-consent claim.
        const now=instant(clock);
        if(!committed||now<committed.attemptStartedAt||now>=committed.leaseUntil)invalid();
        return await sendMail(message);
      }
    });
    let result;
    try{result=await adapter.attempt(args);}catch{
      if(!startEntered)invalid();
      // A rejected start may hide an ambiguous commit. Do not reload and retry,
      // fabricate UNKNOWN persistence or expose database/provider error details.
      return unresolved('START_UNCONFIRMED');
    }
    if(!committed||result.reason==='START_RECEIPT_INVALID')return unresolved('START_UNCONFIRMED');
    const scope={companyId:committed.input.companyId,storeId:committed.input.storeId,slotId:committed.slotId};
    try{
      const completed=await repository.complete(scope,{
        expectedVersion:committed.version,token:committed.token,now:instant(clock),
        outcome:result.outcome,...(result.outcome==='ACCEPTED'?{messageId:result.messageId}:{})
      });
      return Object.freeze({outcome:completed.status,recorded:true,recoveryRequired:false,automaticRetryAllowed:false,reason:result.reason});
    }catch{
      // A send may already be accepted even if its completion commit fails.
      // Leave durable ATTEMPTING/terminal state for explicit inspected recovery.
      // Never turn this uncertainty into permission for a second transport call.
      return unresolved('COMPLETION_UNCONFIRMED');
    }
  }});
}
