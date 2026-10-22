import {createHash} from "node:crypto";
import {reconcileDeliverySlot} from "./automatic-report-delivery-lifecycle.js";

// Dormant dependency-injected adapter. No SMTP client, credentials, DB or timer.
// startAttempt MUST be a trusted lock-safe repository driver, resolving only
// AFTER its ATTEMPTING transaction commits. Caller-supplied records are not
// authorization proof; production consent/revocation/recovery wiring is separate.
const fail=()=>{throw Object.assign(new Error("Invalid automatic report mail attempt."),{code:"INVALID_MAIL_ATTEMPT"})};
const hash=value=>createHash("sha256").update(value,"utf8").digest("hex");
const iso=value=>typeof value==="string"&&/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value)&&Number.isFinite(Date.parse(value))&&new Date(value).toISOString()===value;
function copy(value,depth=0,budget={nodes:0,bytes:0}){
  if(++budget.nodes>25000||depth>20)fail();
  if(value===null||typeof value==="boolean")return value;
  if(typeof value==="string"){budget.bytes+=Buffer.byteLength(value,"utf8");if(budget.bytes>3*1024*1024)fail();return value}
  if(typeof value==="number"&&Number.isFinite(value))return value;
  if(!value||typeof value!=="object")fail();
  const array=Array.isArray(value),proto=Object.getPrototypeOf(value),keys=Reflect.ownKeys(value);
  if(array?proto!==Array.prototype:proto!==Object.prototype&&proto!==null)fail();
  if(keys.length>1001||array&&value.length>1000)fail();
  const result=array?[]:{};
  for(const key of keys){
    if(typeof key!=="string"||["__proto__","constructor","prototype"].includes(key))fail();
    if(array&&key==="length")continue;
    if(key.length>256||array&&!/^(0|[1-9]\d*)$/.test(key))fail();
    const d=Object.getOwnPropertyDescriptor(value,key);if(!d?.enumerable||!Object.hasOwn(d,"value"))fail();
    result[key]=copy(d.value,depth+1,budget);
  }
  if(array&&Object.keys(result).length!==value.length)fail();
  return result;
}
function freeze(value){if(value&&typeof value==="object"){for(const v of Object.values(value))freeze(v);Object.freeze(value)}return value}
function shape(value,keys){if(!value||Array.isArray(value)||typeof value!=="object"||Object.keys(value).length!==keys.length||keys.some(k=>!Object.hasOwn(value,k)))fail()}
function text(value,max=200){if(typeof value!=="string"||!value||value!==value.trim()||value.length>max||/[\u0000-\u001f\u007f]/.test(value))fail()}
const canonical=value=>JSON.stringify(value,(_k,v)=>v&&typeof v==="object"&&!Array.isArray(v)?Object.fromEntries(Object.keys(v).sort().map(k=>[k,v[k]])):v);
function request(raw){
  const args=copy(raw);shape(args,["scope","expectedVersion","token","now","payload"]);
  shape(args.scope,["companyId","storeId","slotId"]);text(args.scope.companyId);text(args.scope.storeId);
  if(typeof args.scope.slotId!=="string"||!/^[a-f0-9]{64}$/.test(args.scope.slotId)||!Number.isSafeInteger(args.expectedVersion)||args.expectedVersion<1||args.expectedVersion===Number.MAX_SAFE_INTEGER||!iso(args.now))fail();
  text(args.token);
  const p=args.payload;
  shape(p,["format","scope","period","frequency","sourceFingerprint","financialFinality","financialLimitations","contentType","body","byteLength","payloadFingerprint"]);
  shape(p.scope,["companyId","storeId"]);
  if(p.format!=="MWS_AUTOMATIC_CASH_PAYLOAD_V1"||p.scope.companyId!==args.scope.companyId||p.scope.storeId!==args.scope.storeId||!["DAILY","WEEKLY","MONTHLY"].includes(p.frequency)||p.financialFinality!=="PROVISIONAL"||p.contentType!=="application/json; charset=utf-8")fail();
  if(typeof p.body!=="string"||!Number.isSafeInteger(p.byteLength)||p.byteLength<1||p.byteLength>2*1024*1024||Buffer.byteLength(p.body,"utf8")!==p.byteLength||p.payloadFingerprint!==hash(p.body)||typeof p.sourceFingerprint!=="string"||!/^[a-f0-9]{64}$/.test(p.sourceFingerprint))fail();
  let content;try{content=JSON.parse(p.body)}catch{fail()}
  if(!content||content.format!==p.format||content.scope?.companyId!==p.scope.companyId||content.scope?.storeId!==p.scope.storeId||content.frequency!==p.frequency||content.sourceFingerprint!==p.sourceFingerprint||content.financialFinality!=="PROVISIONAL"||content.financialReconciliationComplete!==false||content.employeeLiabilityAdjusted!==false||canonical(content.period)!==canonical(p.period)||canonical(content.financialLimitations)!==canonical(p.financialLimitations))fail();
  if(!iso(p.period?.from)||!iso(p.period?.to)||p.period.from>=p.period.to||p.period.to>args.now)fail();
  return freeze(args);
}
function started(raw,args){
  const value=copy(raw),r=reconcileDeliverySlot(value,value.input),p=args.payload;
  if(r.status!=="ATTEMPTING"||r.slotId!==args.scope.slotId||r.input.companyId!==args.scope.companyId||r.input.storeId!==args.scope.storeId||r.version!==args.expectedVersion+1||r.token!==args.token||r.attemptStartedAt!==args.now||r.updatedAt!==args.now||r.leaseUntil<=args.now||r.input.frequency!==p.frequency||r.input.periodFrom!==p.period.from||r.input.periodTo!==p.period.to||r.input.snapshot.payloadFingerprint!==p.payloadFingerprint||r.input.snapshot.sourceFingerprint!==p.sourceFingerprint||JSON.parse(p.body).settingsVersion!==r.input.snapshot.settingsVersion)fail();
  return r;
}
const unknown=reason=>Object.freeze({outcome:"UNKNOWN",reason,automaticRetryAllowed:false});
function own(value,key){const d=Object.getOwnPropertyDescriptor(value,key);return d&&Object.hasOwn(d,"value")?d.value:undefined}
function evidence(result,recipient){
  if(!result||typeof result!=="object"||Array.isArray(result)||![Object.prototype,null].includes(Object.getPrototypeOf(result)))return unknown("INVALID_TRANSPORT_EVIDENCE");
  // Trusted transport returns this minimal receipt, not arbitrary provider data.
  // Present-but-hidden/accessor fields must not masquerade as missing evidence.
  const allowed=["accepted","rejected","pending","messageId","response","envelope"];
  for(const key of Reflect.ownKeys(result)){
    const d=Object.getOwnPropertyDescriptor(result,key);
    if(typeof key!=="string"||!allowed.includes(key)||!d?.enumerable||!Object.hasOwn(d,"value"))return unknown("INVALID_TRANSPORT_EVIDENCE");
  }
  const accepted=own(result,"accepted"),rejected=own(result,"rejected"),pending=own(result,"pending"),messageId=own(result,"messageId");
  // No transport-controlled getters or unbounded provider responses are copied.
  const list=value=>Array.isArray(value)&&Object.getPrototypeOf(value)===Array.prototype&&value.length<=1000&&Reflect.ownKeys(value).length===value.length+1&&Reflect.ownKeys(value).every(k=>{
    if(k==="length")return true;
    const d=Object.getOwnPropertyDescriptor(value,k);
    return typeof k==="string"&&/^(0|[1-9]\d*)$/.test(k)&&d?.enumerable&&Object.hasOwn(d,"value");
  });
  if(!list(accepted)||!list(rejected)||pending!==undefined&&!list(pending))return unknown("INVALID_TRANSPORT_EVIDENCE");
  if(rejected.length)return unknown("RECIPIENT_REJECTED");
  if(pending?.length)return unknown("RECIPIENT_PENDING");
  if(accepted.length!==1||own(accepted,"0")!==recipient)return unknown("RECIPIENT_ACCEPTANCE_UNPROVEN");
  if(Object.hasOwn(result,"envelope")){
    const envelope=own(result,"envelope");
    if(!envelope||typeof envelope!=="object"||Array.isArray(envelope)||![Object.prototype,null].includes(Object.getPrototypeOf(envelope)))return unknown("INVALID_TRANSPORT_EVIDENCE");
    for(const key of Reflect.ownKeys(envelope)){
      const d=Object.getOwnPropertyDescriptor(envelope,key);
      if(!["to","from"].includes(key)||!d?.enumerable||!Object.hasOwn(d,"value"))return unknown("INVALID_TRANSPORT_EVIDENCE");
    }
    const to=own(envelope,"to");
    if(!list(to)||to.length!==1||own(to,"0")!==recipient)return unknown("RECIPIENT_ACCEPTANCE_UNPROVEN");
  }
  if(Object.hasOwn(result,"response")){
    const response=own(result,"response");
    if(typeof response!=="string"||response.length>2000||/[\u0000-\u001f\u007f]/.test(response)||!/^2\d\d(?:[ -]|$)/.test(response))return unknown("SMTP_ACCEPTANCE_UNPROVEN");
  }
  if(typeof messageId!=="string"||!messageId||messageId!==messageId.trim()||messageId.length>500||/[\u0000-\u001f\u007f]/.test(messageId))return unknown("MESSAGE_ID_MISSING");
  return Object.freeze({outcome:"ACCEPTED",reason:"RECIPIENT_ACCEPTED",messageId,automaticRetryAllowed:false});
}

export function createAutomaticReportMailAdapter({startAttempt,sendMail}){
  if(typeof startAttempt!=="function"||typeof sendMail!=="function")fail();
  return Object.freeze({async attempt(raw){
    const args=request(raw);
    // A rejected/failed start makes zero send calls. An ambiguous commit must
    // be recovered by the trusted driver; it must never blindly repeat a send.
    const receipt=await startAttempt(args.scope,Object.freeze({expectedVersion:args.expectedVersion,token:args.token,now:args.now}));
    let r;try{r=started(receipt,args)}catch{return unknown("START_RECEIPT_INVALID")}
    // No Promise.race timer: send could continue after a local timer expires.
    // The injected transport owns its timeout; any uncertainty is terminal.
    try{
      const result=await sendMail(Object.freeze({to:r.input.recipient,subject:`ΠΡΟΣΩΡΙΝΗ ΑΝΑΦΟΡΑ ΤΑΜΕΙΩΝ · ${r.input.frequency} · ${r.input.periodFrom} — ${r.input.periodTo}`,text:args.payload.body}));
      return evidence(result,r.input.recipient);
    }catch{return unknown("TRANSPORT_UNCERTAIN")}
  }});
}
