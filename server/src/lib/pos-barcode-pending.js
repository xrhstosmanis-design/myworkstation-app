// Read-only catalog projection. A matching name never makes two Product IDs equal.
export async function barcodeRegistrationList(db,{companyId,storeId,q="",missingOnly=false,countOnly=false,offset=0}){
  const like=`%${q}%`,limit=250;
  const result=await db.$queryRaw`
    WITH eligible AS MATERIALIZED (
      SELECT p."id",p."sku",p."name",p."masterProductId",p."companyId",
        COALESCE(sp."salePrice",p."salePrice") AS "salePrice",COALESCE(sp."currentStock",0) AS "currentStock",
        NOT EXISTS(SELECT 1 FROM "ProductBarcode" pb WHERE pb."productId"=p."id" AND btrim(pb."barcode")<>'')
        AND NOT EXISTS(SELECT 1 FROM "MasterProductBarcode" mb WHERE mb."masterProductId"=p."masterProductId" AND btrim(mb."barcode")<>''
          AND NOT EXISTS(SELECT 1 FROM "ProductBarcode" claimed JOIN "Product" owner ON owner."id"=claimed."productId"
            WHERE owner."companyId"=p."companyId" AND owner."id"<>p."id" AND claimed."barcode"=mb."barcode")) AS missing
      FROM "StoreProduct" sp JOIN "Product" p ON p."id"=sp."productId" AND p."companyId"=${companyId}
      WHERE sp."storeId"=${storeId} AND sp."active"=TRUE AND p."active"=TRUE
    ), filtered AS (
      SELECT e.* FROM eligible e WHERE (NOT ${missingOnly} OR e.missing)
      AND (${q}='' OR e."name" ILIKE ${like} OR COALESCE(e."sku",'') ILIKE ${like}
        OR EXISTS(SELECT 1 FROM "ProductBarcode" pb WHERE pb."productId"=e."id" AND pb."barcode" ILIKE ${like})
        OR EXISTS(SELECT 1 FROM "MasterProductBarcode" mb WHERE mb."masterProductId"=e."masterProductId" AND mb."barcode" ILIKE ${like}
          AND NOT EXISTS(SELECT 1 FROM "ProductBarcode" claimed JOIN "Product" owner ON owner."id"=claimed."productId"
            WHERE owner."companyId"=e."companyId" AND owner."id"<>e."id" AND claimed."barcode"=mb."barcode")))
    ), page AS (
      SELECT * FROM filtered WHERE NOT ${countOnly} ORDER BY missing DESC,"name","id" LIMIT ${limit} OFFSET ${offset}
    )
    SELECT (SELECT count(*)::int FROM eligible WHERE missing) AS "missingCount",
      (SELECT count(*)::int FROM filtered) AS "totalMatches",
      COALESCE((SELECT json_agg(json_build_object('id',e."id",'sku',e."sku",'name',e."name",'salePrice',e."salePrice",'currentStock',e."currentStock",'barcodes',
        COALESCE((SELECT json_agg(json_build_object('id',codes.id,'barcode',codes.barcode,'salePrice',codes.price) ORDER BY codes.barcode) FROM (
          SELECT pb."id" AS id,pb."barcode" AS barcode,pb."salePrice" AS price FROM "ProductBarcode" pb WHERE pb."productId"=e."id" AND btrim(pb."barcode")<>''
          UNION ALL
          SELECT NULL,mb."barcode",NULL FROM "MasterProductBarcode" mb WHERE mb."masterProductId"=e."masterProductId" AND btrim(mb."barcode")<>''
            AND NOT EXISTS(SELECT 1 FROM "ProductBarcode" own WHERE own."productId"=e."id" AND own."barcode"=mb."barcode")
            AND NOT EXISTS(SELECT 1 FROM "ProductBarcode" claimed JOIN "Product" owner ON owner."id"=claimed."productId"
              WHERE owner."companyId"=e."companyId" AND owner."id"<>e."id" AND claimed."barcode"=mb."barcode")
        ) codes),'[]')) ORDER BY e.missing DESC,e."name",e."id") FROM page e),'[]') AS rows`;
  const data=result[0]||{missingCount:0,totalMatches:0,rows:[]};
  return {missingCount:Number(data.missingCount),totalMatches:Number(data.totalMatches),offset,limit,
    rows:(data.rows||[]).map(row=>({...row,salePrice:Number(row.salePrice||0),currentStock:Number(row.currentStock||0),barcodes:(row.barcodes||[]).map(code=>({...code,salePrice:code.salePrice==null?null:Number(code.salePrice)}))}))};
}
