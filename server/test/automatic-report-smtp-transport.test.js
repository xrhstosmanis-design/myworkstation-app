import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createAutomaticReportSmtpTransport,getMailStatus} from '../src/services/mail.js';
import {createAutomaticReportDeliveryDriver} from '../src/services/automatic-report-delivery-driver.js';
import {createDeliverySlot,claimDelivery} from '../src/services/automatic-report-delivery-lifecycle.js';

// Synthetic metadata/transaction/SMTP only; no network, credentials or actual mail.
const NOW='2026-10-22T12:00:00.000Z',later=ms=>new Date(Date.parse(NOW)+ms).toISOString();
const copy=value=>structuredClone(value),recipient='driver-fixture@example.invalid';
const sha=value=>createHash('sha256').update(value).digest('hex');
function fixtureData(){
  const content={format:'MWS_AUTOMATIC_CASH_PAYLOAD_V1',scope:{companyId:'synthetic-driver-company',storeId:'selected-store'},period:{from:'2026-10-20T04:00:00.000Z',to:'2026-10-21T04:00:00.000Z'},frequency:'DAILY',sourceFingerprint:'a'.repeat(64),financialFinality:'PROVISIONAL',financialLimitations:['SYNTHETIC_UNRECONCILED_FIXTURE'],financialReconciliationComplete:false,employeeLiabilityAdjusted:false,settingsVersion:1};
  const body=JSON.stringify(content),payload={format:content.format,scope:content.scope,period:content.period,frequency:content.frequency,sourceFingerprint:content.sourceFingerprint,financialFinality:content.financialFinality,financialLimitations:content.financialLimitations,contentType:'application/json; charset=utf-8',body,byteLength:Buffer.byteLength(body),payloadFingerprint:sha(body)};
  const input={...content.scope,reportType:'CASH',frequency:'DAILY',periodFrom:content.period.from,periodTo:content.period.to,recipient,snapshot:{settingsVersion:1,recipientVersion:2,consentRevision:3,lifecycleGeneration:'4',sourceFingerprint:payload.sourceFingerprint,payloadFingerprint:payload.payloadFingerprint,policyFingerprint:'c'.repeat(64),principalId:'synthetic-principal',financialFinality:'PROVISIONAL',financialReconciliationComplete:false}};
  const pending=createDeliverySlot(input,{now:NOW,current:eligibility(input,NOW)}),claimed=claimDelivery(pending,{expectedVersion:1,token:'driver-one',now:NOW,leaseMs:1000});
  return {claimed,args:{scope:{...content.scope,slotId:claimed.slotId},expectedVersion:claimed.version,token:claimed.token,payload}};
}
function eligibility(input,now){return {...copy(input),checkedAt:now,companyActive:true,storeActive:true,licenseActive:true,moduleActive:true,principalAuthorized:true,recipientVerified:true,consentActive:true,dispatchEnabled:true,sourceReady:true,policyAllowsProvisional:true,maintenanceBlocked:false};}

