// Price links are store-specific. They do not create recipe or stock rules.
const ready=new WeakMap();
export async function ensureModifierInventoryPrices(db){
  if(ready.has(db))return ready.get(db);
  const pending=db.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS "ModifierInventoryPrice" (
    "companyId" TEXT NOT NULL,"storeId" TEXT NOT NULL,"modifierId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,"updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY("companyId","storeId","modifierId"))`).catch(error=>{ready.delete(db);throw error});
  ready.set(db,pending);return pending;
}

export async function resolveModifierInventoryPrices(db,companyId,storeId,items,{strict=true}={}){
  if(!storeId)throw Object.assign(new Error("Επίλεξε κατάστημα για τις τιμές αποθήκης."),{status:400});
  await ensureModifierInventoryPrices(db);
  const ids=[...new Set(items.map(x=>x.id).filter(Boolean))];
  if(!ids.length)return items;
  const links=await db.$queryRaw`
    SELECT l."modifierId",l."productId",p."name",p."sku",
      CASE WHEN p."active"=true AND sp."active"=true THEN COALESCE(sp."salePrice",p."salePrice") END AS "inventoryPrice"
    FROM "ModifierInventoryPrice" l
    LEFT JOIN "Product" p ON p."id"=l."productId" AND p."companyId"=l."companyId"
    LEFT JOIN "StoreProduct" sp ON sp."productId"=p."id" AND sp."storeId"=l."storeId"
    WHERE l."companyId"=${companyId} AND l."storeId"=${storeId} AND l."modifierId"=ANY(${ids}::text[])`;
  const byId=new Map(links.map(x=>[x.modifierId,x]));
  return items.map(item=>{
    const link=byId.get(item.id);if(!link)return item;
    const unavailable=link.inventoryPrice==null||!Number.isFinite(Number(link.inventoryPrice))||Number(link.inventoryPrice)<0;
    if(unavailable&&strict)throw Object.assign(new Error(`Το είδος αποθήκης για «${item.description}» δεν είναι ενεργό στο κατάστημα. Διόρθωσε τη σύνδεση στη Διαχείριση.`),{status:409});
    return {...item,fixedPrice:Number(item.price||0),price:unavailable?null:Number(link.inventoryPrice),inventoryUnavailable:unavailable,inventoryProductId:link.productId,inventoryProductName:link.name,inventoryProductSku:link.sku,priceSource:"INVENTORY"};
  });
}

export async function validatePreparationInventoryPrices(db,companyId,storeId,items){
  const modifiers=items.flatMap(x=>x.modifiers||[]);
  const resolved=await resolveModifierInventoryPrices(db,companyId,storeId,modifiers);
  for(let i=0;i<resolved.length;i++){
    if(resolved[i].priceSource==="INVENTORY"&&Math.abs(Number(modifiers[i].price)-resolved[i].price)>0.00001)
      throw Object.assign(new Error("Η τιμή αποθήκης άλλαξε. Άνοιξε ξανά τις επιλογές παρασκευής πριν την αποστολή."),{status:409});
  }
}
