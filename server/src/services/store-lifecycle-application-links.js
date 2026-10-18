// Explicit application links only; counts are review evidence, never deletion authority.
const links=Object.freeze([
 ['EmployeeNaturalRule','employeeId','Employee'],
 ['PurchaseOrderLine','orderId','PurchaseOrder'],
 ['PurchaseOrderPackCorrection','orderId','PurchaseOrder'],
 ['PurchaseOrderPosting','orderId','PurchaseOrder'],
 ['PurchaseOrderReopenMovement','orderId','PurchaseOrder'],
 ['PurchaseOrderTotalOverrideAudit','orderId','PurchaseOrder'],
 ['CloudDeviceCursor','deviceId','CloudDevice'],
 ['StoreChatRead','messageId','StoreChatMessage'],
 ['TableOrderLine','orderId','TableOrder']
].map(Object.freeze));
const q=x=>'"'+String(x).replaceAll('"','""')+'"';
export async function reviewLifecycleApplicationLinks(tx,{schema,tables,companyId,storeId,inventory}){
 const result=[];
 for(const [table,column,parent] of links){
  if(!tables.has(table))continue;
  const child=tables.get(table),root=tables.get(parent);
  if(!child.has(column)||!root?.has('id')||!root.has('storeId')){
   result.push({table,parent,column,action:'REVIEW',status:'SCHEMA_CHANGED',count:null});continue;
  }
  // Join Store as Employee has no companyId. Do not infer company ownership from a raw ID.
  const row=(await tx.$queryRawUnsafe(`SELECT COUNT(*)::int AS count,
   COUNT(*) FILTER (WHERE ${child.has('companyId')?'c."companyId" IS DISTINCT FROM $2':'false'} OR ${root.has('companyId')?'p."companyId" IS DISTINCT FROM $2':'false'}${child.has('storeId')?' OR c."storeId" IS DISTINCT FROM $1':''})::int AS inconsistent
   FROM ${q(schema)}.${q(table)} c JOIN ${q(schema)}.${q(parent)} p ON c.${q(column)}=p."id"
   JOIN ${q(schema)}."Store" s ON s."id"=p."storeId"
   WHERE p."storeId"=$1 AND s."companyId"=$2`,storeId,companyId))[0];
  result.push({table,parent,column,count:Number(row.count),inconsistent:Number(row.inconsistent),
   parentAction:inventory.find(x=>x.table===parent)?.action||'REVIEW',action:'REVIEW',status:'APPLICATION_LINK'});
 }
 return result;
}
