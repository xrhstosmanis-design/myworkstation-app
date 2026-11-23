import {prisma} from "../prisma.js";

const schemaByDatabase=new WeakMap();

export function ensureMyDataBranchSchema(db=prisma){
  if(!schemaByDatabase.has(db)){
    const init=db.$executeRaw`
      CREATE TABLE IF NOT EXISTS "MyDataStoreBranch" (
        "companyId" TEXT NOT NULL REFERENCES "Company"("id") ON DELETE CASCADE,
        "storeId" TEXT NOT NULL REFERENCES "Store"("id") ON DELETE CASCADE,
        "branch" INTEGER NOT NULL CHECK ("branch">=0),
        PRIMARY KEY ("companyId","storeId"),
        UNIQUE ("companyId","branch")
      )`.catch(error=>{schemaByDatabase.delete(db);throw error});
    schemaByDatabase.set(db,init);
  }
  return schemaByDatabase.get(db);
}

export async function readMyDataBranchForStore(db,companyId,storeId){
  const [mapping]=await db.$queryRaw`
    SELECT b."branch" FROM "MyDataStoreBranch" b
    JOIN "Store" s ON s."id"=b."storeId" AND s."companyId"=b."companyId"
    WHERE b."companyId"=${companyId} AND b."storeId"=${storeId}
  `;
  return mapping?.branch??null;
}

export async function hasMyDataBranchMappings(db,companyId){
  const [state]=await db.$queryRaw`
    SELECT EXISTS (SELECT 1 FROM "MyDataStoreBranch" WHERE "companyId"=${companyId}) AS configured
  `;
  return state?.configured===true;
}
