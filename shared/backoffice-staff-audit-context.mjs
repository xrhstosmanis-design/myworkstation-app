import {greeceRangeDate} from './greece-time.mjs';
export const auditContextSources=Object.freeze(['StoreTransaction','PosSaleActionAudit','StoreOperatorAudit','StockMovement','InventoryCountEvent']);
export const auditContextLineFields=Object.freeze({id:'text',productId:'text?',description:'text?',sku:'text?',quantity:'number',unitPrice:'number',lineTotal:'number',discount:'number?'});
export const auditContextVideoFields=Object.freeze({terminalPos:'text',operatorName:'text?',eventType:'text',eventAt:'date',nvrEventAt:'date',timeOffsetSeconds:'integer',clipStartAt:'date',clipEndAt:'date',clipStatus:'text',expiresAt:'date'});
export const onlineAuditFields=Object.freeze({id:'text',sourceType:'text',createdAt:'date',eventType:'text',eventLabel:'text',storeId:'text',storeName:'text',description:'text',actorName:'text',orderNumber:'text',onlineStatus:'text'});
export const auditOnlinePath='/api/backoffice-staff/company/passive/audit-online';
export function auditContextFilters(query,route){
 const invalid=()=>{throw Object.assign(new Error('Μη έγκυρα φίλτρα συμβάντος.'),{status:400,code:'STAFF_AUDIT_CONTEXT_QUERY_INVALID'})};
 if(!query||typeof query!=='object'||Array.isArray(query))invalid();
 if(!route.online){if(Object.keys(query).length)invalid();return{}}
 if(Object.keys(query).some(key=>!['from','to','storeId','q'].includes(key)))invalid();const result={};
 for(const key of['from','to']){const value=query[key];if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(value)||value<'2000-01-01'||value>'2100-12-31'||!Number.isFinite(Date.parse(value+'T00:00Z'))||new Date(value+'T00:00Z').toISOString().slice(0,10)!==value)invalid();result[key]=value}
 if(result.from>result.to)invalid();
 if(query.storeId!==undefined&&(typeof query.storeId!=='string'||!query.storeId||query.storeId.length>200||query.storeId.trim()!==query.storeId||/[\x00-\x1f\x7f]/.test(query.storeId)))invalid();
 if(query.q!==undefined&&(typeof query.q!=='string'||query.q.length>120||query.q.trim()!==query.q||/[\x00-\x1f\x7f]/.test(query.q)))invalid();
 return{...result,storeId:query.storeId??null,q:query.q??'',fromDate:greeceRangeDate(result.from),toDate:greeceRangeDate(result.to,true)};
}