const env=()=>({SMTP_HOST:'synthetic.invalid',SMTP_USER:'sender@example.invalid',SMTP_PASSWORD:'synthetic-not-a-credential',MAIL_FROM:'sender@example.invalid'});
const message=()=>({to:recipient,subject:'ΠΡΟΣΩΡΙΝΗ ΑΝΑΦΟΡΑ',text:'Exact synthetic body\nwith newline'});
const accepted=()=>({accepted:[recipient],rejected:[],messageId:'<synthetic@example.invalid>',response:'250 accepted',envelope:{from:'sender@example.invalid',to:[recipient]}});
function sender({result=accepted(),send,error,scope={companyId:'synthetic-driver-company',storeId:'selected-store'},environment=env()}={}){
 const calls=[],configs=[];
 const transport=createAutomaticReportSmtpTransport({...scope,env:environment,createTransport:config=>{configs.push(config);return {sendMail:async value=>{calls.push(value);if(error)throw error;return send?send(value):result}}}});
 return{...transport,calls,configs};
}
test('factory is inert, scoped one-recipient envelope/config/timeouts are exact and receipt is actual',async()=>{
 const h=sender(),m=message();assert.equal(h.configs.length,0);
 assert.deepEqual(await h.sendMail(m),accepted());assert.equal(h.calls.length,1);
 assert.deepEqual(h.configs,[{host:'synthetic.invalid',port:465,secure:true,auth:{user:'sender@example.invalid',pass:'synthetic-not-a-credential'},connectionTimeout:15000,greetingTimeout:15000,socketTimeout:20000}]);
 assert.deepEqual(h.calls[0],{...m,from:'MyWorkStation <sender@example.invalid>',envelope:{from:'sender@example.invalid',to:[recipient]}});
 assert.equal(getMailStatus(env()).configured,false,'legacy status still requires its test recipient');
});
test('scope and SMTP config captured before caller mutation, request copied before external await',async()=>{
 const scope={companyId:'c',storeId:'s'},environment=env(),h=sender({scope,environment});scope.companyId='customer-demo-x';environment.SMTP_HOST='changed.invalid';
 const m=message(),operation=h.sendMail(m);m.to='redirect@example.invalid';m.text='changed';await operation;
 assert.equal(h.calls[0].to,recipient);assert.equal(h.calls[0].text,message().text);assert.equal(h.configs[0].host,'synthetic.invalid');
});
test('real demo company/store guard runs before transport construction and cannot be injected',()=>{
 for(const scope of [{companyId:'customer-demo-c',storeId:'s'},{companyId:'c',storeId:'CUSTOMER-DEMO-s'}]){
  let calls=0;assert.throws(()=>createAutomaticReportSmtpTransport({...scope,env:env(),createTransport:()=>{calls++}}),{code:'CUSTOMER_DEMO_OUTBOUND_BLOCKED'});assert.equal(calls,0);
 }
 assert.throws(()=>createAutomaticReportSmtpTransport({companyId:'c',storeId:'s',env:env(),guard:()=>{}}),{code:'INVALID_REPORT_TRANSPORT'});
});
test('invalid own-data scope, recipient, headers and extra message options cause zero SMTP calls/getters',async()=>{
 let getters=0;
 for(const options of [null,{},Object.create({companyId:'c',storeId:'s'}),{companyId:'',storeId:'s'},{companyId:'c\n',storeId:'s'},{get companyId(){getters++;return 'c'},storeId:'s'}])assert.throws(()=>createAutomaticReportSmtpTransport(options));
 for(const change of [m=>m.to=[recipient],m=>m.to=recipient+';other@example.invalid',m=>m.to='Name <'+recipient+'>',m=>m.to='UPPER@example.invalid',m=>m.to='a\r\nb@example.invalid',m=>m.subject='x\r\nBcc:evil',m=>m.bcc='other@example.invalid',m=>m.envelope={to:['other@example.invalid']},m=>m.text='',m=>m.text='x'.repeat(2*1024*1024+1),m=>Object.defineProperty(m,'to',{enumerable:true,get(){getters++;return recipient}}),m=>Object.defineProperty(m,'hidden',{value:true})]){
  const h=sender(),m=message();change(m);await assert.rejects(h.sendMail(m),{code:'INVALID_REPORT_TRANSPORT'});assert.equal(h.configs.length,0);assert.equal(h.calls.length,0);
 }assert.equal(getters,0);
});
test('configuration getters are not executed and unrelated legacy test recipient is never read',()=>{
 let reads=0;const bad=env();Object.defineProperty(bad,'SMTP_PASSWORD',{enumerable:true,get(){reads++;return 'private'}});
 assert.throws(()=>sender({environment:bad}),{code:'INVALID_REPORT_TRANSPORT'});
 const good=env();Object.defineProperty(good,'MAIL_TEST_RECIPIENT',{enumerable:true,get(){reads++;return 'redirect@example.invalid'}});
 sender({environment:good});assert.equal(reads,0);
});
test('missing/bad configuration fails before transport construction without leaking secrets',()=>{
 for(const environment of [{},{...env(),SMTP_PASSWORD:''},{...env(),MAIL_FROM:'Name <sender@example.invalid>'},{...env(),SMTP_PORT:'65536'},{...env(),MAIL_FROM:'sender@example.invalid\nBCC:x'}])assert.throws(()=>sender({environment}),e=>e.code==='REPORT_SMTP_NOT_CONFIGURED'&&!e.message.includes('synthetic-not-a-credential'));
});
test('transport errors propagate exactly once without retry or false receipt',async()=>{
 for(const code of ['ETIMEDOUT','EAUTH','ECONNRESET']){const error=Object.assign(new Error('private failure'),{code}),h=sender({error});await assert.rejects(h.sendMail(message()),e=>e===error);assert.equal(h.calls.length,1)}
});
test('receipt projection preserves missing/contradictory evidence, omits provider extras and detaches arrays',async()=>{
 for(const result of [{messageId:'id'},{accepted:[recipient],rejected:[recipient],pending:[recipient],messageId:'id'},{accepted:['other@example.invalid'],rejected:[],messageId:'id'}]){
  const h=sender({result}),receipt=await h.sendMail(message());assert.deepEqual(receipt,result);assert.ok(Object.isFrozen(receipt));if(result.accepted){result.accepted[0]='changed';assert.notEqual(receipt.accepted[0],'changed')}
 }
 const result={...accepted(),ehlo:['private'],rejectedErrors:[]};Object.defineProperty(result,'unrelated',{get(){assert.fail('provider getter')}});
 assert.deepEqual(await sender({result}).sendMail(message()),accepted());
});
test('accessor/nonplain/sparse/hidden/oversized actual evidence cannot manufacture acceptance',async()=>{
 let getters=0;
 for(const mutate of [r=>Object.defineProperty(r,'accepted',{enumerable:true,get(){getters++;return [recipient]}}),r=>r.accepted=new Array(1),r=>r.accepted=[{address:recipient}],r=>r.accepted=Array(1001).fill(recipient),r=>r.messageId='x\n',r=>r.envelope={to:[recipient],bcc:['evil']},r=>Object.setPrototypeOf(r,{inherited:true}),r=>Object.defineProperty(r,'rejected',{value:[],enumerable:false})]){
  const result=accepted();mutate(result);const h=sender({result});await assert.rejects(h.sendMail(message()),{code:'INVALID_REPORT_TRANSPORT'});assert.equal(h.calls.length,1);
 }assert.equal(getters,0);
});

