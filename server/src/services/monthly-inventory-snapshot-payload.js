import {createHash} from 'node:crypto';
import {classifyMonthlyInventoryObservation} from './monthly-inventory-snapshot-period.js';

export const MONTHLY_INVENTORY_SNAPSHOT_BASIS='CURRENT_OPERATIONAL_V1';
const MAX_ROWS=20000,MAX_BYTES=4*1024*1024;
const fail=code=>{throw Object.assign(new Error(code),{code})};
const ordinal=(a,b)=>a<b?-1:a>b?1:0;
function shape(value,allowed){
 if(!value||typeof value!=='object'||Array.isArray(value)||![Object.prototype,null].includes(Object.getPrototypeOf(value)))fail('SNAPSHOT_OBJECT_INVALID');
 for(const key of Reflect.ownKeys(value)){
  if(typeof key!=='string'||!allowed.includes(key))fail('SNAPSHOT_FIELD_UNSUPPORTED');
  const d=Object.getOwnPropertyDescriptor(value,key);if(!d||!Object.hasOwn(d,'value'))fail('SNAPSHOT_ACCESSOR_REFUSED');
 }
 return value;
}
const get=(object,key)=>Object.getOwnPropertyDescriptor(object,key)?.value;
function text(value,max,{optional=false,id=false}={}){
 if(value===undefined&&optional)return '';
 if(typeof value!=='string'||value.length>max||Buffer.byteLength(value,'utf8')>max||/[\u0000-\u001f\u007f]/.test(value)||id&&(!value||value.trim()!==value))fail('SNAPSHOT_TEXT_INVALID');
 return value;
}
function array(value){
 if(!Array.isArray(value)||value.length>MAX_ROWS)fail('SNAPSHOT_ARRAY_LIMIT');
 for(const key of Reflect.ownKeys(value)){if(key==='length')continue;if(typeof key!=='string'||!/^(0|[1-9]\d*)$/.test(key)||Number(key)>=value.length)fail('SNAPSHOT_ARRAY_INVALID');const d=Object.getOwnPropertyDescriptor(value,key);if(!d||!Object.hasOwn(d,'value'))fail('SNAPSHOT_ACCESSOR_REFUSED')}
 return value;
}
function each(value,project){const rows=array(value),result=[];for(let i=0;i<rows.length;i++){const d=Object.getOwnPropertyDescriptor(rows,String(i));if(!d||!Object.hasOwn(d,'value'))fail('SNAPSHOT_ARRAY_INVALID');result.push(project(d.value))}return result}
const ten=n=>10n**BigInt(n);
function decimal(value,optional=false){
 if(value===undefined||value===null){if(optional)return {value:null,reason:'MISSING'};fail('SNAPSHOT_QUANTITY_INVALID')}
 if(!['string','number','boolean'].includes(typeof value))fail('SNAPSHOT_VALUE_INVALID');
 if(typeof value==='string'&&value.length>32)fail('SNAPSHOT_DECIMAL_LIMIT');
 if(typeof value!=='string'||value.trim()!==value||! /^-?(?:0|[1-9]\d{0,17})(?:\.\d{1,12})?$/.test(value)){
  if(optional)return {value:null,reason:'INVALID'};fail('SNAPSHOT_QUANTITY_INVALID');
 }
 const negative=value.startsWith('-'),[whole,fraction='']=(negative?value.slice(1):value).split('.');
 const n=BigInt(whole+fraction)*(negative?-1n:1n),number={n,scale:fraction.length};return {value:format(number),number,reason:null};
}
function format({n,scale}){
 if(n===0n)return '0';const negative=n<0n;let digits=(negative?-n:n).toString().padStart(scale+1,'0');
 let s=scale?digits.slice(0,-scale)+'.'+digits.slice(-scale):digits;
 if(scale)s=s.replace(/0+$/,'').replace(/\.$/,'');return (negative?'-':'')+s;
}
const add=(a,b)=>{const scale=Math.max(a.scale,b.scale);return {n:a.n*ten(scale-a.scale)+b.n*ten(scale-b.scale),scale}};
const multiply=(a,b)=>({n:a.n*b.n,scale:a.scale+b.scale});
const zero=()=>({n:0n,scale:0});
function canonical(value){if(value===null||typeof value!=='object')return JSON.stringify(value);if(Array.isArray(value))return '['+value.map(canonical).join(',')+']';return '{'+Object.keys(value).sort(ordinal).map(k=>JSON.stringify(k)+':'+canonical(value[k])).join(',')+'}'}
const hash=value=>createHash('sha256').update(canonical(value),'utf8').digest('hex');
function freeze(value){if(value&&typeof value==='object'){for(const v of Object.values(value))freeze(v);Object.freeze(value)}return value}
const dateDay=(value,optional=false)=>{if((value===undefined||value===null||value==='')&&optional)return '';if(typeof value!=='string')fail('SNAPSHOT_DOCUMENT_DATE_INVALID');const day=text(value,10);if(!/^\d{4}-\d{2}-\d{2}$/.test(day)||!Number.isFinite(Date.parse(day+'T00:00:00.000Z'))||new Date(day+'T00:00:00.000Z').toISOString().slice(0,10)!==day)fail('SNAPSHOT_DOCUMENT_DATE_INVALID');return day};

