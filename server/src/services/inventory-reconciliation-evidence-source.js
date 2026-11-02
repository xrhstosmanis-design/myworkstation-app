import {buildInventorySourceEvidence} from './inventory-reconciliation-evidence.js';
const limit=10000;
const required={
  Sale:['id','companyId','storeId','status','source','occurredAt','createdAt','originalSaleId','reversalKind','operatorEmployeeId'],
  SaleLine:['id','saleId','productId','quantity','unitPrice','discount','lineTotal'],Employee:['id','companyId','fullName'],
  PurchaseDocument:['id','companyId','storeId','supplierId','documentNumber','documentType','documentDate','status','sourceType','createdAt','updatedAt','purchaseOrderId'],
  PurchaseDocumentLine:['id','purchaseDocumentId','productId','quantity','unit','unitsPerPackage','unitCost','netAmount'],
  Supplier:['id','companyId','name','taxId'],
  InvoiceStockPosting:['companyId','storeId','sourceDocumentId','postedDocumentId','orderId','path'],
  InvoiceDraftAlias:['companyId','storeId','aliasDocumentId','canonicalDocumentId'],
  PosSaleActionAudit:['id','companyId','storeId','saleId','relatedSaleId','actionType','actorName','reason','details','createdAt'],
  StoreOperatorAudit:['id','companyId','storeId','eventType','details','createdAt','actorId'],
  KioskAuditEvent:['id','companyId','storeId','eventType','productId','sourceId','actorName','reason','createdAt'],
  ProductPriceHistory:['id','companyId','storeId','productId','oldPrice','newPrice','changeType','createdByUserId','createdAt'],
  User:['id','companyId','fullName']
};
const exceeded=source=>{throw Object.assign(new Error(`Η πηγή ${source} υπερβαίνει το όριο ελέγχου. Δεν εκδόθηκε μερικό αποτέλεσμα.`),{status:413,code:'INVENTORY_EVIDENCE_LIMIT'});};
const checked=(name,rows)=>{if(rows.length>limit)exceeded(name);return rows;};

