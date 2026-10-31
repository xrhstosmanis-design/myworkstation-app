import {createHash} from "node:crypto";

// PURE METADATA MODEL ONLY. Trusted future adapters must freshly obtain the
// assertions below; these caller-supplied values are not authorization proof.
// A durable adapter must atomically enforce unique slotId + version/token CAS,
// persist CLAIMED and then ATTEMPTING BEFORE any external I/O, and never invoke
// transport unless that commit succeeded. This model provides no persistence,
// locks, SMTP, scheduling, financial reconciliation or exactly-once delivery.
const STATES=new Set(["PENDING","CLAIMED","ATTEMPTING","ACCEPTED","UNKNOWN"]);
const INPUT_KEYS=["companyId","storeId","reportType","frequency","periodFrom","periodTo","recipient","snapshot"];
const SNAPSHOT_KEYS=["settingsVersion","recipientVersion","consentRevision","lifecycleGeneration","sourceFingerprint","payloadFingerprint","policyFingerprint","principalId","financialFinality","financialReconciliationComplete"];
const GATES=["companyActive","storeActive","licenseActive","moduleActive","principalAuthorized","recipientVerified","consentActive","dispatchEnabled","sourceReady","policyAllowsProvisional"];
const RECORD_KEYS=["slotId","input","status","version","token","usedTokens","leaseUntil","attemptStartedAt","completedAt","messageId","createdAt","updatedAt"];
const fail=(code,message)=>{throw Object.assign(new Error(message),{code})};
const invalid=message=>fail("INVALID_INPUT",message);

