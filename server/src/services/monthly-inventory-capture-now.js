import {captureMonthlyInventorySnapshotPersonalNow} from './monthly-inventory-snapshot-capture.js';
import {createMonthlyInventorySnapshotRepository} from './monthly-inventory-snapshot-repository.js';
import {verifyMonthlyInventorySnapshotCandidateText} from './monthly-inventory-snapshot-payload.js';

const fail=()=>{throw Object.assign(new Error('Monthly capture receipt unavailable.'),{code:'MONTHLY_CAPTURE_RECEIPT_INVALID',status:409})};
export function monthlyPersonalCaptureNowReceipt(receipt){
 if(!receipt||receipt.receiptBasis!=='FORMAT_VALIDATED_STORED_ONLY'||receipt.sourceAuthenticityVerified!==false)fail();
 const candidate=verifyMonthlyInventorySnapshotCandidateText(receipt.candidateJsonText),period=candidate.period;
 if(!Number.isSafeInteger(period.delayMs)||period.delayMs<0||candidate.companyId!==receipt.companyId||candidate.storeId!==receipt.storeId||candidate.lifecycleGeneration!==receipt.lifecycleGeneration||period.issueMonth!==receipt.issueMonth||period.sourceObservedAt!==receipt.sourceObservedAt)fail();
 return Object.freeze({receiptBasis:receipt.receiptBasis,sourceAuthenticityVerified:false,id:receipt.id,companyId:receipt.companyId,storeId:receipt.storeId,lifecycleGeneration:receipt.lifecycleGeneration,issueMonth:receipt.issueMonth,scheduledFor:receipt.scheduledFor,sourceObservedAt:receipt.sourceObservedAt,storedAt:receipt.storedAt,observationStatus:period.timing,delayMs:String(period.delayMs),sourceRevision:candidate.sourceRevision,sourceHash:receipt.sourceHash,payloadHash:receipt.payloadHash,storedBytesSha256:receipt.storedBytesSha256});
}
export function createMonthlyPersonalCaptureNowService(db){
 const repository=createMonthlyInventorySnapshotRepository(db);
 return Object.freeze({
  async preview(actor,input){
   const result=await repository.findExistingPersonalNow(actor,input),scope=result.scope;
   return Object.freeze({status:'PREVIEW',companyId:scope.companyId,storeId:scope.storeId,lifecycleGeneration:scope.lifecycleGeneration,issueMonth:scope.issueMonth,scheduledFor:scope.scheduledFor,checkedAt:scope.checkedAt,timing:scope.checkedAt===scope.scheduledFor?'ON_TIME':'LATE',existingReceipt:result.receipt?monthlyPersonalCaptureNowReceipt(result.receipt):null});
  },
  async capture(actor,input){
   const result=await captureMonthlyInventorySnapshotPersonalNow(db,actor,input);
   return Object.freeze({status:result.receipt.status,receipt:monthlyPersonalCaptureNowReceipt(result.receipt)});
  }
 });
}
