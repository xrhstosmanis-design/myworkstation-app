import crypto from 'node:crypto';

export async function destroyInventoryProduct(tx,{companyId,storeId,productId,quantity,reason,userId}) {
  // Serialize with sales, transfers and stocktake finalization before measuring stock.
  const [row]=await tx.$queryRaw`SELECT sp."currentStock",p."costPrice",p."name" FROM "StoreProduct" sp JOIN "Product" p ON p."id"=sp."productId" JOIN "Store" s ON s."id"=sp."storeId" WHERE p."companyId"=${companyId} AND s."companyId"=${companyId} AND p."id"=${productId} AND s."id"=${storeId} FOR UPDATE OF sp`;
  if(!row)throw Object.assign(new Error('Δεν βρέθηκε το προϊόν στο συγκεκριμένο κατάστημα.'),{status:404});
  const current=Number(row.currentStock||0);
  if(current<0||quantity>current)throw Object.assign(new Error('Η καταστροφή δεν μπορεί να ξεπερνά το διαθέσιμο stock.'),{status:400});
  const nextStock=current-quantity;
  await tx.$executeRaw`UPDATE "StoreProduct" SET "currentStock"=${nextStock},"updatedAt"=CURRENT_TIMESTAMP WHERE "storeId"=${storeId} AND "productId"=${productId}`;
  await tx.$executeRaw`INSERT INTO "StockMovement" ("id","storeId","productId","movementType","quantity","unitCost","sourceType","sourceId","note","createdByUserId") VALUES (${crypto.randomUUID()},${storeId},${productId},'WASTE',${-quantity},${Number(row.costPrice||0)},'PRODUCT_CARD',${productId},${reason},${userId})`;
  return {ok:true,previousStock:current,currentStock:nextStock,destroyed:quantity};
}
