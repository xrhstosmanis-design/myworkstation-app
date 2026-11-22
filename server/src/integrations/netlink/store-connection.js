import {randomUUID} from "node:crypto";
import {encryptStoreIntegrationValue,decryptStoreIntegrationValue} from "../store-integration-crypto.js";
import {assertCustomerDemoOutboundAllowed} from "../../customer-demo-runtime.js";

export function connectionScope(tenant){
  assertCustomerDemoOutboundAllowed(tenant);
  if(!tenant?.companyId||!tenant?.storeId)throw Object.assign(new Error("Επίλεξε κατάστημα για τη σύνδεση Netlink."),{status:400,code:"NETLINK_STORE_REQUIRED"});
  return {companyId:tenant.companyId,storeId:tenant.storeId};
}

export function createNetlinkConnectionStore(db){
  const read=async tenant=>{
    const {companyId,storeId}=connectionScope(tenant);
    const rows=await db.$queryRaw`SELECT "credentialsEnc","accountHint" AS "stationId","enabled","updatedAt" FROM "StoreIntegrationCredential" WHERE "companyId"=${companyId} AND "storeId"=${storeId} AND "kind"='NETLINK' LIMIT 1`;
    return rows[0]||null;
  };
  const view=row=>({configured:Boolean(row),enabled:row?.enabled===true,stationId:row?.stationId||null,updatedAt:row?.updatedAt||null});
  return {
    async status(tenant){return view(await read(tenant))},
    async credentials(tenant,{allowDisabled=false}={}){
      const row=await read(tenant);
      if(!row||(!row.enabled&&!allowDisabled))throw Object.assign(new Error("Η σύνδεση Netlink του καταστήματος δεν έχει ρυθμιστεί ή είναι ανενεργή."),{status:503,code:"NETLINK_STORE_NOT_CONFIGURED"});
      const credentials=decryptStoreIntegrationValue(row.credentialsEnc);
      if(!credentials.username||!credentials.password||!row.stationId)throw Object.assign(new Error("Τα στοιχεία Netlink του καταστήματος είναι ελλιπή."),{status:503,code:"NETLINK_STORE_NOT_CONFIGURED"});
      return {...connectionScope(tenant),username:credentials.username,password:credentials.password,stationId:row.stationId};
    },
    async save(tenant,{username,password,stationId,enabled=false},actor){
      const {companyId,storeId}=connectionScope(tenant);
      // Encrypt before the transaction, so a missing encryption key never writes a row.
      const credentialsEnc=encryptStoreIntegrationValue({username,password});
      return db.$transaction(async tx=>{
        const rows=await tx.$queryRaw`INSERT INTO "StoreIntegrationCredential" ("id","companyId","storeId","kind","providerName","environment","accountHint","credentialsEnc","enabled","updatedBy") VALUES (${randomUUID()},${companyId},${storeId},'NETLINK','Netlink Airtime','PRODUCTION',${stationId},${credentialsEnc},${enabled},${actor.id}) ON CONFLICT ("storeId","kind") DO UPDATE SET "accountHint"=EXCLUDED."accountHint","credentialsEnc"=EXCLUDED."credentialsEnc","enabled"=EXCLUDED."enabled","updatedBy"=EXCLUDED."updatedBy","updatedAt"=clock_timestamp() WHERE "StoreIntegrationCredential"."companyId"=EXCLUDED."companyId" RETURNING "accountHint" AS "stationId","enabled","updatedAt"`;
        if(!rows[0])throw Object.assign(new Error("Δεν βρέθηκε διασύνδεση στο συγκεκριμένο κατάστημα."),{status:404});
        await tx.authAudit.create({data:{userId:actor.id,email:actor.email||"platform-admin",event:`NETLINK_STORE_CONFIGURED:${companyId}:${storeId}`,success:true}});
        return view(rows[0]);
      });
    },
    async setEnabled(tenant,enabled,actor){
      const {companyId,storeId}=connectionScope(tenant);
      return db.$transaction(async tx=>{
        const rows=await tx.$queryRaw`UPDATE "StoreIntegrationCredential" SET "enabled"=${enabled},"updatedBy"=${actor.id},"updatedAt"=clock_timestamp() WHERE "companyId"=${companyId} AND "storeId"=${storeId} AND "kind"='NETLINK' RETURNING "accountHint" AS "stationId","enabled","updatedAt"`;
        if(!rows[0])throw Object.assign(new Error("Αποθήκευσε πρώτα τα στοιχεία Netlink του καταστήματος."),{status:404});
        await tx.authAudit.create({data:{userId:actor.id,email:actor.email||"platform-admin",event:`NETLINK_STORE_${enabled?"ENABLED":"DISABLED"}:${companyId}:${storeId}`,success:true}});
        return view(rows[0]);
      });
    }
  };
}

export async function netlinkConnectionStore(){
  const {prisma}=await import("../../prisma.js");
  return createNetlinkConnectionStore(prisma);
}
