import {createHash} from 'node:crypto';
import {ftextSettingsHash} from './ftext-installation.js';

// Pure validation only. This module cannot emit a driver file or authorize a
// payment. Its inputs must be assembled from the authorized server snapshot.
const fail=code=>{throw Object.assign(new Error(code),{code,status:409})};
function id(value){if(typeof value!=='string'||!/^[A-Za-z0-9_-]{2,80}$/.test(value))fail('FTEXT_INVALID_ID');return value;}
function scaled(value,places){
 const s=typeof value==='number'&&Number.isFinite(value)?String(value):value;
 if(typeof s!=='string'||!new RegExp(`^(0|[1-9]\\d{0,8})(?:\\.\\d{1,${places}})?$`).test(s))fail('FTEXT_INVALID_AMOUNT');
 const [whole,fraction='']=s.split('.');return BigInt(whole)*10n**BigInt(places)+BigInt(fraction.padEnd(places,'0'));
}
const decimal=(n,places)=>`${n/10n**BigInt(places)}.${String(n%10n**BigInt(places)).padStart(places,'0')}`;
const cp1253=new Set(Array.from({length:256},(_,i)=>new TextDecoder('windows-1253').decode(Uint8Array.of(i))).filter(c=>c!=='\uFFFD'));
function description(value){
 if(typeof value!=='string'||!value.trim()||value!==value.trim()||value.length>80||/[|{}\x00-\x1f\x7f-\x9f]/.test(value)||[...value].some(c=>!cp1253.has(c)))fail('FTEXT_INVALID_DESCRIPTION');
 return value;
}
function department(value){if(!/^\d{1,3}$/.test(String(value??''))||Number(value)<1||Number(value)>200)fail('FTEXT_INVALID_DEPARTMENT');return String(Number(value));}
function vatCode(value){if(!/^[1-5]$/.test(String(value??'')))fail('FTEXT_INVALID_VAT_CODE');return String(value);}
function scopeMatches(row,scope){return row&&['companyId','storeId','terminalPos','fiscalDeviceCode'].every(k=>row[k]===scope[k]);}

export function prepareFtextSalePlan({scope,settings,clientTransactionId,items,payments,total,departmentProfiles,paymentProfiles}={}){
 const settingsHash=ftextSettingsHash(settings);
 for(const k of ['companyId','storeId','terminalPos','fiscalDeviceCode'])if(!scope||id(scope[k])!==settings[k])fail('FTEXT_SCOPE_MISMATCH');
 id(clientTransactionId);
 if(!Array.isArray(items)||!items.length||items.length>400)fail('FTEXT_INVALID_LINES');
 if(!Array.isArray(departmentProfiles)||!departmentProfiles.length)fail('FTEXT_DEPARTMENTS_UNCONFIRMED');
 const profiles=new Map();
 for(const profile of departmentProfiles){
  if(!scopeMatches(profile,scope)||profile.confirmed!==true)fail('FTEXT_DEPARTMENTS_UNCONFIRMED');
  const key=department(profile.department);if(profiles.has(key))fail('FTEXT_AMBIGUOUS_DEPARTMENT');
  const vatRate=scaled(profile.vatRate,2);if(vatRate>10000n)fail('FTEXT_INVALID_VAT');
  profiles.set(key,{vatRate,vatCode:vatCode(profile.vatCode)});
 }
 let sum=0n;const lineIds=new Set();
 const lines=items.map(item=>{
  if(!scopeMatches(item,scope))fail('FTEXT_SCOPE_MISMATCH');
  const lineId=id(item.lineId);if(lineIds.has(lineId))fail('FTEXT_DUPLICATE_LINE');lineIds.add(lineId);
  const productId=id(item.productId),dept=department(item.department),profile=profiles.get(dept);
  if(!profile||scaled(item.vatRate,2)!==profile.vatRate||vatCode(item.vatCode)!==profile.vatCode)fail('FTEXT_DEPARTMENT_MISMATCH');
  const quantity=scaled(item.quantity,3),price=scaled(item.unitPrice,2),discount=scaled(item.discount,2),lineTotal=scaled(item.lineTotal,2);
  if(quantity===0n)fail('FTEXT_INVALID_QUANTITY');
  const gross=(quantity*price+500n)/1000n;
  if(discount>gross||gross-discount!==lineTotal)fail('FTEXT_LINE_TOTAL_MISMATCH');
  sum+=lineTotal;
  return {lineId,productId,description:description(item.description),quantity:decimal(quantity,3),unitPrice:decimal(price,2),discount:decimal(discount,2),lineTotal:decimal(lineTotal,2),department:dept,vatRate:decimal(profile.vatRate,2),vatCode:profile.vatCode};
 });
 const expected=scaled(total,2);if(expected===0n||sum!==expected)fail('FTEXT_SALE_TOTAL_MISMATCH');
 // Mixed/credit/IRIS need separately reviewed transport acceptance. Do not
 // reinterpret a card as cash or infer its payment code from a vendor example.
 if(!Array.isArray(payments)||payments.length!==1||!['CASH','CARD'].includes(payments[0]?.method))fail('FTEXT_PAYMENT_UNSUPPORTED');
 const payment=payments[0],matches=(paymentProfiles||[]).filter(p=>p.method===payment.method);
 if(matches.length!==1||matches[0].confirmed!==true||!scopeMatches(matches[0],scope))fail('FTEXT_PAYMENT_UNCONFIRMED');
 const code=matches[0].code;if(!Number.isInteger(code)||code<1||code>30||(payment.method==='CASH'?code!==1:code===1))fail('FTEXT_PAYMENT_CODE_INVALID');
 if(scaled(payment.amount,2)!==expected)fail('FTEXT_PAYMENT_TOTAL_MISMATCH');
 const plan={schemaVersion:'MWS_FTEXT_SALE_PLAN_V1',fiscalExecution:false,configurationId:settings.configurationId,settingsHash,scope:{companyId:scope.companyId,storeId:scope.storeId,terminalPos:scope.terminalPos,fiscalDeviceCode:scope.fiscalDeviceCode},clientTransactionId,lines,payment:{method:payment.method,code,amount:decimal(expected,2)},total:decimal(expected,2)};
 return {...plan,planHash:createHash('sha256').update(JSON.stringify(plan)).digest('hex')};
}
