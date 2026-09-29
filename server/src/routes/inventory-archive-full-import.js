import crypto from "crypto";

const uid=()=>crypto.randomUUID();
const chunks=(rows,size=500)=>Array.from({length:Math.ceil(rows.length/size)},(_,i)=>rows.slice(i*size,(i+1)*size));
const sourceName=name=>name&&!(name.startsWith("_ΧΩΡΙΣ "))?name:null;

// All statements run inside one transaction. Importing a full archive must
// either persist every row and its relationships or persist none of them.
export async function importFullArchive(tx,companyId,storeId,rows){
  const categoryMap=new Map(),subcategoryMap=new Map(),supplierMap=new Map(),brandMap=new Map(),departmentMap=new Map();
  const [categories,subcategories,suppliers,brands,departments]=await Promise.all([
    tx.$queryRaw`SELECT "id","name" FROM "ProductCategory" WHERE "companyId"=${companyId}`,
    tx.$queryRaw`SELECT sc."id",sc."name",c."name" AS "categoryName" FROM "ProductSubcategory" sc JOIN "ProductCategory" c ON c."id"=sc."categoryId" WHERE sc."companyId"=${companyId}`,
    tx.$queryRaw`SELECT "id","name" FROM "Supplier" WHERE "companyId"=${companyId}`,
    tx.$queryRaw`SELECT "id","name" FROM "ManagementProductCompany" WHERE "companyId"=${companyId}`,
    tx.$queryRaw`SELECT "id","description","vatRate" FROM "ManagementVatDepartment" WHERE "companyId"=${companyId}`
  ]);
  for(const c of categories)categoryMap.set(c.name,c.id);
  for(const s of subcategories)subcategoryMap.set(`${s.categoryName}\0${s.name}`,s.id);
  for(const s of suppliers){if(supplierMap.has(s.name))throw new Error(`Πολλαπλοί προμηθευτές με όνομα ${s.name}. Χρειάζεται επιλογή πριν την εισαγωγή.`);supplierMap.set(s.name,s.id)}
  for(const b of brands)brandMap.set(b.name,b.id);
  for(const d of departments){if(departmentMap.has(d.description)&&Number(departmentMap.get(d.description).rate)!==Number(d.vatRate))throw new Error(`Ασυμφωνία ΦΠΑ για ${d.description}`);departmentMap.set(d.description,{id:d.id,rate:Number(d.vatRate)})}

  for(const name of new Set(rows.map(r=>r.categoryName).filter(Boolean))){
    if(categoryMap.has(name))continue;
    const id=uid();await tx.$executeRaw`INSERT INTO "ProductCategory" ("id","companyId","name") VALUES (${id},${companyId},${name}) ON CONFLICT ("companyId","name") DO NOTHING`;
    const [saved]=await tx.$queryRaw`SELECT "id" FROM "ProductCategory" WHERE "companyId"=${companyId} AND "name"=${name}`;categoryMap.set(name,saved.id);
  }
  for(const row of rows){
    const key=`${row.categoryName}\0${row.subcategoryName}`;
    if(!row.subcategoryName||subcategoryMap.has(key))continue;
    const id=uid(),categoryId=categoryMap.get(row.categoryName);
    await tx.$executeRaw`INSERT INTO "ProductSubcategory" ("id","companyId","categoryId","name") VALUES (${id},${companyId},${categoryId},${row.subcategoryName})`;
    subcategoryMap.set(key,id);
  }
  for(const name of new Set(rows.map(r=>sourceName(r.supplierName)).filter(Boolean))){
    if(supplierMap.has(name))continue;
    const id=uid();await tx.$executeRaw`INSERT INTO "Supplier" ("id","companyId","name") VALUES (${id},${companyId},${name})`;
    supplierMap.set(name,id);
  }
  for(const name of new Set(rows.map(r=>sourceName(r.brandName)).filter(Boolean))){
    if(brandMap.has(name))continue;
    const id=uid();await tx.$executeRaw`INSERT INTO "ManagementProductCompany" ("id","companyId","name") VALUES (${id},${companyId},${name}) ON CONFLICT ("companyId","name") DO NOTHING`;
    const [saved]=await tx.$queryRaw`SELECT "id" FROM "ManagementProductCompany" WHERE "companyId"=${companyId} AND "name"=${name}`;brandMap.set(name,saved.id);
  }
  for(const row of rows){
    if(!row.sourceDepartment||departmentMap.has(row.sourceDepartment))continue;
    const id=uid();await tx.$executeRaw`INSERT INTO "ManagementVatDepartment" ("id","companyId","description","vatRate","commerce") VALUES (${id},${companyId},${row.sourceDepartment},${row.vatRate},true)`;
    departmentMap.set(row.sourceDepartment,{id,rate:row.vatRate});
  }
  const prepared=rows.map(row=>{
    const department=departmentMap.get(row.sourceDepartment);
    if(!department||department.rate!==row.vatRate)throw new Error(`Το τμήμα ΦΠΑ δεν αντιστοιχεί στο είδος της γραμμής ${row.row}.`);
    return {id:row.productId||uid(),action:row.action,sku:row.sku||null,name:row.name,barcode:row.barcode||null,
      categoryId:categoryMap.get(row.categoryName)||null,subcategoryId:subcategoryMap.get(`${row.categoryName}\0${row.subcategoryName}`)||null,
      supplierId:supplierMap.get(sourceName(row.supplierName))||null,supplierCode:row.supplierCode||null,
      brandId:brandMap.get(sourceName(row.brandName))||null,departmentId:department.id,
      salePrice:row.salePrice,costPrice:row.costPrice,staffPrice:row.staffPrice,minStock:row.minStock,
      discountA:row.discountA??0,discountB:row.discountB??0,discountC:row.discountC??0,
      vatRate:row.vatRate,active:row.active};
  });
  const record=`(id text,action text,sku text,name text,barcode text,"categoryId" text,"subcategoryId" text,"supplierId" text,"supplierCode" text,"brandId" text,"departmentId" text,"salePrice" numeric,"costPrice" numeric,"staffPrice" numeric,"minStock" numeric,"discountA" numeric,"discountB" numeric,"discountC" numeric,"vatRate" numeric,active boolean)`;
  for(const batch of chunks(prepared)){
    const json=JSON.stringify(batch);
    await tx.$executeRawUnsafe(`WITH r AS (SELECT * FROM jsonb_to_recordset($1::jsonb) AS x${record})
      INSERT INTO "Product" ("id","companyId","categoryId","subcategoryId","productCompanyId","vatDepartmentId","sku","name","unit","vatRate","vatVerified","salePrice","costPrice","staffPrice","discountA","discountB","discountC","trackStock","active")
      SELECT id,$2,"categoryId","subcategoryId","brandId","departmentId",sku,name,'PIECE',"vatRate",("vatRate">0),COALESCE("salePrice",0),COALESCE("costPrice",0),"staffPrice","discountA","discountB","discountC",true,active FROM r WHERE action='CREATE'`,json,companyId);
    await tx.$executeRawUnsafe(`WITH r AS (SELECT * FROM jsonb_to_recordset($1::jsonb) AS x${record})
      UPDATE "Product" p SET "sku"=COALESCE(p."sku",r.sku),"name"=r.name,"categoryId"=r."categoryId","subcategoryId"=r."subcategoryId","productCompanyId"=r."brandId","vatDepartmentId"=r."departmentId","vatRate"=r."vatRate","vatVerified"=(r."vatRate">0),
      "salePrice"=COALESCE(r."salePrice",p."salePrice"),"costPrice"=COALESCE(r."costPrice",p."costPrice"),"staffPrice"=COALESCE(r."staffPrice",p."staffPrice"),
      "discountA"=r."discountA","discountB"=r."discountB","discountC"=r."discountC","active"=r.active,"updatedAt"=CURRENT_TIMESTAMP
      FROM r WHERE r.action='UPDATE' AND p."id"=r.id AND p."companyId"=$2`,json,companyId);
    await tx.$executeRawUnsafe(`WITH r AS (SELECT * FROM jsonb_to_recordset($1::jsonb) AS x${record})
      INSERT INTO "ProductBarcode" ("id","productId","barcode","unitMultiplier")
      SELECT md5(random()::text||clock_timestamp()::text),id,barcode,1 FROM r WHERE barcode IS NOT NULL
      ON CONFLICT ("productId","barcode") DO NOTHING`,json);
    await tx.$executeRawUnsafe(`WITH r AS (SELECT * FROM jsonb_to_recordset($1::jsonb) AS x${record})
      INSERT INTO "StoreProduct" ("id","storeId","productId","salePrice","minStock","currentStock","active")
      SELECT md5(random()::text||clock_timestamp()::text),$2,id,"salePrice","minStock",0,active FROM r
      ON CONFLICT ("storeId","productId") DO UPDATE SET "salePrice"=COALESCE(EXCLUDED."salePrice","StoreProduct"."salePrice"),"minStock"=COALESCE(EXCLUDED."minStock","StoreProduct"."minStock"),"active"=EXCLUDED."active","updatedAt"=CURRENT_TIMESTAMP`,json,storeId);
    await tx.$executeRawUnsafe(`WITH r AS (SELECT * FROM jsonb_to_recordset($1::jsonb) AS x${record})
      INSERT INTO "SupplierProductLink" ("id","companyId","supplierId","productId","supplierCode","active","source")
      SELECT md5(random()::text||clock_timestamp()::text),$2,"supplierId",id,"supplierCode",true,'ARCHIVE_IMPORT' FROM r WHERE "supplierId" IS NOT NULL
      ON CONFLICT ("companyId","supplierId","productId") DO UPDATE SET "supplierCode"=COALESCE(EXCLUDED."supplierCode","SupplierProductLink"."supplierCode"),"active"=true,"updatedAt"=CURRENT_TIMESTAMP`,json,companyId);
  }
  return {created:rows.filter(r=>r.action==='CREATE').length,updated:rows.filter(r=>r.action==='UPDATE').length};
}
