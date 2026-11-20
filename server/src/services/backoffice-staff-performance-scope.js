const invalid=()=>{throw Object.assign(new Error('Δεν επιβεβαιώθηκε η προβολή απόδοσης.'),{status:503,code:'STAFF_PERFORMANCE_DATA_INVALID'})};
const bounded=rows=>{if(!Array.isArray(rows)||rows.length>10000)invalid();return rows};
// Native rolling performance predates selected-store reporting. Keep its
// calculation body unchanged and close its actual read sources here. Monthly
// reads already carry Store predicates; they retain their native windows/math.
export function storePerformanceReadDb(db,context){
 const storeId=context?.store?.id,companyId=context?.company?.id;
 if(typeof storeId!=='string'||!storeId||typeof companyId!=='string'||!companyId)invalid();
 return new Proxy(db,{get(target,key){const value=target[key];
  if(['$executeRaw','$executeRawUnsafe','$queryRawUnsafe','$transaction'].includes(key))return()=>invalid();
  if(['workforceAttendanceSession','workforceAuditLog'].includes(key))return new Proxy(value,{get(model,method){if(method!=='findMany')return()=>invalid();return async options=>bounded(await model.findMany({...options,where:{...options.where,companyId,storeId}}))}});
  if(key==='workforceEmployee')return new Proxy(value,{get(model,method){if(method!=='findFirst')return()=>invalid();return options=>model.findFirst({...options,where:{...options.where,companyId},select:{id:true,fullName:true}})}});
  if(key==='$queryRaw')return async(parts,...values)=>{
   if(!Array.isArray(parts))invalid();const sql=parts.join('?');if(/\b(?:INSERT|UPDATE|DELETE|CREATE|ALTER|FOR UPDATE)\b/i.test(sql)||!['StoreOperatorCredential','CashShiftSession','PosSaleActionAudit'].some(table=>sql.includes('FROM "'+table+'"')))invalid();
   const secured=parts.map(part=>part
    .replace(/JOIN "Store" st ON st\."id"=s\."storeId"(?! AND st\."companyId")/g,'JOIN "Store" st ON st."id"=s."storeId" AND st."companyId"=s."companyId"')
    .replace(/LEFT JOIN "StoreTransaction" t ON t\."sessionId"=s\."id"(?! AND t\."companyId")/g,'LEFT JOIN "StoreTransaction" t ON t."sessionId"=s."id" AND t."companyId"=s."companyId" AND t."storeId"=s."storeId"')
    .replace(/AND ([so])\."companyId"=a\."companyId"(?! AND [so]\."storeId")/g,'AND $1."companyId"=a."companyId" AND $1."storeId"=a."storeId"')
    .replace(/a\."details"/g,"'{}'::jsonb AS \"details\""));
   let alias=null,before=null;
   if(sql.includes('FROM "StoreOperatorCredential"')&&!/"storeId"\s*=/.test(sql))alias='';
   else if(sql.includes('FROM "CashShiftSession" s')&&!/s\."storeId"\s*=/.test(sql)){alias='s.';before='GROUP BY'}
   else if(sql.includes('FROM "PosSaleActionAudit" a')&&!/a\."storeId"\s*=/.test(sql)){alias='a.';before='ORDER BY'}
   if(alias!==null){
    const last=secured.pop();if(before){const position=last.indexOf(before);if(position<0)invalid();secured.push(last.slice(0,position)+' AND '+alias+'"storeId"=');secured.push(' '+last.slice(position))}
    else {secured.push(last+' AND "storeId"=');secured.push('')}
    values.push(storeId);
   }
   if(!/\bLIMIT\s+(?:\d+|\?)\s*$/i.test(secured.join('?')))secured[secured.length-1]+=' LIMIT 10001';secured.raw=[...secured];
   return bounded(await value.call(target,secured,...values));
  };
  return typeof value==='function'?value.bind(target):value;
 }});
}
