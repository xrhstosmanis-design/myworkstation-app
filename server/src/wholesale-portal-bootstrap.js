import {prisma} from './prisma.js';
import {ensureWholesaleSchema} from './wholesale-b2b-bootstrap.js';
const ready=new WeakMap();
export async function ensureWholesalePortalSchema(db=prisma){
  if(ready.has(db))return ready.get(db);
  const task=(async()=>{
    await ensureWholesaleSchema(db);
    const statements=[
      `CREATE UNIQUE INDEX IF NOT EXISTS "WholesaleCustomer_id_company_portal_key" ON "WholesaleCustomer"("id","companyId")`,
      `CREATE UNIQUE INDEX IF NOT EXISTS "Store_id_company_portal_key" ON "Store"("id","companyId")`,
      `CREATE UNIQUE INDEX IF NOT EXISTS "Product_id_company_portal_key" ON "Product"("id","companyId")`,
      `CREATE TABLE IF NOT EXISTS "WholesalePortalSite" ("id" TEXT PRIMARY KEY,"companyId" TEXT NOT NULL UNIQUE REFERENCES "Company"("id") ON DELETE CASCADE,"slug" TEXT NOT NULL UNIQUE,"name" TEXT NOT NULL,"enabled" BOOLEAN NOT NULL DEFAULT false,"createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),"updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),UNIQUE("id","companyId"))`,
      `CREATE TABLE IF NOT EXISTS "WholesalePortalAccount" ("id" TEXT PRIMARY KEY,"siteId" TEXT NOT NULL,"companyId" TEXT NOT NULL,"customerId" TEXT NOT NULL,"storeId" TEXT NOT NULL,"login" TEXT NOT NULL,"passwordHash" TEXT NOT NULL,"active" BOOLEAN NOT NULL DEFAULT true,"sessionVersion" INTEGER NOT NULL DEFAULT 1,"createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),"updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),UNIQUE("siteId","login"),UNIQUE("id","siteId","companyId"),FOREIGN KEY("siteId","companyId") REFERENCES "WholesalePortalSite"("id","companyId") ON DELETE CASCADE,FOREIGN KEY("customerId","companyId") REFERENCES "WholesaleCustomer"("id","companyId") ON DELETE CASCADE,FOREIGN KEY("storeId","companyId") REFERENCES "Store"("id","companyId") ON DELETE CASCADE)`,
      `CREATE TABLE IF NOT EXISTS "WholesalePortalSession" ("id" TEXT PRIMARY KEY,"accountId" TEXT NOT NULL,"siteId" TEXT NOT NULL,"companyId" TEXT NOT NULL,"tokenHash" TEXT NOT NULL UNIQUE,"sessionVersion" INTEGER NOT NULL,"expiresAt" TIMESTAMPTZ NOT NULL,"revokedAt" TIMESTAMPTZ,"createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),FOREIGN KEY("accountId","siteId","companyId") REFERENCES "WholesalePortalAccount"("id","siteId","companyId") ON DELETE CASCADE)`,
      `CREATE INDEX IF NOT EXISTS "WholesalePortalSession_account_idx" ON "WholesalePortalSession"("accountId","revokedAt","expiresAt")`,
      `CREATE TABLE IF NOT EXISTS "WholesalePortalPublication" ("siteId" TEXT NOT NULL,"companyId" TEXT NOT NULL,"storeId" TEXT NOT NULL,"productId" TEXT NOT NULL,"active" BOOLEAN NOT NULL DEFAULT true,"updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),PRIMARY KEY("siteId","storeId","productId"),FOREIGN KEY("storeId","companyId") REFERENCES "Store"("id","companyId") ON DELETE CASCADE,FOREIGN KEY("siteId","companyId") REFERENCES "WholesalePortalSite"("id","companyId") ON DELETE CASCADE,FOREIGN KEY("productId","companyId") REFERENCES "Product"("id","companyId") ON DELETE CASCADE)`
    ];
    for(const statement of statements)await db.$executeRawUnsafe(statement);
  })().catch(error=>{ready.delete(db);throw error});
  ready.set(db,task);return task;
}
