import {reconcileInventory} from './inventory-reconciliation.js';
import {createHash} from 'node:crypto';
import {readLifecycleGeneration} from './store-lifecycle-generation.js';
import {readInventoryReusableLinks,readInventoryReviewState} from './inventory-reconciliation-review-source.js';
import {projectInventoryReviews} from './inventory-reconciliation-review-contract.js';
import {readInventorySourceEvidence} from './inventory-reconciliation-evidence-source.js';
const fail = (message,status=409) => {throw Object.assign(new Error(message),{status});};
export async function readInventoryReconciliationBase(tx, current, previousId = null) {
    const lifecycle=await readLifecycleGeneration(tx,{companyId:current.companyId,storeId:current.storeId});
    if(lifecycle.maintenance||lifecycle.retired)fail('Το κατάστημα βρίσκεται σε συντήρηση ή έχει αποσυρθεί.');
    const candidates = await tx.$queryRaw`SELECT "id","companyId","storeId","name","status","startedAt","finalizedAt",to_jsonb("Stocktake")->>'createdByUserId' AS "createdByUserId",to_jsonb("Stocktake")->>'finalizedByUserId' AS "finalizedByUserId",COALESCE(to_jsonb("Stocktake")->>'finalizationReason',to_jsonb("Stocktake")->'snapshotJson'->>'reason') AS "finalizationReason",
      to_jsonb("Stocktake")->>'scopeType' AS "scopeType" FROM "Stocktake"
      WHERE "companyId"=${current.companyId} AND "storeId"=${current.storeId} AND "status"='FINALIZED'
      AND "id"<>${current.id} AND "finalizedAt"<=${current.startedAt} ORDER BY "finalizedAt" DESC,"id" LIMIT 200`;
    const previousCandidate = previousId ? candidates.find(x => x.id === previousId) : candidates[0];
    if (!previousCandidate) fail('Δεν βρέθηκε προηγούμενη οριστικοποιημένη απογραφή στο ίδιο κατάστημα.',previousId ? 404 : 409);
    const parents = await tx.$queryRaw`SELECT "id","companyId","storeId","name","status","startedAt","finalizedAt",to_jsonb("Stocktake")->>'createdByUserId' AS "createdByUserId",to_jsonb("Stocktake")->>'finalizedByUserId' AS "finalizedByUserId",COALESCE(to_jsonb("Stocktake")->>'finalizationReason',to_jsonb("Stocktake")->'snapshotJson'->>'reason') AS "finalizationReason",
      to_jsonb("Stocktake")->>'scopeType' AS "scopeType" FROM "Stocktake"
      WHERE "id"=${current.id} AND "companyId"=${current.companyId} AND "storeId"=${current.storeId} AND "status"='FINALIZED'`;
    if (!parents.length) fail('Η απογραφή δεν είναι πλέον διαθέσιμη.');
    const {scopeType: previousScope, ...previous} = previousCandidate;
    const {scopeType: currentScope, ...fresh} = parents[0];
    const freePair = previousScope === 'FREE' && currentScope === 'FREE';
    const lines = await tx.$queryRaw`SELECT sl."id",sl."stocktakeId",sl."productId",sl."countedAt",sl."countedQuantity",sl."unitCost",p."name",p."sku"
      FROM "StocktakeLine" sl JOIN "Product" p ON p."id"=sl."productId" AND p."companyId"=${fresh.companyId}
      JOIN "Stocktake" st ON st."id"=sl."stocktakeId" AND st."companyId"=${fresh.companyId} AND st."storeId"=${fresh.storeId}
      WHERE sl."stocktakeId" IN (${fresh.id},${previous.id})
        AND (NOT ${freePair} OR EXISTS (
          SELECT 1 FROM "StocktakeLine" measured
          WHERE measured."productId"=sl."productId"
            AND measured."stocktakeId" IN (${fresh.id},${previous.id})
            AND measured."countedQuantity" IS NOT NULL))
      ORDER BY sl."productId",sl."id" LIMIT 10001`;
    if (lines.length > 10000) fail('Το διάστημα υπερβαίνει το όριο 10.000 γραμμών. Δεν εκδόθηκε μερικό αποτέλεσμα.',413);
    const events = await tx.$queryRaw`SELECT "id","stocktakeId","lineId","eventType","previousQuantity","countedQuantity","expectedQuantity","actorName","source","createdAt"
      FROM "InventoryCountEvent" WHERE "companyId"=${fresh.companyId} AND "storeId"=${fresh.storeId} AND "stocktakeId" IN (${fresh.id},${previous.id})
      ORDER BY "createdAt","id" LIMIT 100001`;
    if (events.length > 100000) fail('Υπερβολικά πολλές καταμετρήσεις. Δεν εκδόθηκε μερικό αποτέλεσμα.',413);
    const movements = await tx.$queryRaw`SELECT sm."id",sm."productId",sm."movementType",sm."quantity",sm."unitCost",sm."sourceType",sm."sourceId",sm."idempotencyKey",sm."note",sm."createdAt",
      u."fullName" AS "actorName",sm."createdByUserId" AS "actorId",d."id" AS "documentId",d."documentDate",d."documentNumber",d."createdAt" AS "documentRecordedAt"
      FROM "StockMovement" sm JOIN "Product" p ON p."id"=sm."productId" AND p."companyId"=${fresh.companyId}
      JOIN "Store" s ON s."id"=sm."storeId" AND s."companyId"=${fresh.companyId}
      LEFT JOIN "User" u ON u."id"=sm."createdByUserId" AND u."companyId"=${fresh.companyId}
      LEFT JOIN "PurchaseOrder" po ON po."id"=sm."sourceId" AND po."companyId"=${fresh.companyId} AND po."storeId"=${fresh.storeId}
        AND sm."sourceType"='PURCHASE_ORDER'
      LEFT JOIN "PurchaseDocument" d ON d."id"=CASE
        WHEN sm."sourceType"='PURCHASE_ORDER' THEN po."sourceDocumentId"
        WHEN sm."sourceType" IN ('PURCHASE_DOCUMENT','PURCHASE_APPROVAL','AI_READER_CONFIRM','CREDIT_NOTE_APPROVAL') THEN sm."sourceId"
        END AND d."companyId"=${fresh.companyId} AND d."storeId"=${fresh.storeId}
      WHERE sm."storeId"=${fresh.storeId} AND sm."createdAt">=${previous.startedAt} AND sm."createdAt"<=${fresh.finalizedAt}
        AND EXISTS (SELECT 1 FROM "StocktakeLine" l WHERE l."productId"=sm."productId" AND l."stocktakeId" IN (${fresh.id},${previous.id})
          AND (NOT ${freePair} OR l."countedQuantity" IS NOT NULL))
      ORDER BY sm."createdAt",sm."id" LIMIT 100001`;
    if (movements.length > 100000) fail('Υπερβολικά πολλές κινήσεις. Δεν εκδόθηκε μερικό αποτέλεσμα.',413);
    const input={previous,current:fresh,previousLines:lines.filter(x=>x.stocktakeId===previous.id),currentLines:lines.filter(x=>x.stocktakeId===fresh.id),events,movements};
    const preliminary=reconcileInventory(input);
    const evidence=await readInventorySourceEvidence(tx,{...preliminary,movements});
    const report=reconcileInventory({...input,movements:evidence.movements,sourceFindings:evidence.sourceFindings});
    report.sourceEvidence=evidence.evidence;
    report.coverage.transactionSourcesAvailable=evidence.evidence.coverage.sales;
    report.stockScope={kind:'STORE_STOCK_POOL',storeId:fresh.storeId,warehouseIdentityAvailable:false,explanation:'Ενιαίο απόθεμα του επιλεγμένου καταστήματος. Δεν υπάρχει ανεξάρτητη ταυτότητα φυσικής αποθήκης στην υπάρχουσα πηγή.'};
    return {...report,generation:lifecycle.generation,fingerprint:createHash('sha256').update(JSON.stringify([report,lifecycle.generation])).digest('hex'),
      candidates:candidates.map(({id,name,finalizedAt})=>({id,name,finalizedAt}))};
}
export async function readInventoryReconciliation(db, current, previousId = null) {
  return db.$transaction(async tx => {
    const base=await readInventoryReconciliationBase(tx,current,previousId);
    const scope={companyId:base.current.companyId,storeId:base.current.storeId,generation:base.generation,previousId:base.previous.id,currentId:base.current.id};
    const state=await readInventoryReviewState(tx,scope);
    const reusableLinks=state.available?await readInventoryReusableLinks(tx,scope):[];
    return projectInventoryReviews(base,state,reusableLinks);
  },{isolationLevel:'RepeatableRead',maxWait:5000,timeout:20000});
}
