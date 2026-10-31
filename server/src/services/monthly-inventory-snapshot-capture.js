// Internal trusted coordinator only. No route, scheduler, enrollment or DDL.
import {readMonthlyInventorySnapshotSourcesInTransaction,readMonthlyInventorySnapshotSourcesForAutomationInTransaction,normalizeMonthlyInventorySnapshotSourceInput,normalizeMonthlyInventorySnapshotActor} from './monthly-inventory-snapshot-source.js';
import {normalizeMonthlyCaptureExecution,authorizeMonthlyCaptureSourceInTransaction,finishMonthlyCaptureSourceInTransaction} from './monthly-inventory-capture-authorization.js';
import {readMonthlyInvoiceSnapshotTransactionState} from './monthly-invoice-audit.js';
import {buildMonthlyInventorySnapshotCandidate,serializeMonthlyInventorySnapshotCandidate,MONTHLY_INVENTORY_SNAPSHOT_BASIS} from './monthly-inventory-snapshot-payload.js';
import {createMonthlyInventorySnapshotRepository} from './monthly-inventory-snapshot-repository.js';
const fail=code=>{throw Object.assign(new Error(code),{code,status:422})};
export async function captureMonthlyInventorySnapshot(db,actor,input){
 if(arguments.length!==3)fail('STOCK_SNAPSHOT_INPUT_INVALID');
 const selected=normalizeMonthlyInventorySnapshotSourceInput(input),principal=normalizeMonthlyInventorySnapshotActor(actor),revision=process.env.RENDER_GIT_COMMIT||process.env.GIT_COMMIT;
 const repository=createMonthlyInventorySnapshotRepository(db),existing=await repository.findExisting(principal,selected);
 if(existing)return Object.freeze({status:existing.status,sourceReadPerformed:false,newlyReadCandidateStored:false,receipt:existing});
 if(typeof revision!=='string'||revision.length!==40||! /^[a-f0-9]{40}$/.test(revision))fail('STOCK_SNAPSHOT_REVISION_UNAVAILABLE');
 const prepared=await db.$transaction(async tx=>{
  await tx.$executeRawUnsafe('SET TRANSACTION READ ONLY');
  await tx.$executeRawUnsafe("SET LOCAL statement_timeout='8000ms'");
  const source=await readMonthlyInventorySnapshotSourcesInTransaction(tx,principal,selected),observation=source.observation;
  const candidate=buildMonthlyInventorySnapshotCandidate({companyId:source.companyId,storeId:source.storeId,lifecycleGeneration:source.lifecycleGeneration,issueMonth:source.period.issueMonth,sourceObservedAt:observation.readFinishedAt,sourceRevision:revision,valuationBasis:MONTHLY_INVENTORY_SNAPSHOT_BASIS,coverage:source.coverage,products:source.products,invoices:source.invoices,pendingOriginals:source.pendingOriginals});
  const candidateJsonText=serializeMonthlyInventorySnapshotCandidate(candidate),end=await readMonthlyInvoiceSnapshotTransactionState(tx);
  if(end.transactionStartedAt!==observation.transactionStartedAt||end.readAt<observation.readFinishedAt)fail('INVOICE_SNAPSHOT_TRANSACTION_CHANGED');
  return {candidateJsonText,transactionStartedAt:observation.transactionStartedAt,sourceReadStartedAt:observation.readStartedAt,sourceReadFinishedAt:observation.readFinishedAt,stockCostLimitations:source.stockCostLimitations};
 },{isolationLevel:'RepeatableRead',maxWait:2000,timeout:35000});
 const receipt=await repository.store(principal,prepared);
 return Object.freeze({status:receipt.status,sourceReadPerformed:true,newlyReadCandidateStored:receipt.status==='STORED',receipt});
}

// The persisted leased job is the sole source of scope and period. Each phase
// mints its own authority; a source context is never carried into a writer.
export async function captureMonthlyInventorySnapshotForAutomation(db,input){
 if(arguments.length!==2)fail('MONTHLY_CAPTURE_INPUT_INVALID');
 const execution=normalizeMonthlyCaptureExecution(input),revision=process.env.RENDER_GIT_COMMIT||process.env.GIT_COMMIT;
 if(typeof revision!=='string'||revision.length!==40||!/^[a-f0-9]{40}$/.test(revision))fail('STOCK_SNAPSHOT_REVISION_UNAVAILABLE');
 const repository=createMonthlyInventorySnapshotRepository(db,{sourceRevision:revision}),existing=await repository.findExistingAutomation(execution);
 if(existing)return Object.freeze({status:existing.status,sourceReadPerformed:false,newlyReadCandidateStored:false,receipt:existing});
 const prepared=await db.$transaction(async tx=>{
  await tx.$executeRawUnsafe('SET TRANSACTION READ ONLY');
  await tx.$executeRawUnsafe("SET LOCAL statement_timeout='8000ms'");
  const context=await authorizeMonthlyCaptureSourceInTransaction(tx,execution,{sourceRevision:revision});
  const source=await readMonthlyInventorySnapshotSourcesForAutomationInTransaction(tx,context),observation=source.observation;
  const candidate=buildMonthlyInventorySnapshotCandidate({companyId:source.companyId,storeId:source.storeId,lifecycleGeneration:source.lifecycleGeneration,issueMonth:source.period.issueMonth,sourceObservedAt:observation.readFinishedAt,sourceRevision:revision,valuationBasis:MONTHLY_INVENTORY_SNAPSHOT_BASIS,coverage:source.coverage,products:source.products,invoices:source.invoices,pendingOriginals:source.pendingOriginals});
  const candidateJsonText=serializeMonthlyInventorySnapshotCandidate(candidate),end=await readMonthlyInvoiceSnapshotTransactionState(tx);
  if(end.transactionStartedAt!==observation.transactionStartedAt||end.readAt<observation.readFinishedAt)fail('INVOICE_SNAPSHOT_TRANSACTION_CHANGED');
  await finishMonthlyCaptureSourceInTransaction(tx,context);
  return {candidateJsonText,transactionStartedAt:observation.transactionStartedAt,sourceReadStartedAt:observation.readStartedAt,sourceReadFinishedAt:observation.readFinishedAt,stockCostLimitations:source.stockCostLimitations};
 },{isolationLevel:'RepeatableRead',maxWait:2000,timeout:35000});
 const receipt=await repository.storeAutomation(execution,prepared);
 return Object.freeze({status:receipt.status,sourceReadPerformed:true,newlyReadCandidateStored:receipt.status==='STORED',receipt});
}
