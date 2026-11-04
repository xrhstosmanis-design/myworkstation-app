import {staffError} from './backoffice-staff-access.js';

export const inventoryListPageSize=200;
export function inventoryListCursor(query={}){
  if(Object.keys(query).some(key=>key!=='after'))throw staffError(400,'STAFF_INVALID_PAGE','Ανανέωσε τη λίστα απογραφών.');
  if(query.after===undefined)return null;
  if(typeof query.after!=='string'||!/^[A-Za-z0-9_-]{1,120}$/.test(query.after))throw staffError(400,'STAFF_INVALID_PAGE','Ανανέωσε τη λίστα απογραφών.');
  return query.after;
}

// The cursor is a visible object ID, never a client-supplied timestamp or scope.
// Compare timestamps inside PostgreSQL to retain their full stored precision.
export async function personalInventoryListPage(db,user,storeId,history,after){
  const rows=await db.$queryRaw`SELECT s."id",s."name",s."status",s."startedAt" FROM "Stocktake" s
    WHERE s."companyId"=${user.companyId} AND s."storeId"=${storeId} AND s."inventoryVersion"=2
    AND (s."status"='DRAFT' OR (${history} AND s."status"='FINALIZED'))
    AND (${after===null} OR EXISTS (SELECT 1 FROM "Stocktake" a WHERE a."id"=${after}
      AND a."companyId"=${user.companyId} AND a."storeId"=${storeId} AND a."inventoryVersion"=2
      AND (a."status"='DRAFT' OR (${history} AND a."status"='FINALIZED'))
      AND (s."startedAt"<a."startedAt" OR (s."startedAt"=a."startedAt" AND s."id">a."id"))))
    ORDER BY s."startedAt" DESC,s."id" LIMIT 201`;
  if(after!==null){
    const anchor=await db.$queryRaw`SELECT "id" FROM "Stocktake" WHERE "id"=${after}
      AND "companyId"=${user.companyId} AND "storeId"=${storeId} AND "inventoryVersion"=2
      AND ("status"='DRAFT' OR (${history} AND "status"='FINALIZED')) LIMIT 1`;
    if(!anchor.length)throw staffError(409,'STAFF_PAGE_CHANGED','Άλλαξε η λίστα απογραφών. Πάτησε ανανέωση.');
  }
  const page=rows.slice(0,inventoryListPageSize);
  return {stocktakes:page.map(({id,name,status,startedAt})=>({id,name,status,startedAt})),nextCursor:rows.length>inventoryListPageSize?page.at(-1).id:null};
}
