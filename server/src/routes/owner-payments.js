import {Router} from "express";
import {z} from "zod";
import {prisma} from "../prisma.js";

const router=Router();
const reportQuery=z.object({
  from:z.string().optional(),
  to:z.string().optional(),
  storeId:z.string().trim().optional(),
  supplierId:z.string().trim().optional(),
  type:z.enum(["ALL","SUPPLIER_PAYMENT","OTHER_EXPENSE"]).optional().default("ALL"),
  q:z.string().trim().max(180).optional()
});

const n=value=>Number(value||0);
const isoDay=date=>new Date(date).toISOString().slice(0,10);
const purchaseDocumentMime="application/vnd.myworkstation.purchase-document";
const mapMovement=row=>{
  const hasAttachment=Boolean(row.hasAttachment);
  const linkedPurchaseDocument=row.attachmentMimeType===purchaseDocumentMime;
  return {
    ...row,
    amount:n(row.amount),
    hasAttachment,
    subtractFromShift:Boolean(row.subtractFromShift),
    purchaseDocumentId:linkedPurchaseDocument?row.attachmentFilename:null,
    evidenceMode:linkedPurchaseDocument?"DOCUMENT":hasAttachment?"LEGACY_PHOTO":"NO_DOCUMENT",
    paymentSource:row.subtractFromShift?"CASH_SHIFT":"EXTERNAL"
  };
};
const ownerRoles=new Set(["SUPER_ADMIN","OWNER","ADMIN","MANAGER"]);

function requireOwnerReport(req){
  if(req.user?.tokenType==="STORE_OPERATOR"||!ownerRoles.has(req.user?.role)){
    const error=new Error("Η αναφορά εξόδων είναι διαθέσιμη σε Super Admin, Ιδιοκτήτη, Admin ή Manager.");error.status=403;throw error;
  }
}
function dateRange(query){
  const now=new Date();
  const fallbackFrom=new Date(now.getFullYear(),now.getMonth(),1,0,0,0,0);
  const from=query.from?new Date(query.from):fallbackFrom;
  const to=query.to?new Date(query.to):now;
  if(!Number.isFinite(from.getTime())||!Number.isFinite(to.getTime())||from>to){
    const error=new Error("Μη έγκυρο διάστημα ημερομηνιών.");error.status=400;throw error;
  }
  return {from,to};
}
function txFilterType(type){return type==="ALL"?null:type}
async function verifyStore(companyId,storeId){
  if(!storeId)return null;
  const store=await prisma.store.findFirst({where:{id:storeId,companyId,active:true},select:{id:true,name:true}});
  if(!store){const error=new Error("Δεν βρέθηκε το κατάστημα.");error.status=404;throw error}
  return store;
}
function mergeByKey(primary,secondary,key,fields){
  const rows=new Map();
  for(const row of primary)rows.set(String(row[key]??""),{...row});
  for(const row of secondary){
    const id=String(row[key]??"");
    const current=rows.get(id)||{[key]:row[key]};
    rows.set(id,{...current,...Object.fromEntries(fields.map(field=>[field,row[field]]))});
  }
  return [...rows.values()];
}