// Validates only the format of supplied facts. It never reads sources, proves
// authorization, stores a snapshot or supplies a physical capture receipt.
export function buildMonthlyInventorySnapshotCandidate(input){
 shape(input,['companyId','storeId','lifecycleGeneration','issueMonth','sourceObservedAt','sourceRevision','valuationBasis','coverage','products','invoices','pendingOriginals']);
 const companyId=text(get(input,'companyId'),160,{id:true}),storeId=text(get(input,'storeId'),160,{id:true}),generation=get(input,'lifecycleGeneration');
 if(typeof generation!=='string'||generation.length>19||generation.trim()!==generation||!/^(0|[1-9]\d*)$/.test(generation)||BigInt(generation)>9223372036854775807n)fail('SNAPSHOT_GENERATION_INVALID');
 const sourceRevision=get(input,'sourceRevision');if(typeof sourceRevision!=='string'||sourceRevision.length!==40||!/^[a-f0-9]{40}$/.test(sourceRevision))fail('SNAPSHOT_REVISION_INVALID');
 if(get(input,'valuationBasis')!==MONTHLY_INVENTORY_SNAPSHOT_BASIS)fail('SNAPSHOT_BASIS_INVALID');
 const period=classifyMonthlyInventoryObservation(get(input,'issueMonth'),get(input,'sourceObservedAt'));
 const coverage=shape(get(input,'coverage'),['complete','productCount','invoiceCount','pendingOriginalCount']);
 if(get(coverage,'complete')!==true)fail('SNAPSHOT_COVERAGE_INCOMPLETE');
 const rawProducts=get(input,'products'),invoicesInput=shape(get(input,'invoices'),['period','items']),pendingInput=shape(get(input,'pendingOriginals'),['period','items']);
 const rawInvoices=get(invoicesInput,'items'),rawPending=get(pendingInput,'items');
 for(const [key,rows]of [['productCount',rawProducts],['invoiceCount',rawInvoices],['pendingOriginalCount',rawPending]]){
  if(!Array.isArray(rows)||rows.length>MAX_ROWS)fail('SNAPSHOT_ARRAY_LIMIT');
  if(!Number.isSafeInteger(get(coverage,key))||get(coverage,key)<0||get(coverage,key)>MAX_ROWS||get(coverage,key)!==rows.length)fail('SNAPSHOT_COVERAGE_MISMATCH');
 }
 if(get(invoicesInput,'period')!==period.issueMonth)fail('SNAPSHOT_INVOICE_PERIOD_INVALID');if(get(pendingInput,'period')!=='ALL_MONTHS')fail('SNAPSHOT_PENDING_PERIOD_INVALID');
 const metadata={companyId,storeId,lifecycleGeneration:generation,sourceRevision,valuationBasis:MONTHLY_INVENTORY_SNAPSHOT_BASIS,period};
 let budget=Buffer.byteLength(canonical(metadata))+1024;
 const account=row=>{budget+=Buffer.byteLength(canonical(row))+1;if(budget>MAX_BYTES)fail('SNAPSHOT_PAYLOAD_LIMIT');return row};
 const scope=row=>{if(get(row,'companyId')!==companyId||get(row,'storeId')!==storeId)fail('SNAPSHOT_FOREIGN_SCOPE');return text(get(row,'id'),160,{id:true})};
 const unique=(rows,key='id')=>{const seen=new Set();for(const row of rows){if(seen.has(row[key]))fail('SNAPSHOT_DUPLICATE_ID');seen.add(row[key])}rows.sort((a,b)=>ordinal(a[key],b[key]));return rows};
 const units=new Map();
 const products=unique(each(rawProducts,row=>{
  shape(row,['id','companyId','storeId','name','sku','unit','quantity','retailUnitPrice','purchaseUnitCost']);
  const id=scope(row),unit=text(get(row,'unit'),48,{id:true}),quantity=decimal(get(row,'quantity')),retail=decimal(get(row,'retailUnitPrice'),true),purchase=decimal(get(row,'purchaseUnitCost'),true);
  const result=account({id,companyId,storeId,name:text(get(row,'name'),512),sku:text(get(row,'sku'),128,{optional:true}),unit,quantity:quantity.value,retailUnitPrice:retail.value,purchaseUnitCost:purchase.value,retailUnknownReason:retail.reason,purchaseUnknownReason:purchase.reason,retailValue:retail.number?format(multiply(quantity.number,retail.number)):null,purchaseValue:purchase.number?format(multiply(quantity.number,purchase.number)):null});
  const total=units.get(unit)||{unit,quantity:zero(),knownRetailValue:zero(),knownPurchaseValue:zero(),unknownRetailCount:0,unknownPurchaseCount:0};total.quantity=add(total.quantity,quantity.number);
  if(retail.number)total.knownRetailValue=add(total.knownRetailValue,multiply(quantity.number,retail.number));else total.unknownRetailCount++;
  if(purchase.number)total.knownPurchaseValue=add(total.knownPurchaseValue,multiply(quantity.number,purchase.number));else total.unknownPurchaseCount++;
  units.set(unit,total);return result;
 }));
 const categories=new Set(['UNPOSTED_DOCUMENT','UPLOADED_AWAITING_REVIEW','POSSIBLE_DUPLICATE','IDENTITY_OR_LINK_REVIEW','MISSING_ORIGINAL']);
 const invoices={period:period.issueMonth,items:unique(each(rawInvoices,row=>{
  shape(row,['id','companyId','storeId','documentNumber','supplierName','issueDay','categories','totalAmount']);const id=scope(row),issueDay=dateDay(get(row,'issueDay')),total=decimal(get(row,'totalAmount'),true);
  if(issueDay&&(issueDay<period.issueFromDay||issueDay>=period.issueToDayExclusive))fail('SNAPSHOT_INVOICE_PERIOD_INVALID');
  const flags=each(get(row,'categories'),value=>{if(typeof value!=='string'||!categories.has(value))fail('SNAPSHOT_CATEGORY_INVALID');return value});if(new Set(flags).size!==flags.length)fail('SNAPSHOT_CATEGORY_INVALID');flags.sort(ordinal);
  return account({id,companyId,storeId,documentNumber:text(get(row,'documentNumber'),160,{optional:true}),supplierName:text(get(row,'supplierName'),512,{optional:true}),issueDay,categories:flags,totalAmount:total.value,totalAmountUnknownReason:total.reason});
 }))};
 const statuses=new Set(['AWAITING_INVOICE','UPLOADED_AWAITING_REVIEW','REVIEW_REQUIRED']);
 const pendingOriginals={period:'ALL_MONTHS',items:unique(each(rawPending,row=>{
  shape(row,['id','companyId','storeId','documentNumber','supplierName','documentDate','status','amount']);const id=scope(row),status=get(row,'status'),amount=decimal(get(row,'amount'),true);if(!statuses.has(status))fail('SNAPSHOT_PENDING_STATUS_INVALID');
  return account({id,companyId,storeId,documentNumber:text(get(row,'documentNumber'),160,{optional:true}),supplierName:text(get(row,'supplierName'),512,{optional:true}),documentDate:dateDay(get(row,'documentDate'),true),status,amount:amount.value,amountUnknownReason:amount.reason});
 }))};
 for(const [key,rows]of [['productCount',products],['invoiceCount',invoices.items],['pendingOriginalCount',pendingOriginals.items]])if(!Number.isSafeInteger(get(coverage,key))||get(coverage,key)!==rows.length)fail('SNAPSHOT_COVERAGE_MISMATCH');
 const quantityByUnit=[...units.values()].sort((a,b)=>ordinal(a.unit,b.unit)).map(row=>account({unit:row.unit,quantity:format(row.quantity),retailValue:row.unknownRetailCount?null:format(row.knownRetailValue),purchaseValue:row.unknownPurchaseCount?null:format(row.knownPurchaseValue),knownRetailValueSubtotal:format(row.knownRetailValue),knownPurchaseValueSubtotal:format(row.knownPurchaseValue),unknownRetailCount:row.unknownRetailCount,unknownPurchaseCount:row.unknownPurchaseCount}));
 const source={...metadata,coverage:{complete:true,productCount:products.length,invoiceCount:invoices.items.length,pendingOriginalCount:pendingOriginals.items.length},products,invoices,pendingOriginals};
 const payload={format:'MWS_MONTHLY_INVENTORY_SNAPSHOT_CANDIDATE_V1',schemaVersion:1,candidateOnly:true,persisted:false,validationBasis:'FORMAT_VALIDATED_ONLY',...source,quantityByUnit};
 const payloadCanonical=canonical(payload);if(Buffer.byteLength(payloadCanonical)>MAX_BYTES)fail('SNAPSHOT_PAYLOAD_LIMIT');
 const candidate={...payload,sourceHash:hash(source),payloadHash:createHash('sha256').update(payloadCanonical,'utf8').digest('hex')};
 if(Buffer.byteLength(canonical(candidate))>MAX_BYTES)fail('SNAPSHOT_PAYLOAD_LIMIT');return freeze(candidate);
}
