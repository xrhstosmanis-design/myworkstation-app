export async function ensureChatAccess(db) {
  await db.$executeRaw`CREATE TABLE IF NOT EXISTS "StoreChatAccessRevocation" (
    "companyId" TEXT NOT NULL, "storeId" TEXT NOT NULL, "userId" TEXT NOT NULL,
    PRIMARY KEY ("companyId", "storeId", "userId")
  )`;
}

export async function chatAccessRevoked(db, store, userId) {
  const rows = await db.$queryRaw`SELECT 1 FROM "StoreChatAccessRevocation"
    WHERE "companyId"=${store.companyId} AND "storeId"=${store.id} AND "userId"=${userId}`;
  return rows.length > 0;
}

export async function chatAccessRoster(db, store, actorId, platform) {
  return db.$queryRaw`
    SELECT people."id", people."name", r."userId" IS NOT NULL AS "revoked"
    FROM (
      SELECT c."id", c."displayName" AS "name"
      FROM "StoreOperatorCredential" c
      JOIN "Employee" e ON e."id"=c."employeeId" AND e."storeId"=c."storeId" AND e."active"=TRUE
      WHERE c."companyId"=${store.companyId} AND c."storeId"=${store.id} AND c."active"=TRUE
      UNION
      SELECT u."id", u."fullName" AS "name" FROM "User" u
      WHERE (u."companyId"=${store.companyId} OR
        (u."role"::text='OWNER' AND EXISTS (
          SELECT 1 FROM "OwnerCompanyAccess" a WHERE a."ownerId"=u."id" AND a."companyId"=${store.companyId}
        )))
        AND u."role"::text <> 'SUPER_ADMIN' AND (${platform} OR u."role"::text <> 'OWNER')
    ) people LEFT JOIN "StoreChatAccessRevocation" r ON r."userId"=people."id"
      AND r."companyId"=${store.companyId} AND r."storeId"=${store.id}
    WHERE people."id"<>${actorId}
    ORDER BY people."name", people."id"`;
}
