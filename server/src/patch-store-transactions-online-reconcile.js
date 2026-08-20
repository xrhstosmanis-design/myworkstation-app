import fs from "node:fs";
import path from "node:path";
import {fileURLToPath} from "node:url";

const here=path.dirname(fileURLToPath(import.meta.url));
const file=path.join(here,"routes/store-transactions.js");
let source=fs.readFileSync(file,"utf8");

const start=source.indexOf('async function reconcileOnlineSalesForOpenSession({store,companyId,openSession}){');
const end=source.indexOf('\nrouter.use(auth,requireLedgerAccess);',start);
if(start<0||end<0)throw new Error("store-transactions online reconcile anchors not found");

const replacement=`async function reconcileOnlineSalesForOpenSession({store,companyId,openSession}){
  if(!openSession)return;
  try{
    const exists=await prisma.$queryRawUnsafe(\`SELECT to_regclass('"OnlineOrder"') AS "tableName"\`);
    if(!exists?.[0]?.tableName)return;
    await prisma.$transaction(async tx=>{
      await tx.$executeRaw\`
        WITH delivered AS (
          SELECT o."saleId",
                 COALESCE(ev."employeeId",o."assignedEmployeeId") AS "employeeId",
                 COALESCE(o."deliveredAt",o."commercialPostedAt",o."updatedAt",o."createdAt") AS "postedAt"
          FROM "OnlineOrder" o
          LEFT JOIN LATERAL (
            SELECT e."employeeId"
            FROM "OnlineOrderStatusEvent" e
            WHERE e."orderId"=o."id" AND e."toStatus"='DELIVERED' AND e."employeeId" IS NOT NULL
            ORDER BY e."createdAt" DESC LIMIT 1
          ) ev ON TRUE
          WHERE o."companyId"=\${companyId}
            AND o."storeId"=\${store.id}
            AND o."status"='DELIVERED'
            AND o."saleId" IS NOT NULL
            AND COALESCE(o."deliveredAt",o."commercialPostedAt",o."updatedAt",o."createdAt")>=\${openSession.openedAt}
        )
        UPDATE "Sale" s
        SET "operatorEmployeeId"=COALESCE(d."employeeId",s."operatorEmployeeId"),
            "createdAt"=COALESCE(d."postedAt",s."createdAt")
        FROM delivered d
        WHERE s."id"=d."saleId"
      \`;

      const delivered=await tx.$queryRaw\`
        SELECT o."id",o."orderNumber",o."paymentMethod",o."total",
               COALESCE(o."deliveredAt",o."commercialPostedAt",o."updatedAt",o."createdAt") AS "postedAt"
        FROM "OnlineOrder" o
        WHERE o."companyId"=\${companyId}
          AND o."storeId"=\${store.id}
          AND o."status"='DELIVERED'
          AND o."saleId" IS NOT NULL
          AND COALESCE(o."deliveredAt",o."commercialPostedAt",o."updatedAt",o."createdAt")>=\${openSession.openedAt}
      \`;

      for(const order of delivered){
        const matches=await tx.$queryRaw\`
          SELECT "id","createdAt"
          FROM "StoreTransaction"
          WHERE "companyId"=\${companyId}
            AND "storeId"=\${store.id}
            AND "type" IN ('SALE_CASH','SALE_CARD')
            AND "description" ILIKE \${'%' + order.orderNumber + '%'}
          ORDER BY "createdAt" ASC,"id" ASC
        \`;
        if(!matches.length)continue;
        const canonical=matches[0];
        if(matches.length>1){
          const duplicateIds=matches.slice(1).map(row=>row.id);
          await tx.$executeRawUnsafe(\`DELETE FROM "StoreTransaction" WHERE "id" = ANY($1::text[])\`,duplicateIds);
        }
        await tx.$executeRaw\`
          UPDATE "StoreTransaction"
          SET "sessionId"=\${openSession.id},
              "type"=\${order.paymentMethod==='CASH'?'SALE_CASH':'SALE_CARD'},
              "amount"=\${order.total},
              "description"=\${'ONLINE ΠΑΡΑΓΓΕΛΙΑ ' + order.orderNumber},
              "occurredAt"=\${order.postedAt}
          WHERE "id"=\${canonical.id}
        \`;
      }
    });
  }catch(error){
    console.error("Online shift reconciliation failed:",error?.message||error);
  }
}
`;

source=source.slice(0,start)+replacement+source.slice(end);
fs.writeFileSync(file,source);
console.log("Online shift reconciliation patched: POS is the only sale source; duplicates are collapsed, never inserted.");
