import {ensureStoreIntegrationSchema} from "../store-integration-bootstrap.js";

export const ensureMyDataBranchSchema=ensureStoreIntegrationSchema;

export async function readMyDataBranchForStore(db,companyId,storeId){
  const [mapping]=await db.$queryRaw`
    SELECT "metadataJson"->'myDataRecipientBranch' AS "branch" FROM "StoreIntegrationCredential"
    WHERE "companyId"=${companyId} AND "storeId"=${storeId} AND "kind"='MYDATA'
  `;
  const branch=mapping?.branch;
  return Number.isInteger(branch)&&branch>=0&&branch<=2147483647?branch:null;
}

export async function hasMyDataBranchMappings(db,companyId){
  const [state]=await db.$queryRaw`
    SELECT EXISTS (
      SELECT 1 FROM "StoreIntegrationCredential"
      WHERE "companyId"=${companyId} AND "kind"='MYDATA'
        AND (
          "metadataJson"->'myDataBranchRoutingEnabled'='true'::jsonb
          OR jsonb_typeof("metadataJson"->'myDataRecipientBranch')='number'
        )
    ) AS configured
  `;
  return state?.configured===true;
}
