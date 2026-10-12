import crypto from "crypto";
import {workCardHash} from "../workforce-card-code.js";

const schemaByDatabase=new WeakMap();
const fail=(status,message)=>Object.assign(new Error(message),{status});
export function ensureCustomerOperatorCardSchema(db){
  if(!schemaByDatabase.has(db))schemaByDatabase.set(db,db.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS "CustomerOperatorCardLink" (
    "companyId" TEXT NOT NULL,"storeId" TEXT NOT NULL,"customerId" TEXT NOT NULL REFERENCES "Customer"("id") ON DELETE CASCADE,
    "credentialId" TEXT REFERENCES "StoreOperatorCredential"("id") ON DELETE CASCADE,
    "updatedBy" TEXT NOT NULL,"updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY ("companyId","storeId","customerId"),UNIQUE ("companyId","storeId","credentialId"))`).catch(error=>{schemaByDatabase.delete(db);throw error}));
  return schemaByDatabase.get(db);
}

export async function linkCustomerOperatorCard(db,{companyId,storeId,customerId,actorId,credentialId}){
  await ensureCustomerOperatorCardSchema(db);
  return db.$transaction(async tx=>{
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`customer-operator-card:${companyId}:${storeId}`},0))`;
    const customer=(await tx.$queryRaw`SELECT "id","active","discountAudience" FROM "Customer" WHERE "id"=${customerId} AND "companyId"=${companyId} FOR UPDATE`)[0];
    if(!customer)throw fail(404,"Δεν βρέθηκε ο πελάτης.");
    let credential=null;
    if(credentialId){
      if(!customer.active||customer.discountAudience!=="STAFF")throw fail(409,"Αποθήκευσε πρώτα ενεργό πελάτη με κατηγορία Προσωπικό.");
      credential=(await tx.$queryRaw`SELECT c."id",c."displayName",c."cardCodeLast4" FROM "StoreOperatorCredential" c JOIN "Employee" e ON e."id"=c."employeeId" AND e."storeId"=c."storeId"
        WHERE c."id"=${credentialId} AND c."companyId"=${companyId} AND c."storeId"=${storeId} AND c."active"=TRUE AND e."active"=TRUE AND c."cardCodeHash" IS NOT NULL FOR SHARE OF c,e`)[0];
      if(!credential)throw fail(404,"Δεν βρέθηκε ενεργή κάρτα χειριστή στο επιλεγμένο κατάστημα.");
      const used=await tx.$queryRaw`SELECT "customerId" FROM "CustomerOperatorCardLink" WHERE "companyId"=${companyId} AND "storeId"=${storeId} AND "credentialId"=${credentialId} AND "customerId"<>${customerId}`;
      if(used.length)throw fail(409,"Η κάρτα χειριστή είναι ήδη συνδεδεμένη με άλλον πελάτη. Αποσύνδεσέ την πρώτα από εκεί.");
    }
    const previous=(await tx.$queryRaw`SELECT "credentialId" FROM "CustomerOperatorCardLink" WHERE "companyId"=${companyId} AND "storeId"=${storeId} AND "customerId"=${customerId}`)[0]?.credentialId||null;
    if(previous!==credentialId){
      await tx.$executeRaw`INSERT INTO "CustomerOperatorCardLink" ("companyId","storeId","customerId","credentialId","updatedBy") VALUES (${companyId},${storeId},${customerId},${credentialId},${actorId})
        ON CONFLICT ("companyId","storeId","customerId") DO UPDATE SET "credentialId"=EXCLUDED."credentialId","updatedBy"=EXCLUDED."updatedBy","updatedAt"=NOW()`;
      await tx.$executeRaw`INSERT INTO "StoreOperatorAudit" ("id","companyId","storeId","operatorId","actorId","eventType","details") VALUES (${crypto.randomUUID()},${companyId},${storeId},${credentialId||previous},${actorId},'CUSTOMER_WORK_CARD_LINK_UPDATED',${JSON.stringify({customerId,previousCredentialId:previous,credentialId,cardLast4:credential?.cardCodeLast4||null})}::jsonb)`;
    }
    return {ok:true,credentialId,displayName:credential?.displayName||null,cardLast4:credential?.cardCodeLast4||null};
  });
}

// A work card is never copied into a customer record or returned to BackOffice.
// Read its CURRENT credential hash so revocation and rotation take effect immediately.
export async function findLinkedOperatorCustomer(db,{companyId,storeId},cardCode){
  await ensureCustomerOperatorCardSchema(db);
  return db.$queryRaw`SELECT l."customerId" AS "id" FROM "StoreOperatorCredential" o
    JOIN "Employee" e ON e."id"=o."employeeId" AND e."storeId"=o."storeId" AND e."active"=TRUE
    JOIN "CustomerOperatorCardLink" l ON l."credentialId"=o."id" AND l."companyId"=o."companyId" AND l."storeId"=o."storeId"
    JOIN "Customer" c ON c."id"=l."customerId" AND c."companyId"=l."companyId" AND c."active"=TRUE AND c."discountAudience"='STAFF'
    WHERE o."companyId"=${companyId} AND o."storeId"=${storeId} AND o."active"=TRUE AND o."cardCodeHash"=${workCardHash(cardCode)} LIMIT 2`;
}
