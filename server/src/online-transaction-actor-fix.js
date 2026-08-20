import {prisma} from "./prisma.js";

async function repairOnlineTransactionActors(){
  const tables=await prisma.$queryRawUnsafe(`
    SELECT to_regclass('"StoreTransaction"') AS st,
           to_regclass('"StoreOperatorAudit"') AS audit,
           to_regclass('"OnlineOrder"') AS orders
  `);
  if(!tables?.[0]?.st||!tables?.[0]?.audit||!tables?.[0]?.orders)return;

  await prisma.$executeRawUnsafe(`
    UPDATE "StoreTransaction" t
    SET "actorId"=a."actorId",
        "actorName"=COALESCE(NULLIF(a."details"->>'actorName',''),t."actorName")
    FROM "OnlineOrder" o
    JOIN LATERAL (
      SELECT sa."actorId",sa."details"
      FROM "StoreOperatorAudit" sa
      WHERE sa."companyId"=o."companyId"
        AND sa."storeId"=o."storeId"
        AND sa."eventType"='ONLINE_SALE_COMPLETED'
        AND (
          sa."details"->>'onlineOrderId'=o."id"
          OR sa."details"->>'orderNumber'=o."orderNumber"
        )
      ORDER BY sa."createdAt" DESC
      LIMIT 1
    ) a ON TRUE
    WHERE t."companyId"=o."companyId"
      AND t."storeId"=o."storeId"
      AND t."description" ILIKE ('%' || o."orderNumber" || '%')
      AND a."actorId" IS NOT NULL
      AND t."actorId" IS DISTINCT FROM a."actorId"
  `);

  await prisma.$executeRawUnsafe(`
    CREATE OR REPLACE FUNCTION mws_preserve_online_transaction_actor()
    RETURNS trigger AS $$
    DECLARE order_no text; resolved_actor text;
    BEGIN
      order_no := substring(COALESCE(NEW."description",OLD."description",'') from '(KAT-[0-9]+)');
      IF order_no IS NOT NULL THEN
        SELECT a."actorId" INTO resolved_actor
        FROM "StoreOperatorAudit" a
        WHERE a."companyId"=NEW."companyId"
          AND a."storeId"=NEW."storeId"
          AND a."eventType"='ONLINE_SALE_COMPLETED'
          AND a."details"->>'orderNumber'=order_no
        ORDER BY a."createdAt" DESC LIMIT 1;
        IF resolved_actor IS NOT NULL THEN
          NEW."actorId" := resolved_actor;
        END IF;
      END IF;
      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql
  `);
  await prisma.$executeRawUnsafe(`DROP TRIGGER IF EXISTS mws_preserve_online_transaction_actor_trg ON "StoreTransaction"`);
  await prisma.$executeRawUnsafe(`
    CREATE TRIGGER mws_preserve_online_transaction_actor_trg
    BEFORE UPDATE ON "StoreTransaction"
    FOR EACH ROW EXECUTE FUNCTION mws_preserve_online_transaction_actor()
  `);
}

try{
  await repairOnlineTransactionActors();
  console.log("Online transaction actor repair completed.");
}catch(error){
  console.warn("Online transaction actor repair skipped:",error?.message||error);
}finally{
  await prisma.$disconnect();
}