function safe(value,depth=0,budget={nodes:0}){
  if(++budget.nodes>20000||depth>15)invalid("Metadata exceeds validation bounds.");
  if(value===null||typeof value==="string"||typeof value==="boolean")return;
  if(typeof value==="number"){if(!Number.isFinite(value))invalid("Non-finite metadata.");return;}
  if(typeof value!=="object")invalid("Only JSON metadata is accepted.");
  const array=Array.isArray(value),proto=Object.getPrototypeOf(value);
  if(array?proto!==Array.prototype:proto!==Object.prototype&&proto!==null)invalid("Plain own metadata required.");
  const descriptors=Object.getOwnPropertyDescriptors(value);
  for(const key of Reflect.ownKeys(descriptors)){
    if(typeof key!=="string"||["__proto__","constructor","prototype"].includes(key))invalid("Unsafe metadata key.");
    if(array&&key==="length")continue;
    const d=descriptors[key];
    if(!d.enumerable||!Object.hasOwn(d,"value"))invalid("Accessors and hidden properties are forbidden.");
    if(array&&!/^(0|[1-9]\d*)$/.test(key))invalid("Array properties are forbidden.");
    safe(d.value,depth+1,budget);
  }
  if(array){if(value.length>1000||Object.keys(value).length!==value.length)invalid("Dense bounded arrays required.");}
}
function shape(value,keys){
  if(!value||typeof value!=="object"||Array.isArray(value))invalid("Object required.");
  const actual=Object.keys(value);
  if(actual.length!==keys.length||actual.some(k=>!keys.includes(k)))invalid("Unexpected or missing metadata fields.");
}
function text(value,name,max=200){if(typeof value!=="string"||!value||value!==value.trim()||value.length>max||/[\u0000-\u001f\u007f]/.test(value))invalid(`Invalid ${name}.`);return value;}
function instant(value){
  if(typeof value!=="string"||!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value))invalid("Canonical UTC instant required.");
  const ms=Date.parse(value);if(!Number.isFinite(ms)||new Date(ms).toISOString()!==value)invalid("Invalid UTC instant.");return ms;
}
function integer(value,min=1){if(!Number.isSafeInteger(value)||value<min)invalid("Positive safe integer required.");return value;}
function detached(value){return JSON.parse(JSON.stringify(value));}
function frozen(value){if(value&&typeof value==="object"){for(const v of Object.values(value))frozen(v);Object.freeze(value);}return value;}
const output=value=>frozen(detached(value));
function normalizeInput(value){
  safe(value);shape(value,INPUT_KEYS);const result={};
  result.companyId=text(value.companyId,"companyId");result.storeId=text(value.storeId,"storeId");
  if(value.reportType!=="CASH"||!["DAILY","WEEKLY","MONTHLY"].includes(value.frequency))invalid("Unsupported report kind.");
  result.reportType=value.reportType;result.frequency=value.frequency;
  if(instant(value.periodFrom)>=instant(value.periodTo))invalid("Nonempty exclusive period required.");
  result.periodFrom=value.periodFrom;result.periodTo=value.periodTo;
  // Match existing report-recipients.js application convention (whole-address
  // trim/lowercase), without accepting its multi-recipient delimiter syntax.
  if(typeof value.recipient!=="string"||/[\r\n,;]/.test(value.recipient))invalid("One recipient required.");
  const recipient=text(value.recipient.trim().toLowerCase(),"recipient",254);
  const parts=recipient.split("@"),local=parts[0],domain=parts[1],labels=domain?.split(".")||[];
  if(parts.length!==2||!local||local.length>64||local.startsWith(".")||local.endsWith(".")||local.includes("..")||
    !/^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+$/.test(local)||labels.length<2||
    labels.some(label=>label.length>63||!/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/.test(label))||
    !/^[a-z]{2,}$/.test(labels.at(-1)))invalid("One canonical recipient required.");
  result.recipient=recipient;shape(value.snapshot,SNAPSHOT_KEYS);result.snapshot={};
  for(const k of ["settingsVersion","recipientVersion","consentRevision"])result.snapshot[k]=integer(value.snapshot[k]);
  // Native store-lifecycle-generation.js exposes canonical PostgreSQL int64
  // decimal STRINGS, including '0' when no fence exists. Preserve that exact
  // identity; never lose precision through Number or coerce zero to one.
  const generation=value.snapshot.lifecycleGeneration;
  if(typeof generation!=="string"||generation.length>19||!/^(0|[1-9]\d*)$/.test(generation)||BigInt(generation)>9223372036854775807n)invalid("Canonical lifecycle generation required.");
  result.snapshot.lifecycleGeneration=generation;
  for(const k of ["sourceFingerprint","payloadFingerprint","policyFingerprint"]){if(typeof value.snapshot[k]!=="string"||!/^([a-f0-9]{64})$/.test(value.snapshot[k]))invalid("Canonical SHA256 fingerprint required.");result.snapshot[k]=value.snapshot[k];}
  result.snapshot.principalId=text(value.snapshot.principalId,"principalId");
  if(value.snapshot.financialFinality!=="PROVISIONAL"||value.snapshot.financialReconciliationComplete!==false)invalid("This model only supports explicitly provisional reports.");
  result.snapshot.financialFinality="PROVISIONAL";result.snapshot.financialReconciliationComplete=false;
  return result;
}
function slotId(input){
  // Versions/hashes deliberately excluded: editing a report/recipient setting
  // cannot create a second automatic-send permission for the same period.
  return createHash("sha256").update(JSON.stringify([input.companyId,input.storeId,input.reportType,input.frequency,input.periodFrom,input.periodTo,input.recipient])).digest("hex");
}
function gate(input,current,now){
  safe(current);
  const administrator=current?.recipientAuthorizationBasis==='SUPER_ADMIN';
  shape(current,[...INPUT_KEYS,"checkedAt",...GATES,"maintenanceBlocked",...(administrator?["recipientAuthorizationBasis","administratorAuthorizationActive"]:[])]);
  const metadata=Object.fromEntries(INPUT_KEYS.map(k=>[k,current[k]]));
  if(JSON.stringify(normalizeInput(metadata))!==JSON.stringify(input)||current.checkedAt!==now)fail("STALE_GATE","Fresh exact scope/snapshot assertions required.");
  const required=administrator?GATES.filter(k=>!["recipientVerified","consentActive"].includes(k)):GATES;
  if(required.some(k=>current[k]!==true)||current.maintenanceBlocked!==false||administrator&&(current.administratorAuthorizationActive!==true||current.consentActive!==false||typeof current.recipientVerified!=='boolean'))fail("DELIVERY_BLOCKED","Delivery is not explicitly eligible.");
  if(instant(input.periodTo)>instant(now))fail("DELIVERY_BLOCKED","Report period is not closed.");
}
function record(value){
  safe(value);shape(value,RECORD_KEYS);const input=normalizeInput(value.input);
  if(value.slotId!==slotId(input)||!STATES.has(value.status))invalid("Invalid delivery identity/state.");
  integer(value.version);instant(value.createdAt);instant(value.updatedAt);
  if(instant(value.updatedAt)<instant(value.createdAt)||instant(input.periodTo)>instant(value.createdAt))invalid("Invalid record timeline.");
  if(!Array.isArray(value.usedTokens)||new Set(value.usedTokens).size!==value.usedTokens.length)invalid("Invalid token history.");
  for(const token of value.usedTokens)text(token,"lease token",200);
  const pending=value.status==="PENDING",claimed=value.status==="CLAIMED",attempt=value.status==="ATTEMPTING",terminal=["ACCEPTED","UNKNOWN"].includes(value.status);
  if(pending){if([value.token,value.leaseUntil,value.attemptStartedAt,value.completedAt,value.messageId].some(v=>v!==null))invalid("Pending record has attempt state.");}
  else{
    text(value.token,"lease token",200);if(!value.usedTokens.includes(value.token))invalid("Unknown lease token.");
    if(instant(value.leaseUntil)<=instant(value.createdAt))invalid("Invalid lease.");
    if(claimed){if([value.attemptStartedAt,value.completedAt,value.messageId].some(v=>v!==null))invalid("Claimed record has completion state.");}
    if(attempt||terminal){if(instant(value.attemptStartedAt)<instant(value.createdAt)||instant(value.attemptStartedAt)>instant(value.updatedAt)||instant(value.attemptStartedAt)>=instant(value.leaseUntil))invalid("Invalid attempt timeline.");}
    if(attempt&&[value.completedAt,value.messageId].some(v=>v!==null))invalid("Active attempt has completion state.");
    if(terminal){if(instant(value.completedAt)<instant(value.attemptStartedAt)||value.completedAt!==value.updatedAt)invalid("Invalid completion timeline.");if(value.status==="ACCEPTED")text(value.messageId,"messageId",500);else if(value.messageId!==null)invalid("Unknown delivery cannot assert SMTP receipt.");}
  }
  return {...detached(value),input};
}
function options(value,keys){safe(value);shape(value,keys);return value;}
function checked(value,expectedVersion,now){const r=record(value);integer(expectedVersion);instant(now);if(r.version!==expectedVersion)fail("STALE_VERSION","Delivery version changed.");if(instant(now)<instant(r.updatedAt))invalid("Clock moved backwards.");return r;}
function next(r,now,changes){if(r.version===Number.MAX_SAFE_INTEGER)fail("DELIVERY_CONFLICT","Version exhausted.");return output({...r,...changes,version:r.version+1,updatedAt:now});}
function activeToken(r,token,now){text(token,"lease token",200);if(r.token!==token)fail("DELIVERY_CONFLICT","Lease token changed.");if(instant(now)>=instant(r.leaseUntil))fail("DELIVERY_CONFLICT","Lease expired.");}

