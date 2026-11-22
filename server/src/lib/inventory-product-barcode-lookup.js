export async function lookupInventoryProductBarcode(db,companyId,barcode,{fetchProduct=fetch,storeId=null}={}){
 if(!/^\d{6,18}$/.test(barcode))throw Object.assign(new Error('Μη έγκυρο barcode.'),{status:400});
 const local=await db.$queryRaw`SELECT p."id",p."sku",p."name",p."vatRate",c."name" AS "categoryName",sc."name" AS "subcategoryName" FROM "Product" p JOIN "ProductBarcode" pb ON pb."productId"=p."id" LEFT JOIN "ProductCategory" c ON c."id"=p."categoryId" LEFT JOIN "ProductSubcategory" sc ON sc."id"=p."subcategoryId" WHERE p."companyId"=${companyId} AND (${storeId}::text IS NULL OR EXISTS(SELECT 1 FROM "StoreProduct" bound WHERE bound."productId"=p."id" AND bound."storeId"=${storeId})) AND pb."barcode"=${barcode} LIMIT 1`;
 if(local[0])return {found:true,source:'MYWORKSTATION',product:{...local[0],vatRate:Number(local[0].vatRate||0)}};
 const master=await db.$queryRaw`SELECT mp."sourceCode" AS "sku",mp."name",mp."categoryName",mp."subcategoryName",mp."vatRate" FROM "MasterProduct" mp JOIN "MasterProductBarcode" mb ON mb."masterProductId"=mp."id" WHERE mb."barcode"=${barcode} AND mp."active"=true LIMIT 1`;
 if(master[0])return {found:true,source:'MASTER_CATALOG',product:{...master[0],vatRate:Number(master[0].vatRate||0)}};
 const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),4500);
 try{
  const response=await fetchProduct(`https://world.openfoodfacts.org/api/v2/product/${encodeURIComponent(barcode)}?fields=code,product_name,product_name_el,brands,categories,categories_tags`,{headers:{'User-Agent':'MyWorkStation/1.0 (https://myworkstation.gr)'},signal:controller.signal});
  if(response.ok){const data=await response.json(),p=data?.product;if(p&&data?.status!==0)return {found:true,source:'OPEN_FOOD_FACTS',product:{name:p.product_name_el||p.product_name||'',brandName:p.brands||'',categoryName:Array.isArray(p.categories_tags)&&p.categories_tags.length?String(p.categories_tags[0]).replace(/^..:/,''):p.categories||'',subcategoryName:'',vatRate:null}};}
 }catch{}finally{clearTimeout(timer)}
 return {found:false,source:null,product:null};
}
