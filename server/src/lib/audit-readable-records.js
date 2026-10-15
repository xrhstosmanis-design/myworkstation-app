export function validateAuditTimes(query={}){
 const result={};for(const key of ["timeFrom","timeTo"]){const value=String(query[key]||"");if(value&&!/^([01]\d|2[0-3]):[0-5]\d$/.test(value))throw Object.assign(new Error("Συμπλήρωσε έγκυρη ώρα Ελλάδας σε 24ωρη μορφή."),{status:400});result[key]=value||null;}
 if(result.timeFrom&&result.timeTo&&result.timeFrom>result.timeTo)throw Object.assign(new Error("Η ώρα έως πρέπει να είναι ίδια ή μετά την ώρα από. Για διάστημα που περνά τα μεσάνυχτα χρησιμοποίησε δύο αναζητήσεις."),{status:400});
 return result;
}
const uuid=/\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/i;
function saleIdentity(row){const d=row.financialDetails||{};return row.saleId||d.saleId||(row.sourceType==="StockMovement"?d.sourceId:null)||String(row.description||"").match(uuid)?.[0]||null;}
export async function enrichAuditSaleItems(db,rows,{companyId,storeId}){
 const ids=[...new Set(rows.map(saleIdentity).filter(Boolean))];if(!ids.length)return rows;
 const lines=await db.$queryRaw`SELECT s."id" AS "saleId",s."companyId",s."storeId",l."id",l."productId",employee."fullName" AS "operatorName",l."description",l."quantity",l."unitPrice",l."lineTotal",l."discount",p."sku"
 FROM "Sale" s JOIN "SaleLine" l ON l."saleId"=s."id"
 LEFT JOIN "Employee" employee ON employee."id"=s."operatorEmployeeId" AND employee."storeId"=s."storeId"
 LEFT JOIN "Product" p ON p."id"=l."productId" AND p."companyId"=s."companyId"
 WHERE s."id"=ANY(${ids}::text[]) AND (${companyId}::text IS NULL OR s."companyId"=${companyId}) AND (${storeId}::text IS NULL OR s."storeId"=${storeId})
 ORDER BY s."id",l."createdAt",l."id"`;
 const groups=new Map();for(const l of lines){const key=JSON.stringify([l.companyId,l.storeId,l.saleId]);const values=groups.get(key)||[];values.push(l);groups.set(key,values);}
 return rows.map(row=>{const saleItems=groups.get(JSON.stringify([row.companyId,row.storeId,saleIdentity(row)]));const selected=row.sourceType==="StockMovement"?saleItems?.filter(line=>line.productId===row.productId):saleItems;return selected?.length?{...row,actorName:(!row.actorName||row.actorName==="—"||row.actorName===row.actorId||uuid.test(row.actorName))?selected[0].operatorName||row.actorName:row.actorName,saleItems:selected}:row;});
}