router.get("/business-picture",async(req,res,next)=>{
  try{
    requireOwnerReport(req);
    const query=reportQuery.pick({from:true,to:true,storeId:true}).parse(req.query||{});
    const {from,to}=dateRange(query),companyId=req.user.companyId,storeId=query.storeId||null;
    await verifyStore(companyId,storeId);
    const [stores,sales,purchases,expenses]=await Promise.all([
      prisma.store.findMany({where:{companyId,active:true},select:{id:true,name:true},orderBy:{name:"asc"}}),
      prisma.$queryRaw`
        SELECT DATE_TRUNC('month',sa."occurredAt") AS month,DATE(sa."occurredAt") AS day,
          COUNT(DISTINCT sa."id")::int AS transactions,COALESCE(SUM(sl."lineTotal"),0) AS "salesGross",
          COALESCE(SUM(CASE WHEN sl."vatRate"=0 THEN sl."lineTotal" ELSE sl."lineTotal"/(1+sl."vatRate"/100) END),0) AS "salesNet",
          COALESCE(SUM(sl."lineTotal"-CASE WHEN sl."vatRate"=0 THEN sl."lineTotal" ELSE sl."lineTotal"/(1+sl."vatRate"/100) END),0) AS "salesVat",
          COALESCE(SUM(sl."quantity"*COALESCE(pc."unitCost",p."costPrice",0)),0) AS "costValue"
        FROM "SaleLine" sl JOIN "Sale" sa ON sa."id"=sl."saleId" AND sa."companyId"=${companyId} AND sa."status"='COMPLETED'
        LEFT JOIN "Product" p ON p."id"=sl."productId" AND p."companyId"=${companyId}
        LEFT JOIN LATERAL (
          SELECT CASE WHEN pl."unit"='PACKAGE' THEN pl."unitCost"/NULLIF(pl."unitsPerPackage",0) ELSE pl."unitCost" END AS "unitCost"
          FROM "PurchaseDocumentLine" pl JOIN "PurchaseDocument" pd ON pd."id"=pl."purchaseDocumentId"
          WHERE pd."companyId"=${companyId} AND pd."storeId"=sa."storeId" AND pd."status"='APPROVED' AND pl."productId"=sl."productId" AND pd."documentDate"<=sa."occurredAt"
          ORDER BY pd."documentDate" DESC,pd."createdAt" DESC LIMIT 1
        ) pc ON true
        WHERE sa."occurredAt">=${from} AND sa."occurredAt"<=${to} AND (${storeId}::text IS NULL OR sa."storeId"=${storeId})
        GROUP BY DATE_TRUNC('month',sa."occurredAt"),DATE(sa."occurredAt") ORDER BY day`,
      prisma.$queryRaw`
        SELECT DATE_TRUNC('month',"documentDate") AS month,DATE("documentDate") AS day,COUNT(*)::int AS documents,
          COALESCE(SUM("totalNet"),0) AS "purchaseNet",COALESCE(SUM("totalVat"),0) AS "purchaseVat",COALESCE(SUM("totalGross"),0) AS "purchaseGross"
        FROM "PurchaseDocument" WHERE "companyId"=${companyId} AND "status"='APPROVED' AND "documentDate">=${from} AND "documentDate"<=${to}
          AND (${storeId}::text IS NULL OR "storeId"=${storeId})
        GROUP BY DATE_TRUNC('month',"documentDate"),DATE("documentDate") ORDER BY day`,
      prisma.$queryRaw`
        SELECT DATE_TRUNC('month',tx."occurredAt") AS month,DATE(tx."occurredAt") AS day,
          COUNT(*) FILTER (WHERE tx."reversedAt" IS NULL)::int AS payments,
          COALESCE(SUM(tx."amount") FILTER (WHERE tx."reversedAt" IS NULL AND tx."type"='OTHER_EXPENSE'),0) AS expenses,
          COALESCE(SUM(tx."amount") FILTER (WHERE tx."reversedAt" IS NULL),0) AS "paymentTotal",
          COALESCE(SUM(pd."totalVat") FILTER (WHERE tx."reversedAt" IS NULL AND tx."type"='OTHER_EXPENSE'),0) AS "expenseVat"
        FROM "StoreTransaction" tx
        LEFT JOIN "PurchaseDocument" pd ON tx."attachmentMimeType"=${purchaseDocumentMime} AND pd."id"=tx."attachmentFilename" AND pd."companyId"=tx."companyId"
        WHERE tx."companyId"=${companyId} AND tx."type" IN ('SUPPLIER_PAYMENT','OTHER_EXPENSE') AND tx."occurredAt">=${from} AND tx."occurredAt"<=${to}
          AND (${storeId}::text IS NULL OR tx."storeId"=${storeId})
        GROUP BY DATE_TRUNC('month',tx."occurredAt"),DATE(tx."occurredAt") ORDER BY day`
    ]);
    const rows=new Map(),key=value=>new Date(value).toISOString().slice(0,10),ensure=(day,month)=>{const id=key(day);if(!rows.has(id))rows.set(id,{day:id,month:key(month).slice(0,7),transactions:0,salesGross:0,salesNet:0,salesVat:0,costValue:0,documents:0,purchaseNet:0,purchaseVat:0,purchaseGross:0,payments:0,expenses:0,paymentTotal:0,expenseVat:0});return rows.get(id)};
    for(const row of sales)Object.assign(ensure(row.day,row.month),{transactions:n(row.transactions),salesGross:n(row.salesGross),salesNet:n(row.salesNet),salesVat:n(row.salesVat),costValue:n(row.costValue)});
    for(const row of purchases)Object.assign(ensure(row.day,row.month),{documents:n(row.documents),purchaseNet:n(row.purchaseNet),purchaseVat:n(row.purchaseVat),purchaseGross:n(row.purchaseGross)});
    for(const row of expenses)Object.assign(ensure(row.day,row.month),{payments:n(row.payments),expenses:n(row.expenses),paymentTotal:n(row.paymentTotal),expenseVat:n(row.expenseVat)});
    const finish=row=>({...row,margin:row.salesNet?(row.salesNet-row.costValue)/row.salesNet*100:0,grossProfit:row.salesNet-row.costValue,netProfit:row.salesNet-row.costValue-row.expenses,purchaseSalesPercent:row.salesNet?row.purchaseNet/row.salesNet*100:0,expenseSalesPercent:row.salesNet?Math.max(0,row.expenses-row.expenseVat)/row.salesNet*100:0});
    const daily=[...rows.values()].sort((a,b)=>b.day.localeCompare(a.day)).map(finish);
    const monthlyMap=new Map();for(const row of daily){const current=monthlyMap.get(row.month)||{month:row.month,transactions:0,salesGross:0,salesNet:0,salesVat:0,costValue:0,documents:0,purchaseNet:0,purchaseVat:0,purchaseGross:0,payments:0,expenses:0,paymentTotal:0,expenseVat:0};for(const field of Object.keys(current))if(field!=="month")current[field]+=n(row[field]);monthlyMap.set(row.month,current)}
    const monthly=[...monthlyMap.values()].sort((a,b)=>b.month.localeCompare(a.month)).map(finish),totals=finish(monthly.reduce((acc,row)=>{for(const field of Object.keys(acc))if(field!=="month")acc[field]+=n(row[field]);return acc},{month:"ΣΥΝΟΛΟ",transactions:0,salesGross:0,salesNet:0,salesVat:0,costValue:0,documents:0,purchaseNet:0,purchaseVat:0,purchaseGross:0,payments:0,expenses:0,paymentTotal:0,expenseVat:0}));
    res.json({generatedAt:new Date().toISOString(),from,to,stores,monthly,daily,totals,calculationNotes:{grossProfit:"Καθαρές πωλήσεις μείον καταγεγραμμένο κόστος πωληθέντων.",netProfit:"Μικτό κέρδος μείον καταγεγραμμένα λοιπά έξοδα. Δεν αποτελεί λογιστικό ή φορολογικό αποτέλεσμα."}});
  }catch(error){next(error)}
});

