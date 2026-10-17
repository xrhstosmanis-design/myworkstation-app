// SupplierProductLink is unique per company/supplier/product. Coalesce only
// compatible codes; retain redundant source rows as inactive historical links.
export const supplierMergeCode=value=>String(value??'').trim().toLocaleUpperCase('el-GR').replace(/\s+/g,'');
export function inventorySupplierMergePlan(links,targetId){
 const groups=new Map();
 for(const link of links){const group=groups.get(link.supplierId)||[];group.push(link);groups.set(link.supplierId,group);}
 return [...groups.entries()].sort(([a],[b])=>a.localeCompare(b)).map(([supplierId,group])=>{
  const sorted=[...group].sort((a,b)=>a.id.localeCompare(b.id));
  const keeper=sorted.find(row=>row.productId===targetId)||sorted[0];
  const codes=[...new Set(sorted.map(row=>supplierMergeCode(row.supplierCode)).filter(Boolean))].sort();
  const codeSource=supplierMergeCode(keeper.supplierCode)?keeper:sorted.find(row=>supplierMergeCode(row.supplierCode));
  return {supplierId,keepId:keeper.id,archiveIds:sorted.filter(row=>row.id!==keeper.id).map(row=>row.id),supplierCode:codeSource?.supplierCode??null,active:sorted.some(row=>row.active===true),codes};
 });
}
export async function applyInventorySupplierMerge(tx,companyId,targetId,plan){
 for(const group of plan){
  if(group.codes.length>1)throw Object.assign(new Error('Διαφορετικοί κωδικοί στον ίδιο προμηθευτή. Απαιτείται έλεγχος αντιστοίχισης.'),{status:409});
  if(group.archiveIds.length)await tx.$executeRaw`UPDATE "SupplierProductLink" SET "active"=false,"updatedAt"=NOW()
   WHERE "companyId"=${companyId} AND "supplierId"=${group.supplierId} AND "id"=ANY(${group.archiveIds}::text[])`;
  await tx.$executeRaw`UPDATE "SupplierProductLink" SET "productId"=${targetId},"supplierCode"=${group.supplierCode},"active"=${group.active},"updatedAt"=NOW()
   WHERE "companyId"=${companyId} AND "supplierId"=${group.supplierId} AND "id"=${group.keepId}`;
 }
}
