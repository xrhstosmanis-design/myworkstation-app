import {createHash} from "node:crypto";
import {cashPreviewPeriod,reportBusinessPeriod,reportDayOffset,summarizeOpeningOperators} from "./automatic-report-policy.js";
import {validateAutomaticReviewedReceipt} from "./cash-reviewed-automatic-contract.js";

// Unwired payload preparation only. An internally consistent preview does not
// prove authorization, source authenticity, reconciliation or permission to send.
const FORMAT="MWS_AUTOMATIC_CASH_PAYLOAD_V1";
const LIMITATIONS=["DOCUMENT_PAYMENT_RECONCILIATION_NOT_VERIFIED","CASH_REVIEW_EXPLANATIONS_NOT_VERIFIED","PHYSICAL_CASH_AND_CONTROL_BALANCES_NOT_VERIFIED"];
const DISCLOSURES=[
  "ΠΡΟΣΩΡΙΝΗ ΑΝΑΦΟΡΑ — Δεν αποτελεί ολοκληρωμένη οικονομική συμφωνία.",
  "Δεν έχουν επαληθευτεί η συμφωνία παραστατικών και πληρωμών, οι αιτιολογίες ελέγχου και τα φυσικά υπόλοιπα ταμείων.",
  "Οι αρχικές διαφορές διατηρούνται. Δεν γίνεται μεταφορά ή καταλογισμός ευθύνης εργαζομένου."
];
const fail=message=>{throw Object.assign(new Error(message),{code:"INVALID_CASH_PAYLOAD"})};
const check=(condition,message)=>{if(!condition)fail(message)};
const own=(v,k)=>Object.hasOwn(v,k);
const order=(a,b)=>a<b?-1:a>b?1:0;
const by=key=>(a,b)=>order(key(a),key(b));
const canonical=value=>JSON.stringify(value,(_key,child)=>child&&typeof child==="object"&&!Array.isArray(child)?Object.fromEntries(Object.keys(child).sort().map(key=>[key,child[key]])):child);
const same=(a,b)=>canonical(a)===canonical(b);
function freeze(value){if(value&&typeof value==="object"){for(const v of Object.values(value))freeze(v);Object.freeze(value);}return value;}
function iso(value){check(typeof value==="string"&&/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value)&&Number.isFinite(Date.parse(value))&&new Date(value).toISOString()===value,"Invalid UTC instant.");return value;}
// Bound all supplied text, including ignored metadata, before serialization.
// Per-string/node limits alone would permit hundreds of MiB of input text.
function textBudget(value,budget){budget.bytes+=Buffer.byteLength(value,"utf8");check(budget.bytes<=4*1024*1024,"Metadata text exceeds four MiB.");}
function copy(value,path=[],depth=0,budget={nodes:0,bytes:0}){
  check(++budget.nodes<=100000&&depth<=20,"Metadata exceeds bounds.");
  if(value===undefined&&["employeeId","employeeName"].includes(path.at(-1)))return null;
  if(value===null||typeof value==="boolean")return value;
  if(typeof value==="string"){
    const reviewed=path[0]==="preview"&&path[1]==="reviewedCash";
    const prose=reviewed&&path.join(".")==="preview.reviewedCash.report.text";
    check(value.length<=(prose?200000:8192)&&!(reviewed?/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/:/[\u0000-\u001f\u007f]/).test(value),"Invalid text metadata.");textBudget(value,budget);return value;}
  if(typeof value==="number"){check(Number.isFinite(value),"Nonfinite metadata.");return value;}
  check(value&&typeof value==="object","Only plain metadata is accepted.");
  const prototype=Object.getPrototypeOf(value);
  if(prototype===Date.prototype){
    const allowed=path.join(".")==="preview.generatedAt"||(path.at(-2)==="period"&&["from","to"].includes(path.at(-1)));
    check(allowed&&Reflect.ownKeys(value).length===0,"Unexpected Date metadata.");
    const time=Date.prototype.getTime.call(value);check(Number.isFinite(time),"Invalid Date metadata.");const normalized=new Date(time).toISOString();textBudget(normalized,budget);return normalized;
  }
  const array=Array.isArray(value);
  check(array?prototype===Array.prototype:prototype===Object.prototype||prototype===null,"Custom metadata prototype.");
  check(!array||value.length<=1000,"Oversized array.");
  const keys=Reflect.ownKeys(value);check(keys.length<=(array?1001:1000),"Oversized metadata object.");
  const result=array?[]:{};
  for(const key of keys){
    check(typeof key==="string"&&!["__proto__","constructor","prototype"].includes(key),"Unsafe metadata key.");
    if(array&&key==="length")continue;
    check(Buffer.byteLength(key,"utf8")<=256,"Oversized metadata key.");
    textBudget(key,budget);
    const d=Object.getOwnPropertyDescriptor(value,key);check(d?.enumerable&&own(d,"value"),"Accessor or hidden metadata.");
    check(!array||/^(0|[1-9]\d*)$/.test(key),"Unexpected array property.");
    result[key]=copy(d.value,[...path,key],depth+1,budget);
  }
  check(!array||(value.length<=1000&&Object.keys(result).length===value.length),"Sparse or oversized array.");
  return result;
}
function label(value,max=200){check(typeof value==="string"&&value.trim().length>0&&value.length<=max,"Missing or oversized identifier/label.");return value;}
function cents(value){check(typeof value==="number"&&Number.isFinite(value),"Numeric amount required.");const n=Math.round(value*100);check(Number.isSafeInteger(n)&&Math.abs(value-n/100)<=1e-9,"Amount is not safe integer cents.");return n;}
function sum(a,b){const n=a+b;check(Number.isSafeInteger(n),"Amount exceeds safe precision.");return n;}
function period(value,expected){
  check(value&&typeof value==="object"&&same(value,expected),"Period does not match the business calendar.");
  iso(value.from);iso(value.to);return expected;
}
function jsonPeriod(value){return JSON.parse(JSON.stringify(value));}
function sortedSummary(value){
  check(value&&value.complete===true&&value.reason===null&&Array.isArray(value.operators),"Monthly opening-user summary unavailable.");
  return {...value,operators:value.operators.map(item=>{
    check(item&&Array.isArray(item.recordedNames)&&Array.isArray(item.sessions),"Invalid monthly opening-user entry.");
    return {...item,recordedNames:[...item.recordedNames].sort(order),sessions:[...item.sessions].sort(by(s=>canonical([s.day,s.terminalPos,s.sessionId])))};
  }).sort(by(item=>canonical([item.companyId,item.storeId,item.cashChain,item.operatorId,item.operatorId?null:item.sessions[0]?.sessionId])))};
}