export function createDeliverySlot(input,config){
  options(config,["now","current"]);instant(config.now);const normalized=normalizeInput(input);gate(normalized,config.current,config.now);
  return output({slotId:slotId(normalized),input:normalized,status:"PENDING",version:1,token:null,usedTokens:[],leaseUntil:null,attemptStartedAt:null,completedAt:null,messageId:null,createdAt:config.now,updatedAt:config.now});
}
export function reconcileDeliverySlot(value,input){
  const r=record(value),normalized=normalizeInput(input);
  if(r.slotId!==slotId(normalized)||JSON.stringify(r.input)!==JSON.stringify(normalized))fail("DELIVERY_CONFLICT","Existing slot/snapshot cannot be replaced automatically.");
  return output(r);
}
export function claimDelivery(value,config){
  options(config,["expectedVersion","token","now","leaseMs"]);const {expectedVersion,token,now,leaseMs}=config,r=checked(value,expectedVersion,now);
  text(token,"lease token",200);integer(leaseMs);if(leaseMs>300000)invalid("Lease exceeds five minutes.");
  if(r.status!=="PENDING"&&!(r.status==="CLAIMED"&&instant(now)>=instant(r.leaseUntil)))fail("INVALID_TRANSITION","Only pending or expired pre-attempt claims can be claimed.");
  if(r.usedTokens.includes(token)||r.usedTokens.length>=1000)fail("DELIVERY_CONFLICT","A fresh unused lease token is required.");
  const end=instant(now)+leaseMs;if(!Number.isSafeInteger(end))invalid("Lease overflow.");const leaseUntil=new Date(end).toISOString();instant(leaseUntil);
  return next(r,now,{status:"CLAIMED",token,usedTokens:[...r.usedTokens,token],leaseUntil});
}
export function startDelivery(value,config){
  options(config,["expectedVersion","token","now","current"]);const {expectedVersion,token,now,current}=config,r=checked(value,expectedVersion,now);
  if(r.status!=="CLAIMED")fail("INVALID_TRANSITION","Only a claim can start.");activeToken(r,token,now);gate(r.input,current,now);
  // Durable adapters MUST commit this transition before invoking transport.
  return next(r,now,{status:"ATTEMPTING",attemptStartedAt:now});
}
export function completeDelivery(value,config){
  safe(config);const keys=["expectedVersion","token","now","outcome"];if(Object.hasOwn(config||{},"messageId"))keys.push("messageId");shape(config,keys);
  const {expectedVersion,token,now,outcome}=config,r=checked(value,expectedVersion,now);
  if(!["ACCEPTED","UNKNOWN"].includes(outcome))invalid("Transport outcome must be accepted or unknown.");
  // The future adapter must verify this ONE recipient was positively accepted;
  // a merely planned Message-ID is not acceptance evidence. Missing/ambiguous
  // transport proof must be mapped to UNKNOWN, not an invented receipt.
  if(outcome==="ACCEPTED")text(config.messageId,"messageId",500);else if(Object.hasOwn(config,"messageId"))invalid("Unknown outcome cannot assert receipt.");
  // A callback retry must first reload the terminal CURRENT version. Matching
  // terminal acknowledgement is idempotent, with no stale-version bypass and
  // no new transport permission, lease, timestamp or receipt replacement.
  if(["ACCEPTED","UNKNOWN"].includes(r.status)){
    if(r.token!==token||r.status!==outcome||r.messageId!==(outcome==="ACCEPTED"?config.messageId:null))fail("DELIVERY_CONFLICT","Terminal acknowledgement conflicts.");
    return output(r);
  }
  if(r.status!=="ATTEMPTING")fail("INVALID_TRANSITION","Only an active attempt can complete.");activeToken(r,token,now);
  // ACCEPTED means SMTP acceptance only, never inbox delivery. Every error or
  // ambiguous outcome after START remains UNKNOWN; automatic retry is barred.
  return next(r,now,{status:outcome,completedAt:now,messageId:outcome==="ACCEPTED"?config.messageId:null});
}
export function recoverDelivery(value,config){
  options(config,["expectedVersion","now"]);const {expectedVersion,now}=config,r=checked(value,expectedVersion,now);
  if(!["CLAIMED","ATTEMPTING"].includes(r.status))return output(r);
  if(instant(now)<instant(r.leaseUntil))fail("DELIVERY_CONFLICT","Unexpired lease cannot be recovered.");
  return r.status==="CLAIMED"?next(r,now,{status:"PENDING",token:null,leaseUntil:null}):next(r,now,{status:"UNKNOWN",completedAt:now,messageId:null});
}