export async function readInventorySourceEvidence(tx,{previous,current,rows,movements}){
  // Do not run a bootstrap on a report read, nor cache missing optional tables.
  const columns=await tx.$queryRawUnsafe(`SELECT c.relname AS "table",a.attname AS "column" FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace JOIN pg_attribute a ON a.attrelid=c.oid WHERE n.nspname=current_schema() AND c.relname=ANY($1::text[]) AND a.attnum>0 AND NOT a.attisdropped`,Object.keys(required));
  const has=name=>required[name].every(column=>columns.some(x=>x.table===name&&x.column===column));
  const productIds=rows.map(x=>x.productId),from=previous.startedAt,to=current.finalizedAt,companyId=current.companyId,storeId=current.storeId;
  const capabilities={sales:has('Sale')&&has('SaleLine'),invoices:has('PurchaseDocument')&&has('PurchaseDocumentLine'),invoicePostings:has('InvoiceStockPosting'),invoiceAliases:has('InvoiceDraftAlias'),posActions:has('PosSaleActionAudit'),operatorEvents:has('StoreOperatorAudit'),productEvents:has('KioskAuditEvent'),priceHistory:has('ProductPriceHistory')};
  let sales=[],invoiceLines=[],postings=[],aliases=[],actions=[],operatorEvents=[],lateMovements=[];
  if(capabilities.sales){
    const employee=has('Employee');
    sales=checked('συναλλαγών',await tx.$queryRawUnsafe(`SELECT s."id" AS "saleId",l."id" AS "lineId",l."productId",l."quantity"::text,l."unitPrice"::text,l."discount"::text,l."lineTotal"::text,s."status",s."source",s."occurredAt",s."createdAt",s."originalSaleId",s."reversalKind",s."operatorEmployeeId" AS "actorId",${employee?'e."fullName"':'NULL::text'} AS "actorName"
      FROM "SaleLine" l JOIN "Sale" s ON s."id"=l."saleId"
      ${employee?'LEFT JOIN "Employee" e ON e."id"=s."operatorEmployeeId" AND e."companyId"=s."companyId"':''}
      JOIN "Product" p ON p."id"=l."productId" AND p."companyId"=s."companyId"
      WHERE s."companyId"=$1 AND s."storeId"=$2 AND l."productId"=ANY($3::text[])
        AND ((s."occurredAt">=$4 AND s."occurredAt"<=$5) OR(s."createdAt">=$4 AND s."createdAt"<=$5))
      ORDER BY s."createdAt",s."id",l."id" LIMIT 10001`,companyId,storeId,productIds,from,to));
    if(sales.length){
      // A late sync may have posted after the closing stocktake. Retain its
      // actual posting identity so it cannot be synthesized a second time.
      lateMovements=checked('εκπρόθεσμων κινήσεων',await tx.$queryRaw`SELECT m."id",m."productId",m."movementType",m."quantity",m."unitCost",m."sourceType",m."sourceId",m."idempotencyKey",m."note",m."createdAt",m."createdByUserId" AS "actorId",NULL::text AS "actorName"
        FROM "StockMovement" m JOIN "Product" p ON p."id"=m."productId" AND p."companyId"=${companyId}
        JOIN "Store" st ON st."id"=m."storeId" AND st."companyId"=${companyId}
        WHERE m."storeId"=${storeId} AND m."productId"=ANY(${productIds}::text[]) AND m."createdAt">${to}
          AND m."sourceId"=ANY(${[...new Set(sales.map(x=>x.saleId))]}::text[]) AND m."sourceType" IN ('POS_SALE','POS_REVERSAL','SALE','SELF_CONSUMPTION','PRODUCT_DESTRUCTION','WASTE')
        ORDER BY m."createdAt",m."id" LIMIT 10001`);
    }
  }
  if(capabilities.invoices){
    const supplier=has('Supplier');
    invoiceLines=checked('γραμμών παραστατικών',await tx.$queryRawUnsafe(`SELECT d."id" AS "documentId",l."id" AS "lineId",l."productId",l."quantity"::text,l."unit",l."unitsPerPackage"::text,l."unitCost"::text,l."netAmount"::text,
      d."supplierId",d."documentNumber",d."documentType",d."documentDate",d."status",d."sourceType",d."createdAt",d."updatedAt",d."purchaseOrderId",${supplier?'sup."name"':'NULL::text'} AS "supplierName",${supplier?'sup."taxId"':'NULL::text'} AS "supplierVat"
      FROM "PurchaseDocumentLine" l JOIN "PurchaseDocument" d ON d."id"=l."purchaseDocumentId"
      ${supplier?'LEFT JOIN "Supplier" sup ON sup."id"=d."supplierId" AND sup."companyId"=d."companyId"':''}
      WHERE d."companyId"=$1 AND d."storeId"=$2 AND(l."productId"=ANY($3::text[]) OR l."productId" IS NULL)
        AND ((d."documentDate"<=$5 AND(d."documentDate">=$4 OR d."createdAt">=$4 OR d."status" NOT IN ('APPROVED','MERGED','CANCELLED','VOID'))) OR d."id"=ANY($6::text[]) OR d."purchaseOrderId"=ANY($6::text[]))
      ORDER BY d."createdAt",d."id",l."id" LIMIT 10001`,companyId,storeId,productIds,from,to,[...new Set(movements.flatMap(x=>[x.sourceId,x.documentId]).filter(Boolean))]));
  }
  const documentIds=[...new Set(invoiceLines.map(x=>x.documentId))];
  if(capabilities.invoicePostings&&documentIds.length)postings=checked('αποδείξεων καταχώρησης',await tx.$queryRaw`SELECT "sourceDocumentId","postedDocumentId","orderId","path" FROM "InvoiceStockPosting" WHERE "companyId"=${companyId} AND "storeId"=${storeId} AND("sourceDocumentId"=ANY(${documentIds}::text[]) OR "postedDocumentId"=ANY(${documentIds}::text[])) ORDER BY "sourceDocumentId" LIMIT 10001`);
  if(capabilities.invoiceAliases&&documentIds.length)aliases=checked('αντιστοιχίσεων παραστατικών',await tx.$queryRaw`SELECT "aliasDocumentId","canonicalDocumentId" FROM "InvoiceDraftAlias" WHERE "companyId"=${companyId} AND "storeId"=${storeId} AND("aliasDocumentId"=ANY(${documentIds}::text[]) OR "canonicalDocumentId"=ANY(${documentIds}::text[])) ORDER BY "aliasDocumentId" LIMIT 10001`);
  const saleIds=[...new Set(sales.map(x=>x.saleId))];
  if(capabilities.posActions)actions=checked('συμβάντων POS',await tx.$queryRaw`SELECT "id","saleId","relatedSaleId","actionType","actorName",to_jsonb("PosSaleActionAudit")->>'actorId' AS "actorId","reason","createdAt",
    jsonb_build_object('items',"details"->'items','productId',"details"->'productId','productIds',"details"->'productIds','stockRestoredProductIds',"details"->'stockRestoredProductIds','oldPrice',"details"->'oldPrice','newPrice',"details"->'newPrice','quantity',"details"->'quantity','discount',"details"->'discount','oldBarcode',"details"->'oldBarcode','newBarcode',"details"->'newBarcode') AS details
    FROM "PosSaleActionAudit" WHERE "companyId"=${companyId} AND "storeId"=${storeId}
      AND(("createdAt">=${from} AND "createdAt"<=${to}) OR "saleId"=ANY(${saleIds}::text[]) OR "relatedSaleId"=ANY(${saleIds}::text[])) ORDER BY "createdAt","id" LIMIT 10001`);
  if(capabilities.operatorEvents){
    const actor=has('User');
    operatorEvents=checked('ιστορικού χειριστών',await tx.$queryRawUnsafe(`SELECT a."id",a."eventType",a."createdAt",${actor?'u."fullName"':'NULL::text'} AS "actorName",
      jsonb_build_object('items',a."details"->'items','productId',a."details"->'productId','productIds',COALESCE(a."details"->'productIds',jsonb_path_query_array(a."details",'$.changes[*].productId')),'sourceProductId',a."details"->'sourceProductId','targetProductId',a."details"->'targetProductId','barcode',a."details"->'barcode','saleId',a."details"->'saleId','reversalSaleId',a."details"->'reversalSaleId','oldPrice',a."details"->'oldPrice','newPrice',a."details"->'newPrice','quantity',a."details"->'quantity','discount',a."details"->'discount','oldCode',a."details"->'oldCode','newCode',a."details"->'newCode','oldBarcode',a."details"->'oldBarcode','newBarcode',a."details"->'newBarcode','reason',a."details"->'reason') AS details
      FROM "StoreOperatorAudit" a ${actor?'LEFT JOIN "User" u ON u."id"=a."actorId" AND u."companyId"=a."companyId"':''}
      WHERE a."companyId"=$1 AND a."storeId"=$2 AND a."createdAt">=$3 AND a."createdAt"<=$4
      ORDER BY a."createdAt",a."id" LIMIT 10001`,companyId,storeId,from,to));
  }
  if(capabilities.productEvents){
    const events=checked('ιστορικού προϊόντων',await tx.$queryRaw`SELECT "id","eventType","productId","sourceId" AS "saleId","actorName","reason","createdAt" FROM "KioskAuditEvent" WHERE "companyId"=${companyId} AND "storeId"=${storeId} AND "productId"=ANY(${productIds}::text[]) AND "createdAt">=${from} AND "createdAt"<=${to} ORDER BY "createdAt","id" LIMIT 10001`);
    operatorEvents.push(...events.map(x=>({...x,origin:'PRODUCT_AUDIT'})));
  }
  if(capabilities.priceHistory){
    const actor=has('User');
    const events=checked('ιστορικού τιμών',await tx.$queryRawUnsafe(`SELECT h."id",h."productId",h."changeType" AS "eventType",h."createdAt",${actor?'u."fullName"':'NULL::text'} AS "actorName",jsonb_build_object('oldPrice',h."oldPrice",'newPrice',h."newPrice") AS details
      FROM "ProductPriceHistory" h ${actor?'LEFT JOIN "User" u ON u."id"=h."createdByUserId" AND u."companyId"=h."companyId"':''}
      WHERE h."companyId"=$1 AND(h."storeId"=$2 OR h."storeId" IS NULL) AND h."productId"=ANY($3::text[]) AND h."createdAt">=$4 AND h."createdAt"<=$5 ORDER BY h."createdAt",h."id" LIMIT 10001`,companyId,storeId,productIds,from,to));
    operatorEvents.push(...events.map(x=>({...x,origin:'PRICE_HISTORY'})));
  }
  const ids=new Set(movements.map(x=>x.id));
  return buildInventorySourceEvidence({movements:[...movements,...lateMovements.filter(x=>!ids.has(x.id))],sales,invoiceLines,postings,aliases,actions,operatorEvents,capabilities,windows:rows});
}
