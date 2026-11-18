import {Prisma} from '@prisma/client';
import {auditReadableRecord,auditActorName,auditBusinessText} from '../../../shared/audit-readable.mjs';
import {staffError} from './backoffice-staff-access.js';

const LIMIT=10000;
const invalid=()=>{throw staffError(503,'STAFF_OWNER_AUDIT_DATA_INVALID')};
const text=(v,nullable=false)=>{if(nullable&&v===null)return null;if(typeof v!=='string'||v.length>20000)invalid();return v};
const numeric=(v,nullable=false)=>{
 if(nullable&&(v===null||v===undefined))return null;
 if(Prisma.Decimal.isDecimal(v))v=v.toNumber();
 else if(typeof v==='string'){if(v.length>64||!/^[-+]?(?:\d+(?:\.\d+)?|\.\d+)$/.test(v))invalid();v=Number(v)}
 if(typeof v!=='number'||!Number.isFinite(v)||Math.abs(v)>Number.MAX_SAFE_INTEGER)invalid();return v;
};
const date=v=>{if(!(v instanceof Date)&&typeof v!=='string')invalid();const d=new Date(v);if(!Number.isFinite(d.getTime()))invalid();return d.toISOString()};
// Closed scalar input to the unchanged native presentation. Arbitrary audit JSON,
// credential changes, allocations, actor/session identifiers and nested objects
// never reach its free-form descriptions or the delegated DTO.
const numericKeys=['amount','total','lineTotal','quantity','unitPrice','effectiveUnitPrice','price','newPrice','oldPrice','previousPrice','newTotal','oldTotal','previousTotal','newQuantity','oldQuantity','previousQuantity','stockBefore','stockAfter','previousStock','newStock','refund','referenceValue','originalTotal','reversalTotal','negativePaymentAmount','newAmount','previousAmount','proofAmount','expectedAmount','difference','shortage','expectedOperational','declaredOperational'];
const textKeys=['productName','name','sku','productSku','reason','note','terminalPos','audienceLabel','audience','paymentMethod'];
function details(value){
 if(value===null||value===undefined)return {};
 if(typeof value!=='object'||Array.isArray(value))invalid();
 const result={};
 for(const key of numericKeys)if(Object.hasOwn(value,key))result[key]=numeric(value[key],true);
 for(const key of textKeys)if(Object.hasOwn(value,key))result[key]=text(value[key],true);
 return result;
}
const sourceOfSql=sql=>sql.includes('FROM "StoreTransaction" t')?'StoreTransaction':sql.includes('FROM "PosSaleActionAudit" a')?'PosSaleActionAudit':sql.includes('FROM "StoreOperatorAudit" a')?'StoreOperatorAudit':sql.includes('FROM "StockMovement" m')?'StockMovement':sql.includes('FROM "InventoryCountEvent" e')?'InventoryCountEvent':null;