export function buildAutomaticCashPayload(raw){
  try{return build(raw)}catch(error){if(error?.code==="INVALID_CASH_PAYLOAD")throw error;fail("Invalid automatic cash preview.");}
}
function build(raw){
  const args=copy(raw),{preview:p,companyId,storeId,settingsVersion}=args;
  check(args&&typeof args==="object"&&Object.keys(args).length===4&&["preview","companyId","storeId","settingsVersion"].every(k=>own(args,k)),"Explicit payload arguments required.");
  label(companyId);label(storeId);
  check(Number.isSafeInteger(settingsVersion)&&settingsVersion>0&&p?.settingsVersion===settingsVersion,"Settings version mismatch.");
  check(p.store?.id===storeId&&p.store.companyId===companyId,"Selected store mismatch.");label(p.store.name,1000);
  check(["DAILY","WEEKLY","MONTHLY"].includes(p.frequency)&&p.kind===`${p.frequency}_CASH_PREVIEW`,"Unknown preview kind.");
  check(p.ready===true&&p.complete===true&&p.sourceReadiness==="READY"&&p.deliveryStatus==="PREVIEW_ONLY"&&Array.isArray(p.holds)&&p.holds.length===0,"Only a complete READY preview can form a payload.");
  check(p.financialFinality==="PROVISIONAL"&&p.financialReconciliationComplete===false&&p.employeeLiabilityAdjusted===false,"Financial finality cannot be elevated.");
  check(Array.isArray(p.financialLimitations)&&same([...p.financialLimitations].sort(order),[...LIMITATIONS].sort(order)),"Financial limitations changed.");
  check(typeof p.sourceFingerprint==="string"&&/^[a-f0-9]{64}$/.test(p.sourceFingerprint),"Invalid source fingerprint.");
  check(Number.isSafeInteger(p.sourceCount)&&p.sourceCount>=1&&p.sourceCount<=1000,"Invalid source count.");
  check(p.period&&typeof p.period==="object","Missing period.");
  const bounds=period(p.period,jsonPeriod(cashPreviewPeriod(p.period.fromDay,p.frequency,{dayStartHour:p.period.dayStartHour})));
  iso(p.generatedAt);check(p.generatedAt>=bounds.to,"Preview predates the closed report period.");
  const rule=p.rule;
  check(rule&&["FULL","DIFFERENCE_ONLY"].includes(rule.mode)&&typeof rule.carryOverEnabled==="boolean"&&typeof rule.posEftposEnabled==="boolean","Invalid cash rule.");label(rule.deliveryTerminalPattern,120);
  const days=[];for(let day=bounds.fromDay;day<=bounds.toDay;day=reportDayOffset(day,1)){days.push(day);check(days.length<=31,"Period exceeds one month.");}
  const daySet=new Set(days),seen=new Set(),groupKeys=new Set(),idsByDay=new Map(days.map(day=>[day,[]]));
  check(Array.isArray(p.groups)&&p.groups.length>0&&p.groups.length<=1000,"Missing original groups.");
  const groups=p.groups.map(g=>{
    check(g&&g.companyId===companyId&&g.storeId===storeId&&daySet.has(g.day)&&["STORE","DELIVERY"].includes(g.cashChain)&&g.employeeLiabilityAdjusted===false,"Invalid group scope or liability.");
    label(g.terminalPos,120);
    const chain=g.terminalPos.toUpperCase().includes(rule.deliveryTerminalPattern.toUpperCase())?"DELIVERY":"STORE";
    check(g.cashChain===chain,"Cash chain differs from reporting rule.");
    const key=canonical([g.day,g.terminalPos,g.cashChain]);check(!groupKeys.has(key),"Duplicate group.");groupKeys.add(key);
    check(Array.isArray(g.rows)&&g.rows.length>0&&g.rows.length<=1000,"Missing original rows.");
    let shortage=0,surplus=0;
    const rows=g.rows.map(row=>{
      check(row&&typeof row==="object","Invalid original row.");label(row.sessionId);
      check(!seen.has(row.sessionId),"Duplicate session.");seen.add(row.sessionId);idsByDay.get(g.day).push(row.sessionId);
      const n=cents(row.variance);shortage=sum(shortage,Math.max(0,-n));surplus=sum(surplus,Math.max(0,n));
      const employeeId=row.employeeId??null,employeeName=row.employeeName??null;
      check(employeeId===null||typeof employeeId==="string"&&employeeId.length<=200,"Invalid recorded user.");
      check(employeeName===null||typeof employeeName==="string"&&employeeName.length<=1000,"Invalid recorded user name.");
      return {sessionId:row.sessionId,employeeId,employeeName,variance:n/100};
    }).sort(by(row=>row.sessionId));
    check(cents(g.originalShortage)===shortage&&cents(g.originalSurplus)===surplus&&cents(g.offset)===Math.min(shortage,surplus)&&cents(g.netVariance)===surplus-shortage,"Group totals disagree with originals.");
    return {companyId,storeId,terminalPos:g.terminalPos,cashChain:g.cashChain,day:g.day,rows,originalShortage:shortage/100,originalSurplus:surplus/100,offset:Math.min(shortage,surplus)/100,netVariance:(surplus-shortage)/100,employeeLiabilityAdjusted:false};
  }).sort(by(g=>canonical([g.day,g.terminalPos,g.cashChain])));
  check(seen.size===p.sourceCount,"Source count differs from original sessions.");
  check(Array.isArray(p.dayReadiness)&&p.dayReadiness.length===days.length,"Missing day readiness.");
  const covered=new Set();
  const dayReadiness=p.dayReadiness.map(d=>{
    check(d&&daySet.has(d.day)&&!covered.has(d.day)&&d.ready===true&&Array.isArray(d.holds)&&d.holds.length===0,"Invalid day readiness.");covered.add(d.day);
    const dailyBounds=period(d.period,jsonPeriod(reportBusinessPeriod(d.day,d.day,{dayStartHour:bounds.dayStartHour})));
    check(Array.isArray(d.sessionIds)&&d.sessionIds.every(id=>typeof id==="string")&&same([...d.sessionIds].sort(order),idsByDay.get(d.day).sort(order)),"Day sessions differ from original groups.");
    return {day:d.day,ready:true,holds:[],period:dailyBounds,sessionIds:[...d.sessionIds].sort(order)};
  }).sort(by(d=>d.day));
  let openingOperatorSummary;
  if(p.frequency==="MONTHLY"){
    const actual=sortedSummary(p.openingOperatorSummary),expected=sortedSummary(summarizeOpeningOperators(groups));
    check(same(actual,expected),"Monthly opening-user summary differs from originals.");openingOperatorSummary=expected;
  }else check(!own(p,"openingOperatorSummary"),"Monthly summary on a nonmonthly report.");
  const scope={companyId,storeId};
  const financialLimitations=[...LIMITATIONS],disclosures=[...DISCLOSURES];
  if(p.frequency==="MONTHLY")disclosures.push("Οι καταγεγραμμένοι χρήστες έναρξης δεν αποτελούν επιβεβαιωμένη ταυτότητα εργαζομένου ή στοιχείο μισθοδοσίας.");
  const reviewed=p.reviewedReconciliation===true?p.reviewedCash:null;
  if(p.reviewedReconciliation===true)check(validateAutomaticReviewedReceipt(reviewed,{companyId,storeId,groups,rule,dayStartHour:bounds.dayStartHour,sourceFingerprint:p.sourceFingerprint}),"Reviewed cash result unavailable or changed.");
  else check(!own(p,"reviewedCash"),"Unexpected reviewed cash result.");
  const content={format:FORMAT,scope,storeName:p.store.name,period:bounds,frequency:p.frequency,settingsVersion,sourceFingerprint:p.sourceFingerprint,sourceCount:p.sourceCount,financialFinality:"PROVISIONAL",financialReconciliationComplete:false,financialLimitations,employeeLiabilityAdjusted:false,disclosures,rule:{mode:rule.mode,deliveryTerminalPattern:rule.deliveryTerminalPattern,carryOverEnabled:rule.carryOverEnabled,posEftposEnabled:rule.posEftposEnabled},groups,dayReadiness,...(openingOperatorSummary?{openingOperatorSummary}:{}),...(reviewed?{reviewedCash:reviewed}:{})};
  const body=canonical(content),byteLength=Buffer.byteLength(body,"utf8");check(byteLength<=2*1024*1024,"Payload exceeds two MiB.");
  return freeze({format:FORMAT,scope,period:bounds,frequency:p.frequency,sourceFingerprint:p.sourceFingerprint,financialFinality:"PROVISIONAL",financialLimitations,contentType:"application/json; charset=utf-8",body,byteLength,payloadFingerprint:createHash("sha256").update(body,"utf8").digest("hex")});
}

export function automaticReviewedMailText(content){
  check(content&&Array.isArray(content.disclosures)&&content.disclosures.every(v=>typeof v==='string'&&v.length<=1000&&!/[\u0000-\u001f\u007f]/.test(v)),"Invalid disclosures.");
  check(validateAutomaticReviewedReceipt(content.reviewedCash,{companyId:content.scope?.companyId,storeId:content.scope?.storeId,groups:content.groups,rule:content.rule,dayStartHour:content.period?.dayStartHour,sourceFingerprint:content.sourceFingerprint}),"Invalid reviewed cash result.");
  return [...content.disclosures,'',content.reviewedCash.report.text].join('\n');
}
