import {acquireOriginal,epsilonFileRecoveryLinkPattern,fetchEpsilonFileRecoveryPdf} from "../mydata-original.js";

const panormouStoreId="cmwqvuxrx001is8g4uqlyzwg2";
const recoveryVersion="epsilon-digital-file-v1";

// Invoked within the normal store receiving lock, with draft entitlement already checked.
export async function recoverPanormouEpsilonFileOriginals({
  db,companyId,storeId,userId,source,acquire=acquireOriginal,
}){
  if(storeId!==panormouStoreId||source!=="AADE_MYDATA_PRODUCTION")return {downloaded:0,failed:0};

  const candidates=await db.$queryRaw`
    SELECT m."inboxId" FROM "MyDataInboundDocument" m
    JOIN "DocumentInbox" i ON i."id"=m."inboxId" AND i."companyId"=m."companyId" AND i."storeId"=m."storeId"
    WHERE m."companyId"=${companyId} AND m."storeId"=${storeId}
      AND m."issueDate">=DATE '2026-11-01' AND m."issueDate"<DATE '2026-12-01'
      AND m."rawPayload"->>'source'=${source}
      AND i."attachmentId" IS NULL AND i."status"='RECEIVED'
      AND m."rawPayload"->>'originalDownloaded' IS DISTINCT FROM 'true'
      AND m."rawPayload"->>'originalPending'='true'
      AND COALESCE((m."rawPayload"->>'originalAttempts')::int,0)>=3
      AND m."rawPayload"->>'epsilonFileRecoveryVersion' IS DISTINCT FROM ${recoveryVersion}
      AND m."rawPayload"->>'xml' ~* ${epsilonFileRecoveryLinkPattern()}
    ORDER BY m."fetchedAt",m."id" LIMIT 2`;

  let downloaded=0,failed=0;
  for(const {inboxId} of candidates){
    try{
      const result=await acquire(db,companyId,storeId,inboxId,userId,true,fetchEpsilonFileRecoveryPdf);
      if(result.downloaded)downloaded++;
    }catch{
      failed++;
      await db.$executeRaw`
        UPDATE "MyDataInboundDocument" m
        SET "rawPayload"=m."rawPayload"||jsonb_build_object(
          'epsilonFileRecoveryVersion',${recoveryVersion}::text,'originalError',
          'Η εναλλακτική λήψη Epsilon δεν έδωσε επαληθευμένο PDF.')
        WHERE m."companyId"=${companyId} AND m."storeId"=${storeId} AND m."inboxId"=${inboxId}
          AND m."rawPayload"->>'source'=${source}
          AND m."rawPayload"->>'originalDownloaded' IS DISTINCT FROM 'true'
          AND EXISTS (
            SELECT 1 FROM "DocumentInbox" i WHERE i."id"=m."inboxId" AND i."companyId"=m."companyId" AND i."storeId"=m."storeId"
              AND i."attachmentId" IS NULL AND i."status"='RECEIVED'
          )`;
    }
  }
  return {downloaded,failed};
}
