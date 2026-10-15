// Shared row order with inventory merge. Hold until the sale/order transaction ends.
// Revalidate inside the transaction: a cached cart is not proof of an active card.
export async function lockActiveSaleProducts(tx,{companyId,storeId,productIds}){
 const ids=[...new Set(productIds)].sort();
 if(!ids.length)return;
 const rows=await tx.$queryRaw`SELECT p."id",p."active" AS "productActive",sp."active" AS "storeActive" FROM "Product" p JOIN "StoreProduct" sp ON sp."productId"=p."id" AND sp."storeId"=${storeId} WHERE p."companyId"=${companyId} AND p."id"=ANY(${ids}::text[]) ORDER BY p."id" FOR UPDATE OF p,sp`;
 if(rows.length!==ids.length||rows.some(r=>!r.productActive||!r.storeActive))throw Object.assign(new Error('Η καρτέλα είδους άλλαξε ή συγχωνεύτηκε. Ανανέωσε τα είδη και πρόσθεσέ το ξανά στο καλάθι.'),{status:409,code:'PRODUCT_CARD_CHANGED'});
}
