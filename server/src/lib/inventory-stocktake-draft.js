// All draft line mutations and finalization acquire the same parent first.
// Recheck under the transaction lock: the earlier access lookup can be stale.
export async function lockDraftInventoryStocktake(tx, stocktake) {
  const parents=await tx.$queryRaw`SELECT "id","status" FROM "Stocktake" WHERE "id"=${stocktake.id} AND "companyId"=${stocktake.companyId} FOR UPDATE`;
  if(parents[0]?.status!=='DRAFT')throw Object.assign(new Error('Η απογραφή έχει ήδη κλείσει.'),{status:409});
}