router.get("/report",async(req,res,next)=>{
  try{
    requireOwnerReport(req);
    const query=reportQuery.parse(req.query||{});
    const {from,to}=dateRange(query);
    const companyId=req.user.companyId;
    const storeId=query.storeId||null;
    const supplierId=query.supplierId||null;
    const type=txFilterType(query.type);
    const needle=query.q||null;
    await verifyStore(companyId,storeId);

    const [stores,suppliers,ledgerTable]=await Promise.all([
      prisma.store.findMany({where:{companyId,active:true},select:{id:true,name:true},orderBy:{name:"asc"}}),
      prisma.$queryRaw`SELECT "id","name","taxId" FROM "Supplier" WHERE "companyId"=${companyId} AND "active"=true ORDER BY "name"`,
      prisma.$queryRaw`SELECT to_regclass('public."StoreTransaction"') IS NOT NULL AS exists`
    ]);

    if(!ledgerTable[0]?.exists){
      return res.json({
        generatedAt:new Date().toISOString(),from,to,stores,suppliers,summary:{count:0,totalExpenses:0,supplierPayments:0,otherExpenses:0,averageExpense:0,missingAttachments:0,reversedCount:0,salesTotal:0,purchasesTotal:0,percentOfSales:0,changePercent:null},
        byStore:[],bySupplier:[],categories:[],daily:[],movements:[],sourceStatus:{ledger:false,sales:true,purchases:true}
      });
    }

    const duration=Math.max(1,to.getTime()-from.getTime());
    const previousTo=new Date(from.getTime()-1);
    const previousFrom=new Date(previousTo.getTime()-duration);
    const commonWhere=async(rangeFrom,rangeTo)=>prisma.$queryRaw`
      SELECT
        COUNT(*) FILTER (WHERE t."reversedAt" IS NULL)::int AS count,
        COALESCE(SUM(t."amount") FILTER (WHERE t."reversedAt" IS NULL),0) AS total,
        COALESCE(SUM(t."amount") FILTER (WHERE t."reversedAt" IS NULL AND t."type"='SUPPLIER_PAYMENT'),0) AS "supplierPayments",
        COALESCE(SUM(t."amount") FILTER (WHERE t."reversedAt" IS NULL AND t."type"='OTHER_EXPENSE'),0) AS "otherExpenses",
        COALESCE(AVG(t."amount") FILTER (WHERE t."reversedAt" IS NULL),0) AS average,
        COUNT(*) FILTER (
          WHERE t."reversedAt" IS NULL
            AND t."attachmentData" IS NULL
            AND COALESCE(t."attachmentMimeType",'')<>${purchaseDocumentMime}
        )::int AS "missingAttachments",
        COUNT(*) FILTER (WHERE t."reversedAt" IS NOT NULL)::int AS "reversedCount"
      FROM "StoreTransaction" t
      JOIN "Store" st ON st."id"=t."storeId"
      LEFT JOIN "Supplier" sp ON sp."id"=t."supplierId"
      WHERE t."companyId"=${companyId}
        AND t."occurredAt">=${rangeFrom} AND t."occurredAt"<=${rangeTo}
        AND t."type" IN ('SUPPLIER_PAYMENT','OTHER_EXPENSE')
        AND (${storeId}::text IS NULL OR t."storeId"=${storeId})
        AND (${supplierId}::text IS NULL OR t."supplierId"=${supplierId})
        AND (${type}::text IS NULL OR t."type"=${type})
        AND (${needle}::text IS NULL OR COALESCE(t."description",'') ILIKE ${needle?`%${needle}%`:null} OR COALESCE(t."supplierName",sp."name",'') ILIKE ${needle?`%${needle}%`:null} OR t."actorName" ILIKE ${needle?`%${needle}%`:null} OR st."name" ILIKE ${needle?`%${needle}%`:null})
    `;

    const [summaryRows,previousRows,salesRows,purchaseRows,movementRows,storeExpenseRows,storeSalesRows,storePurchaseRows,supplierPaymentRows,supplierPurchaseRows,categoryRows,dailyExpenseRows,dailySalesRows]=await Promise.all([
      commonWhere(from,to),
      commonWhere(previousFrom,previousTo),
      prisma.$queryRaw`
        SELECT COALESCE(SUM("total"),0) AS total
        FROM "Sale"
        WHERE "companyId"=${companyId} AND "status"='COMPLETED'
          AND "occurredAt">=${from} AND "occurredAt"<=${to}
          AND (${storeId}::text IS NULL OR "storeId"=${storeId})
      `,
      prisma.$queryRaw`
        SELECT COALESCE(SUM("totalGross"),0) AS total
        FROM "PurchaseDocument"
        WHERE "companyId"=${companyId} AND "status"='APPROVED'
          AND "documentDate">=${from} AND "documentDate"<=${to}
          AND (${storeId}::text IS NULL OR "storeId"=${storeId})
          AND (${supplierId}::text IS NULL OR "supplierId"=${supplierId})
      `,
      prisma.$queryRaw`
        SELECT t."id",t."storeId",st."name" AS "storeName",t."sessionId",t."type",t."amount",t."description",
               t."supplierId",COALESCE(NULLIF(t."supplierName",''),sp."name") AS "supplierName",
               t."subtractFromShift",t."actorId",t."actorName",t."occurredAt",t."reversedAt",t."reversedByName",t."reversalReason",
               (t."attachmentData" IS NOT NULL) AS "hasAttachment",t."attachmentMimeType",t."attachmentFilename"
        FROM "StoreTransaction" t
        JOIN "Store" st ON st."id"=t."storeId"
        LEFT JOIN "Supplier" sp ON sp."id"=t."supplierId"
        WHERE t."companyId"=${companyId}
          AND t."occurredAt">=${from} AND t."occurredAt"<=${to}
          AND t."type" IN ('SUPPLIER_PAYMENT','OTHER_EXPENSE')
          AND (${storeId}::text IS NULL OR t."storeId"=${storeId})
          AND (${supplierId}::text IS NULL OR t."supplierId"=${supplierId})
          AND (${type}::text IS NULL OR t."type"=${type})
          AND (${needle}::text IS NULL OR COALESCE(t."description",'') ILIKE ${needle?`%${needle}%`:null} OR COALESCE(t."supplierName",sp."name",'') ILIKE ${needle?`%${needle}%`:null} OR t."actorName" ILIKE ${needle?`%${needle}%`:null} OR st."name" ILIKE ${needle?`%${needle}%`:null})
        ORDER BY t."occurredAt" DESC
        LIMIT 1500
      `,
      prisma.$queryRaw`
        SELECT t."storeId",st."name" AS name,
               COUNT(*) FILTER (WHERE t."reversedAt" IS NULL)::int AS count,
               COALESCE(SUM(t."amount") FILTER (WHERE t."reversedAt" IS NULL),0) AS expenses
        FROM "StoreTransaction" t JOIN "Store" st ON st."id"=t."storeId"
        LEFT JOIN "Supplier" sp ON sp."id"=t."supplierId"
        WHERE t."companyId"=${companyId} AND t."occurredAt">=${from} AND t."occurredAt"<=${to}
          AND t."type" IN ('SUPPLIER_PAYMENT','OTHER_EXPENSE')
          AND (${storeId}::text IS NULL OR t."storeId"=${storeId})
          AND (${supplierId}::text IS NULL OR t."supplierId"=${supplierId})
          AND (${type}::text IS NULL OR t."type"=${type})
          AND (${needle}::text IS NULL OR COALESCE(t."description",'') ILIKE ${needle?`%${needle}%`:null} OR COALESCE(t."supplierName",sp."name",'') ILIKE ${needle?`%${needle}%`:null} OR t."actorName" ILIKE ${needle?`%${needle}%`:null} OR st."name" ILIKE ${needle?`%${needle}%`:null})
        GROUP BY t."storeId",st."name" ORDER BY expenses DESC
      `,
      prisma.$queryRaw`
        SELECT s."storeId",st."name" AS name,COALESCE(SUM(s."total"),0) AS sales
        FROM "Sale" s JOIN "Store" st ON st."id"=s."storeId"
        WHERE s."companyId"=${companyId} AND s."status"='COMPLETED' AND s."occurredAt">=${from} AND s."occurredAt"<=${to}
          AND (${storeId}::text IS NULL OR s."storeId"=${storeId})
        GROUP BY s."storeId",st."name"
      `,
      prisma.$queryRaw`
        SELECT d."storeId",st."name" AS name,COALESCE(SUM(d."totalGross"),0) AS purchases
        FROM "PurchaseDocument" d JOIN "Store" st ON st."id"=d."storeId"
        WHERE d."companyId"=${companyId} AND d."status"='APPROVED' AND d."documentDate">=${from} AND d."documentDate"<=${to}
          AND (${storeId}::text IS NULL OR d."storeId"=${storeId})
        GROUP BY d."storeId",st."name"
      `,
      prisma.$queryRaw`
        SELECT COALESCE(t."supplierId",'') AS "supplierId",COALESCE(NULLIF(t."supplierName",''),sp."name",'Χωρίς προμηθευτή') AS name,
               COUNT(*)::int AS count,COALESCE(SUM(t."amount"),0) AS payments
        FROM "StoreTransaction" t LEFT JOIN "Supplier" sp ON sp."id"=t."supplierId"
        WHERE t."companyId"=${companyId} AND t."reversedAt" IS NULL AND t."type"='SUPPLIER_PAYMENT'
          AND t."occurredAt">=${from} AND t."occurredAt"<=${to}
          AND (${storeId}::text IS NULL OR t."storeId"=${storeId})
          AND (${supplierId}::text IS NULL OR t."supplierId"=${supplierId})
          AND (${type}::text IS NULL OR t."type"=${type})
          AND (${needle}::text IS NULL OR COALESCE(t."description",'') ILIKE ${needle?`%${needle}%`:null} OR COALESCE(t."supplierName",sp."name",'') ILIKE ${needle?`%${needle}%`:null} OR t."actorName" ILIKE ${needle?`%${needle}%`:null})
        GROUP BY t."supplierId",COALESCE(NULLIF(t."supplierName",''),sp."name",'Χωρίς προμηθευτή')
        ORDER BY payments DESC
      `,
      prisma.$queryRaw`
        SELECT COALESCE(d."supplierId",'') AS "supplierId",COALESCE(sp."name",'Χωρίς προμηθευτή') AS name,
               COUNT(*)::int AS documents,COALESCE(SUM(d."totalGross"),0) AS purchases
        FROM "PurchaseDocument" d LEFT JOIN "Supplier" sp ON sp."id"=d."supplierId"
        WHERE d."companyId"=${companyId} AND d."status"='APPROVED'
          AND d."documentDate">=${from} AND d."documentDate"<=${to}
          AND (${storeId}::text IS NULL OR d."storeId"=${storeId})
          AND (${supplierId}::text IS NULL OR d."supplierId"=${supplierId})
        GROUP BY d."supplierId",sp."name" ORDER BY purchases DESC
      `,
      prisma.$queryRaw`
        SELECT COALESCE(NULLIF(BTRIM(t."description"),''),'Λοιπά έξοδα') AS name,
               COUNT(*)::int AS count,COALESCE(SUM(t."amount"),0) AS amount
        FROM "StoreTransaction" t
        JOIN "Store" st ON st."id"=t."storeId"
        LEFT JOIN "Supplier" sp ON sp."id"=t."supplierId"
        WHERE t."companyId"=${companyId} AND t."reversedAt" IS NULL AND t."type"='OTHER_EXPENSE'
          AND t."occurredAt">=${from} AND t."occurredAt"<=${to}
          AND (${storeId}::text IS NULL OR t."storeId"=${storeId})
          AND (${supplierId}::text IS NULL OR t."supplierId"=${supplierId})
          AND (${type}::text IS NULL OR t."type"=${type})
          AND (${needle}::text IS NULL OR COALESCE(t."description",'') ILIKE ${needle?`%${needle}%`:null} OR COALESCE(t."supplierName",sp."name",'') ILIKE ${needle?`%${needle}%`:null} OR t."actorName" ILIKE ${needle?`%${needle}%`:null} OR st."name" ILIKE ${needle?`%${needle}%`:null})
        GROUP BY COALESCE(NULLIF(BTRIM(t."description"),''),'Λοιπά έξοδα') ORDER BY amount DESC
      `,
      prisma.$queryRaw`
        SELECT DATE(t."occurredAt") AS day,COALESCE(SUM(t."amount") FILTER (WHERE t."reversedAt" IS NULL),0) AS expenses
        FROM "StoreTransaction" t
        JOIN "Store" st ON st."id"=t."storeId"
        LEFT JOIN "Supplier" sp ON sp."id"=t."supplierId"
        WHERE t."companyId"=${companyId} AND t."type" IN ('SUPPLIER_PAYMENT','OTHER_EXPENSE')
          AND t."occurredAt">=${from} AND t."occurredAt"<=${to}
          AND (${storeId}::text IS NULL OR t."storeId"=${storeId})
          AND (${supplierId}::text IS NULL OR t."supplierId"=${supplierId})
          AND (${type}::text IS NULL OR t."type"=${type})
          AND (${needle}::text IS NULL OR COALESCE(t."description",'') ILIKE ${needle?`%${needle}%`:null} OR COALESCE(t."supplierName",sp."name",'') ILIKE ${needle?`%${needle}%`:null} OR t."actorName" ILIKE ${needle?`%${needle}%`:null} OR st."name" ILIKE ${needle?`%${needle}%`:null})
        GROUP BY DATE(t."occurredAt") ORDER BY day
      `,
      prisma.$queryRaw`
        SELECT DATE("occurredAt") AS day,COALESCE(SUM("total"),0) AS sales
        FROM "Sale"
        WHERE "companyId"=${companyId} AND "status"='COMPLETED' AND "occurredAt">=${from} AND "occurredAt"<=${to}
          AND (${storeId}::text IS NULL OR "storeId"=${storeId})
        GROUP BY DATE("occurredAt") ORDER BY day
      `
    ]);

    const raw=summaryRows[0]||{};
    const previous=previousRows[0]||{};
    const salesTotal=n(salesRows[0]?.total);
    const purchasesTotal=n(purchaseRows[0]?.total);
    const totalExpenses=n(raw.total);
    const previousTotal=n(previous.total);
    const byStore=mergeByKey(
      storeExpenseRows.map(row=>({storeId:row.storeId,name:row.name,count:n(row.count),expenses:n(row.expenses),sales:0,purchases:0})),
      storeSalesRows.map(row=>({storeId:row.storeId,name:row.name,sales:n(row.sales)})),
      "storeId",["name","sales"]
    );
    for(const row of byStore){row.purchases=0}
    const purchaseMap=new Map(storePurchaseRows.map(row=>[String(row.storeId),n(row.purchases)]));
    for(const row of byStore)row.purchases=purchaseMap.get(String(row.storeId))||0;
    for(const row of storePurchaseRows){
      if(!byStore.some(x=>String(x.storeId)===String(row.storeId)))byStore.push({storeId:row.storeId,name:row.name,count:0,expenses:0,sales:0,purchases:n(row.purchases)});
    }
    const bySupplier=mergeByKey(
      supplierPaymentRows.map(row=>({supplierId:row.supplierId,name:row.name,count:n(row.count),payments:n(row.payments),documents:0,purchases:0})),
      supplierPurchaseRows.map(row=>({supplierId:row.supplierId,name:row.name,documents:n(row.documents),purchases:n(row.purchases)})),
      "supplierId",["name","documents","purchases"]
    ).map(row=>({...row,count:n(row.count),payments:n(row.payments),documents:n(row.documents),purchases:n(row.purchases)})).sort((a,b)=>Math.max(b.payments,b.purchases)-Math.max(a.payments,a.purchases));
    const dailyMap=new Map();
    for(const row of dailyExpenseRows)dailyMap.set(isoDay(row.day),{day:isoDay(row.day),expenses:n(row.expenses),sales:0});
    for(const row of dailySalesRows){const day=isoDay(row.day),current=dailyMap.get(day)||{day,expenses:0,sales:0};current.sales=n(row.sales);dailyMap.set(day,current)}
    const categories=[
      ...(n(raw.supplierPayments)>0?[{name:"Πληρωμές προμηθευτών",type:"SUPPLIER_PAYMENT",count:supplierPaymentRows.reduce((s,row)=>s+n(row.count),0),amount:n(raw.supplierPayments)}]:[]),
      ...categoryRows.map(row=>({name:row.name,type:"OTHER_EXPENSE",count:n(row.count),amount:n(row.amount)}))
    ].sort((a,b)=>b.amount-a.amount);

    res.json({
      generatedAt:new Date().toISOString(),from,to,previousFrom,previousTo,stores,suppliers,
      summary:{
        count:n(raw.count),totalExpenses,supplierPayments:n(raw.supplierPayments),otherExpenses:n(raw.otherExpenses),averageExpense:n(raw.average),
        missingAttachments:n(raw.missingAttachments),reversedCount:n(raw.reversedCount),salesTotal,purchasesTotal,
        percentOfSales:salesTotal?totalExpenses/salesTotal*100:null,
        changePercent:previousTotal?((totalExpenses-previousTotal)/previousTotal)*100:null,
        previousTotal
      },
      byStore:byStore.map(row=>({...row,expenses:n(row.expenses),sales:n(row.sales),purchases:n(row.purchases),count:n(row.count)})).sort((a,b)=>b.expenses-a.expenses),
      bySupplier,categories,daily:[...dailyMap.values()].sort((a,b)=>a.day.localeCompare(b.day)),movements:movementRows.map(mapMovement),
      sourceStatus:{ledger:true,sales:true,purchases:true}
    });
  }catch(error){next(error)}
});

export default router;