// Exercise the actual driver -> repository -> adapter -> new SMTP boundary.
// The DB fixture implements only the scoped SELECT/CAS protocol; lifecycle and
// receipt classification are the production implementations, not substitutes.
function integrated(result,{failCommit=false}={}){
 const f=fixtureData(),events=[];let state=copy(f.claimed),committed=false;
 const h=sender({send:m=>{events.push('smtp');assert.equal(committed,true);assert.equal(state.status,'ATTEMPTING');assert.equal(m.text,f.args.payload.body);return typeof result==='function'?result():result}});
 const db={$transaction:async fn=>{
  const before=copy(state);try{
   const project=()=>({slotId:state.slotId,companyId:state.input.companyId,storeId:state.input.storeId,version:String(state.version),status:state.status,token:state.token,record:copy(state)});
   const value=await fn({$queryRaw:async(strings,...values)=>{
    const sql=strings.join('?');if(sql.startsWith('SELECT'))return values[0]===state.input.companyId&&values[1]===state.input.storeId&&values[2]===state.slotId?[project()]:[];
    assert.ok(sql.startsWith('UPDATE'));assert.equal(values[7],BigInt(state.version));assert.equal(values[8],state.status);assert.equal(values[9],state.token);assert.deepEqual(JSON.parse(values[10]),state);
    state=JSON.parse(values[3]);events.push(state.status);return [project()];
   }});
   if(failCommit)throw new Error('synthetic failed commit');committed=true;events.push('commit');return value;
  }catch(e){state=before;throw e}
 }};
 const driver=createAutomaticReportDeliveryDriver({db,readEligibility:async({input,now})=>eligibility(input,now),clock:()=>NOW,sendMail:h.sendMail});
 return{...h,...f,events,driver,record:()=>state};
}
test('real driver/repository/adapter commits ATTEMPTING before one SMTP call and stores ACCEPTED',async()=>{
 const h=integrated(accepted()),result=await h.driver.attempt(h.args);
 assert.equal(result.outcome,'ACCEPTED');assert.equal(result.recorded,true);assert.deepEqual(h.events,['ATTEMPTING','commit','smtp','ACCEPTED','commit']);assert.equal(h.record().messageId,accepted().messageId);
 await h.driver.attempt(h.args);assert.equal(h.calls.length,1,'terminal slot never sends again');
});
test('real driver persists ambiguous/rejected/partial/invalid evidence UNKNOWN without retries or detail leaks',async()=>{
 for(const result of [{messageId:'planned'},{accepted:[recipient],rejected:[recipient],messageId:'id'},{accepted:[recipient],rejected:[],pending:[recipient],messageId:'id'},{accepted:['other@example.invalid'],rejected:[],messageId:'id'},{accepted:[recipient,'other@example.invalid'],rejected:[],messageId:'id'},{accepted:[recipient],rejected:[]},{...accepted(),envelope:{to:['other@example.invalid']}},{...accepted(),response:'550 rejected'},()=>{throw new Error('private password')},Object.defineProperty(accepted(),'accepted',{enumerable:true,get(){throw new Error('private getter')}})]){
  const h=integrated(result),receipt=await h.driver.attempt(h.args);assert.equal(receipt.outcome,'UNKNOWN');assert.equal(receipt.recorded,true);assert.equal(h.record().status,'UNKNOWN');assert.equal(h.record().messageId,null);assert.doesNotMatch(JSON.stringify(receipt),/private|password/);
  await h.driver.attempt(h.args);assert.equal(h.calls.length,1);
 }
});
test('real start commit failure creates zero SMTP clients or sends',async()=>{
 const h=integrated(accepted(),{failCommit:true}),receipt=await h.driver.attempt(h.args);assert.equal(receipt.outcome,'UNKNOWN');assert.equal(h.calls.length,0);assert.equal(h.configs.length,0);assert.equal(h.record().status,'CLAIMED');
});
test('provider rejectedErrors cannot be projected away into false ACCEPTED, including opaque properties',async()=>{
 let getters=0;
 for(const result of [
  {...accepted(),rejectedErrors:[new Error('private rejected recipient')]},
  {...accepted(),rejectedErrors:['contradictory rejection']},
  {...accepted(),rejectedErrors:new Array(1)},
  Object.defineProperty(accepted(),'rejectedErrors',{enumerable:true,get(){getters++;return []}}),
  Object.defineProperty(accepted(),'rejectedErrors',{enumerable:false,value:[]})
 ]){
  const h=integrated(result),receipt=await h.driver.attempt(h.args);
  assert.equal(receipt.outcome,'UNKNOWN');assert.equal(receipt.recorded,true);assert.equal(h.record().status,'UNKNOWN');assert.equal(h.record().messageId,null);
  await h.driver.attempt(h.args);assert.equal(h.calls.length,1);assert.doesNotMatch(JSON.stringify(receipt),/private|rejected recipient/);
 }
 assert.equal(getters,0);
 const h=integrated({...accepted(),rejectedErrors:[]});assert.equal((await h.driver.attempt(h.args)).outcome,'ACCEPTED');
});
