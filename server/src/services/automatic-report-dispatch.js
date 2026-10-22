import * as defaultPersistence from './automatic-report-dispatch-policy.js';
import {randomBytes} from 'node:crypto';
import {createAutomaticReportEligibilityReader,automaticReportScopeInput} from './automatic-report-eligibility.js';
import {createAutomaticReportDeliveryRepository} from './automatic-report-delivery-repository.js';
import {createAutomaticReportDeliveryDriver} from './automatic-report-delivery-driver.js';
import {createAutomaticReportSmtpTransport} from './mail.js';

// There is no schema creation, implicit enrollment, automatic recovery or send
// within preparation. The bound facade keeps repository.create in the caller's
// transaction rather than checking out an independent nested transaction.
export function createAutomaticReportDispatcher({db,persistence=defaultPersistence,activationProvider,clock=()=>new Date().toISOString(),sendMail}){
 if(!db||typeof db.$transaction!=='function'||typeof activationProvider!=='function'||typeof clock!=='function'||sendMail!==undefined&&typeof sendMail!=='function')throw new TypeError('Trusted dispatcher dependencies required');
 const transactional={$transaction:fn=>db.$transaction(fn,{isolationLevel:'ReadCommitted',maxWait:5000,timeout:15000})};
 const eligibility=createAutomaticReportEligibilityReader({activationProvider,persistence});
 const repository=createAutomaticReportDeliveryRepository({db:transactional,readEligibility:eligibility});
 async function prepare(raw){
  const scope=automaticReportScopeInput(raw),now=clock();
  return transactional.$transaction(async tx=>{
   const context=await eligibility.readContext(tx,scope,now);
   await persistence.putImmutablePayload(tx,{companyId:scope.companyId,storeId:scope.storeId,payload:context.payload,now,lifecycleGeneration:context.inputs[0].snapshot.lifecycleGeneration});
   const bound=createAutomaticReportDeliveryRepository({db:{$transaction:fn=>fn(tx)},readEligibility:eligibility});
   const slots=[];
   for(const input of context.inputs){const result=await bound.create({companyId:scope.companyId,storeId:scope.storeId},input,{now});slots.push(result)}
   return Object.freeze({scope,payload:context.payload,slots});
  });
 }
 return Object.freeze({prepare,async dispatch(raw,{maxAttempts=5}={}){
  if(!Number.isInteger(maxAttempts)||maxAttempts<1||maxAttempts>5)throw new TypeError('Bounded recipient attempts required');
  const scope=automaticReportScopeInput(raw),control=activationProvider();
  if(!control?.valid||!control.enabled)return {status:'OFF',attempted:0,outcomes:[]};
  let prepared;try{prepared=await prepare(scope)}catch{return {status:'HOLD',attempted:0,outcomes:[]}}
  const outcomes=[];let attempted=0;
  for(const {record} of prepared.slots){
   if(attempted>=maxAttempts)break;
   const current=activationProvider();if(!current?.valid||!current.enabled||current.fingerprint!==control.fingerprint)break;
   if(record.status!=='PENDING')continue;
   try{
    const transport=sendMail??createAutomaticReportSmtpTransport({companyId:scope.companyId,storeId:scope.storeId}).sendMail;
    const claimed=await repository.claim({companyId:scope.companyId,storeId:scope.storeId,slotId:record.slotId},{expectedVersion:record.version,token:randomBytes(24).toString('hex'),now:clock(),leaseMs:60000});
    const driver=createAutomaticReportDeliveryDriver({db:transactional,readEligibility:eligibility,clock,sendMail:transport});
    attempted++;
    outcomes.push(await driver.attempt({scope:{companyId:scope.companyId,storeId:scope.storeId,slotId:claimed.slotId},expectedVersion:claimed.version,token:claimed.token,payload:prepared.payload}));
   }catch{outcomes.push({outcome:'HOLD',automaticRetryAllowed:false})}
  }
  return {status:'COMPLETE',attempted,outcomes};
 }});
}