export async function readCompanyOwnerAudit(db,companyId,f){
 if(typeof companyId!=='string'||!companyId||!(f.from instanceof Date)||!(f.toExclusive instanceof Date))invalid();
 const {readOwnerAuditReport}=await import('../routes/kiosk-reports-audit.js');
 const metadata=new Map();
 const payload=await db.$transaction(async tx=>{
  await tx.$executeRawUnsafe('SET TRANSACTION READ ONLY');
  await tx.$executeRawUnsafe("SET LOCAL statement_timeout = '5000ms'");
  const readDb=new Proxy(tx,{get(target,key){
   if(['$executeRaw','$executeRawUnsafe','$transaction'].includes(key))return()=>invalid();
   const value=target[key];
   if(key==='$queryRaw')return async(strings,...values)=>{
    const sql=strings.join('?');
    if(/\b(?:INSERT|UPDATE|DELETE|CREATE|ALTER|FOR UPDATE)\b/i.test(sql))invalid();
    const source=sourceOfSql(sql);if(!source)invalid();
    const rows=await value.call(target,strings,...values);
    if(!Array.isArray(rows)||rows.length>LIMIT)throw staffError(503,'STAFF_OWNER_AUDIT_LIMIT');
    return rows.map(row=>{
     if(row.companyId!==companyId)invalid();
     const safe={...row};
     if(Object.hasOwn(safe,'details'))safe.details=details(safe.details);
     for(const field of ['amount','quantity','unitCost'])if(Object.hasOwn(safe,field))safe[field]=numeric(safe[field],true);
     const storeName=text(row.storeName,true),storeId=storeName===null?null:text(row.storeId,true);
     metadata.set(source+':'+text(row.id),{storeId,storeName,actorName:row.actorName===null?null:text(row.actorName)});
     return safe;
    });
   };
   return typeof value==='function'?value.bind(target):value;
  }});
  // Search only the final declared metadata below. Native JSON/identifier search
  // must not create a match-count oracle for redacted details or credentials.
  return readOwnerAuditReport({companyId,superAdmin:false,from:f.from,to:f.toExclusive,storeId:f.storeId??null,q:null,timeFrom:f.timeFrom??null,timeTo:f.timeTo??null,operatorId:null,terminalPos:f.terminalPos??null,eventType:f.eventType??null,amountMin:f.amountMin??null,amountMax:f.amountMax??null},{db:readDb,videoAccessAllowed:false,enrichSaleItems:false});
 },{isolationLevel:'RepeatableRead',timeout:15000});
 if(!Array.isArray(payload.items)||payload.items.length>LIMIT)invalid();
 let items=payload.items.map(row=>{
  const source=text(row.sourceType),raw=metadata.get(source+':'+row.id);if(!raw)invalid();
  const actorName=auditActorName({actorName:raw.actorName}),eventLabel=text(row.eventLabel),createdAt=date(row.createdAt);
  if(Date.parse(createdAt)<f.from.getTime()||Date.parse(createdAt)>=f.toExclusive.getTime()||f.storeId&&raw.storeId!==f.storeId)invalid();
  const financialDetails=row.financialDetails??details(row.details);
  const description=['StoreTransaction','StockMovement','InventoryCountEvent'].includes(source)?text(row.description,true)||eventLabel:[eventLabel,financialDetails.productName,financialDetails.sku].filter(Boolean).join(' · ');
  const readable=auditReadableRecord({...row,actorName,description,financialDetails});
  return {id:text(row.id),createdAt,eventType:text(row.eventType),eventLabel,sourceType:source,storeId:raw.storeId,storeName:raw.storeName,actorName,terminalPos:text(row.terminalPos,true),amount:numeric(row.amount,true),readableDescription:text(readable.readableDescription),readableReason:readable.readableReason===null?null:text(auditBusinessText(readable.readableReason)),readableFinancials:text(readable.readableFinancials,true)};
 });
 const q=(f.q??'').toLocaleLowerCase('el-GR'),operator=(f.operatorId??'').toLocaleLowerCase('el-GR');
 items=items.filter(row=>(!q||[row.eventLabel,row.sourceType,row.storeName,row.actorName,row.terminalPos,row.readableDescription,row.readableReason,row.readableFinancials].join(' ').toLocaleLowerCase('el-GR').includes(q))&&(!operator||row.actorName.toLocaleLowerCase('el-GR').includes(operator)));
 return {from:f.fromDay,to:f.toDay,storeId:f.storeId??null,q:f.q??'',timeFrom:f.timeFrom??null,timeTo:f.timeTo??null,operatorId:f.operatorId??null,terminalPos:f.terminalPos??null,eventType:f.eventType??null,amountMin:f.amountMin??null,amountMax:f.amountMax??null,items,count:items.length,sourceOfTruth:text(payload.sourceOfTruth),window:{limit:LIMIT,kind:'NATIVE_SOURCE_WINDOWS_THEN_METADATA_SEARCH'},onlineEventsIncluded:false,videoAccessAllowed:false,note:'Περιγραφικά στοιχεία από έως 10.000 εγγραφές ανά πηγή και τελικό παράθυρο 10.000. Η αναζήτηση αφορά μόνο τις εμφανιζόμενες περιγραφές του παραθύρου. Δεν περιλαμβάνονται αναλυτικές γραμμές πώλησης, συγχώνευση online παραγγελιών ή video.'};
}
