import {createHash} from "node:crypto";

const key="myDataReceivingContinuation";
const mappingRevisionKey="myDataBranchMappingRevision";
const isMark=value=>typeof value==="string"&&/^\d{1,40}$/.test(value);
const isPageKey=value=>typeof value==="string"&&value.length>0&&value.length<=4096;

export function myDataReceivingScope(integration,{companyId,storeId,companyVat,branch}){
  return {
    companyId,storeId,companyVat,branch,environment:integration.environment,
    mappingRevision:integration.metadataJson?.[mappingRevisionKey]??null,
    credentialsRevision:createHash("sha256").update(integration.credentialsEnc).digest("hex")
  };
}

export function readMyDataReceivingContinuation(integration,scope){
  const continuation=integration.metadataJson?.[key];
  if(!continuation||!Object.entries(scope).every(([field,value])=>continuation[field]===value)||!isMark(continuation.startMark))return null;
  if(continuation.partition===null&&continuation.row===null)return null;
  if(!isPageKey(continuation.partition)||!isPageKey(continuation.row))return null;
  return continuation;
}

export async function saveMyDataReceivingContinuation(db,scope,startMark,next){
  if(!isMark(startMark)||next&&(!isPageKey(next.partition)||!isPageKey(next.row))){
    throw Object.assign(new Error("Η ΑΑΔΕ επέστρεψε μη έγκυρα στοιχεία συνέχισης myDATA."),{status:409});
  }
  const state=JSON.stringify({...scope,startMark,partition:next?.partition??null,row:next?.row??null});
  const count=await db.$executeRaw`
    UPDATE "StoreIntegrationCredential"
    SET "metadataJson"=jsonb_set("metadataJson",'{myDataReceivingContinuation}',${state}::jsonb)
    WHERE "companyId"=${scope.companyId} AND "storeId"=${scope.storeId}
      AND "kind"='MYDATA' AND "enabled"=true AND "environment"=${scope.environment}
      AND "metadataJson"->'myDataRecipientBranch'=to_jsonb(${scope.branch}::integer)
  `;
  if(count!==1)throw Object.assign(new Error("Η σύνδεση myDATA άλλαξε. Ξεκίνα ξανά τη λήψη."),{status:409});
}
