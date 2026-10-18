import {prisma} from './prisma.js';
import {ensureWholesaleSchema} from './wholesale-b2b-bootstrap.js';
const ready=new WeakMap();
export async function ensureWholesaleSellerSchema(db=prisma){
  if(ready.has(db))return ready.get(db);
  const work=(async()=>{
    await ensureWholesaleSchema(db);
    const statements=[
      `CREATE UNIQUE INDEX IF NOT EXISTS "User_id_company_seller_key" ON "User"("id","companyId")`,
      `CREATE UNIQUE INDEX IF NOT EXISTS "WholesaleCustomer_id_company_portal_key" ON "WholesaleCustomer"("id","companyId")`,
      `CREATE UNIQUE INDEX IF NOT EXISTS "Store_id_company_portal_key" ON "Store"("id","companyId")`,
      `CREATE TABLE IF NOT EXISTS "WholesaleSellerMembership" ("id" TEXT PRIMARY KEY,"companyId" TEXT NOT NULL,"userId" TEXT NOT NULL,"active" BOOLEAN NOT NULL DEFAULT true,"revision" INTEGER NOT NULL DEFAULT 1,"updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),UNIQUE("companyId","userId"),FOREIGN KEY("userId","companyId") REFERENCES "User"("id","companyId") ON DELETE CASCADE)`,
      `CREATE TABLE IF NOT EXISTS "WholesaleSellerAssignment" ("id" TEXT PRIMARY KEY,"companyId" TEXT NOT NULL,"userId" TEXT NOT NULL,"customerId" TEXT NOT NULL,"storeId" TEXT NOT NULL,"active" BOOLEAN NOT NULL DEFAULT true,"revision" INTEGER NOT NULL DEFAULT 1,"updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),UNIQUE("companyId","userId","customerId","storeId"),FOREIGN KEY("companyId","userId") REFERENCES "WholesaleSellerMembership"("companyId","userId") ON DELETE CASCADE,FOREIGN KEY("customerId","companyId") REFERENCES "WholesaleCustomer"("id","companyId") ON DELETE CASCADE,FOREIGN KEY("storeId","companyId") REFERENCES "Store"("id","companyId") ON DELETE CASCADE)`,
      `CREATE INDEX IF NOT EXISTS "WholesaleSellerAssignment_scope_idx" ON "WholesaleSellerAssignment"("companyId","userId","storeId","active","customerId")`,
      `CREATE TABLE IF NOT EXISTS "WholesaleSellerAudit" ("id" TEXT PRIMARY KEY,"companyId" TEXT NOT NULL REFERENCES "Company"("id") ON DELETE CASCADE,"actorId" TEXT NOT NULL,"targetUserId" TEXT NOT NULL,"kind" TEXT NOT NULL,"beforeJson" JSONB,"afterJson" JSONB NOT NULL,"createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW())`,
      `CREATE INDEX IF NOT EXISTS "WholesaleSellerAudit_company_user_idx" ON "WholesaleSellerAudit"("companyId","targetUserId","createdAt")`
    ];
    for(const statement of statements)await db.$executeRawUnsafe(statement);
  })().catch(error=>{ready.delete(db);throw error});ready.set(db,work);return work;
}
