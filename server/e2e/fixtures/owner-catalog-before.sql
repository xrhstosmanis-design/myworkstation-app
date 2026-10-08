
      SELECT p."id",p."sku",p."name",p."description",p."unit",p."salePrice",p."costPrice",p."vatRate",p."vatVerified",p."trackStock",p."active",p."masterProductId",p."categoryId",p."subcategoryId",
             p."staffPrice",p."deliveryPrice",p."minOrderQuantity",p."capacity",p."allowDiscount",p."allowPosPriceChange",p."freeSalePrice",p."negativeStockWarning",p."isSet",p."isRecipe",p."discountA",p."discountB",p."discountC",
             c."name" AS "categoryName",sc."name" AS "subcategoryName",COALESCE(pc."name",mp."brandName") AS "productCompanyName",vd."id" AS "vatDepartmentId",vd."description" AS "vatDepartmentName",lp."supplierName",
             (lp."supplierName" IS NOT NULL) AS "hasSupplier",
             COALESCE((SELECT json_agg(jsonb_build_object('id',pb."id",'barcode',pb."barcode",'unitMultiplier',pb."unitMultiplier",'salePrice',pb."salePrice",'name',pb."name",'updatedAt',pb."updatedAt") ORDER BY pb."barcode") FROM "ProductBarcode" pb WHERE pb."productId"=p."id"),'[]') AS barcodes,
             COALESCE(json_agg(DISTINCT jsonb_build_object('storeId',s."id",'storeName',s."name",'salePrice',sp."salePrice",'active',sp."active",'currentStock',sp."currentStock",'minStock',sp."minStock")) FILTER (WHERE s."id" IS NOT NULL),'[]') AS stores
      FROM "Product" p
      LEFT JOIN "ProductCategory" c ON c."id"=p."categoryId"
      LEFT JOIN "ProductSubcategory" sc ON sc."id"=p."subcategoryId" AND sc."companyId"=${companyId}
      LEFT JOIN "ManagementProductCompany" pc ON pc."id"=p."productCompanyId" AND pc."companyId"=${companyId}
      LEFT JOIN "MasterProduct" mp ON mp."id"=p."masterProductId"
      LEFT JOIN "ManagementVatDepartment" vd ON vd."id"=p."vatDepartmentId" AND vd."companyId"=${companyId}
      LEFT JOIN LATERAL (
        SELECT history."supplierName" FROM (
          SELECT sup."name" AS "supplierName",0 AS priority,spl."updatedAt" AS at
          FROM "SupplierProductLink" spl JOIN "Supplier" sup ON sup."id"=spl."supplierId" AND sup."companyId"=${companyId}
          WHERE spl."companyId"=${companyId} AND spl."productId"=p."id" AND spl."active"=true
          UNION ALL
          SELECT sup."name" AS "supplierName",1 AS priority,mapping."lastSeenAt" AS at
          FROM "SupplierProductMapping" mapping JOIN "Supplier" sup ON sup."id"=mapping."supplierId" AND sup."companyId"=${companyId}
          WHERE mapping."companyId"=${companyId} AND mapping."productId"=p."id"
          UNION ALL
          SELECT sup."name" AS "supplierName",2 AS priority,doc."createdAt" AS at
          FROM "PurchaseDocumentLine" line JOIN "PurchaseDocument" doc ON doc."id"=line."purchaseDocumentId" AND doc."companyId"=${companyId} LEFT JOIN "Supplier" sup ON sup."id"=doc."supplierId"
          WHERE line."productId"=p."id" AND doc."status"='APPROVED'
          UNION ALL
          SELECT sup."name" AS "supplierName",3 AS priority,ord."createdAt" AS at
          FROM "PurchaseOrderLine" line JOIN "PurchaseOrder" ord ON ord."id"=line."orderId" AND ord."companyId"=${companyId} LEFT JOIN "Supplier" sup ON sup."id"=ord."supplierId"
          WHERE line."productId"=p."id" AND ord."status" IN ('FINAL','INVOICED')
        ) history WHERE history."supplierName" IS NOT NULL ORDER BY history.priority,history.at DESC LIMIT 1
      ) lp ON true
      LEFT JOIN "StoreProduct" sp ON sp."productId"=p."id"
      LEFT JOIN "Store" s ON s."id"=sp."storeId" AND s."companyId"=${companyId}
      WHERE p."companyId"=${companyId} AND (${q===""} OR p."name" ILIKE ${like} OR p."sku" ILIKE ${like} OR EXISTS(SELECT 1 FROM "ProductBarcode" pbx WHERE pbx."productId"=p."id" AND pbx."barcode" ILIKE ${like}))
      GROUP BY p."id",c."name",sc."name",pc."name",mp."brandName",vd."id",vd."description",lp."supplierName" ORDER BY p."name" LIMIT 500