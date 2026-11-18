import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const operational=JSON.parse(readFileSync(new URL('../../../ops/backup/lifecycle/report-operational-compatibility.proposed.json',import.meta.url)));
const q=name=>'"'+name.replaceAll('"','""')+'"';
export const currentCapturePreservedTables=Object.freeze([...operational.tables.map(t=>t.name),'AutomaticReportSupplierComparisonConsent']);
export function nativeCurrentCapturePreservedSeedPlan(){
 const at=new Date('2026-11-01T08:00Z'),rows=[],add=(table,row,json=[])=>rows.push({table,row,json});
 add('PurchaseOrder',{id:'current-capture-awaiting',companyId:'company',storeId:'selected',awaitingInvoice:true});
 add('TableOrder',{id:'current-capture-order',companyId:'company',storeId:'selected',tableId:'current-capture-table-ref',operatorId:'admin',cashParts:[{amount:0,note:'preserved opaque synthetic'}]},['cashParts']);
 add('Product',{id:'current-capture-base-item',companyId:'company',name:'Current capture base',salePrice:0,costPrice:0});
 add('AutomaticReportRecipient',{recipientId:'current-capture-recipient',companyId:'company',storeId:'selected',email:'current-capture@fixture.invalid',createdBy:'admin',createdAt:at,updatedBy:'admin',updatedAt:at});
 add('AutomaticReportSupplierComparisonConsent',{companyId:'company',storeId:'selected',recipientId:'current-capture-recipient',recipientVersion:1,active:false,lifecycleGeneration:7,updatedBy:'admin',updatedAt:at});
 add('InventoryWarehouseEditAudit',{id:'current-capture-warehouse',storeId:'selected',productId:'item',stocktakeId:'current-capture-stocktake-ref',grantId:'current-capture-grant-ref',before:{currentStock:-7.5},after:{currentStock:-7.5},createdAt:at},['before','after']);
 add('InvoiceQrSupplierLearning',{companyId:'company',supplierVat:'000000000',providerFormat:'CURRENT_CAPTURE_SYNTHETIC',supplierName:'Preserved supplier',verifiedCount:0,firstVerifiedAt:at,lastVerifiedAt:at});
 add('InvoiceStockExclusionEmail',{companyId:'company',storeId:'selected',orderId:'current-capture-order-ref',reopenVersion:0,payload:{synthetic:true},attempts:0,nextAttemptAt:at},['payload']);
 add('PosInternalTransfer',{id:'current-capture-transfer',companyId:'company',sourceStoreId:'selected',destinationStoreId:'sibling',createdByUserId:'admin',idempotencyKey:'current-capture-transfer-key',createdAt:at});
 add('PosInternalTransferLine',{transferId:'current-capture-transfer',productId:'item',quantity:2,unitCost:0,vatRate:0});
 add('PosInternalTransferSettlement',{transferId:'current-capture-transfer',method:'BANK_TRANSFER',amount:0,bankReference:'Synthetic reference',recordedByUserId:'admin',recordedAt:at});
 add('PosPackageStockPosting',{id:'current-capture-package-posting',companyId:'company',storeId:'selected',saleId:'current-capture-sale-ref',lineId:'current-capture-line-ref',productId:'item',baseProductId:'current-capture-base-item',unitsPerPackage:2,quantity:0,createdAt:at});
 add('PosScannedCashReturn',{id:'current-capture-scanned',companyId:'company',storeId:'selected',terminalPos:'MAIN',actorId:'admin',requestHash:'0'.repeat(64),resultJson:{synthetic:true},createdAt:at},['resultJson']);
 add('StoreStockPackage',{companyId:'company',storeId:'selected',productId:'item',baseProductId:'current-capture-base-item',unitsPerPackage:2,updatedBy:'admin',updatedAt:at});
 return rows;
}
export function nativeCurrentCaptureSupplierDDL(){
 const source=readFileSync(new URL('../../scripts/sql/automatic-report-supplier-comparison.sql',import.meta.url),'utf8');
 const statements=source.match(/CREATE TABLE IF NOT EXISTS "AutomaticReportSupplierComparisonConsent" \([\s\S]*?\n\);/g);
 assert.equal(statements?.length,1,'canonical migration must contain exactly one Supplier CREATE');
 return statements[0];
}
export async function createNativeCurrentCaptureSource(db){
 // Explicit isolated test provisioning only. The installer never invokes this.
 for(const sql of operational.ddl)await db.$executeRawUnsafe(sql);
 const currentColumns=JSON.parse(readFileSync(new URL('../../../ops/backup/lifecycle/backoffice-company-current-columns.proposed.json',import.meta.url)));for(const column of currentColumns.columns)await db.$executeRawUnsafe(`ALTER TABLE ${q(column.table)} ADD COLUMN ${q(column.name)} ${column.type}${column.notNull?' NOT NULL':''}${column.defaultExpression===null?'':' DEFAULT '+column.defaultExpression}`);const check=currentColumns.costCheck;await db.$executeRawUnsafe(`ALTER TABLE ${q(check.table)} ADD CONSTRAINT ${q(check.name)} ${check.definition}`);
 // Use the actual reviewed Supplier migration CREATE, including its extra
 // MONTHLY-only CHECK. Do not execute its unrelated DispatchPolicy ALTERs.
 await db.$executeRawUnsafe(nativeCurrentCaptureSupplierDDL());
 assert.equal((await db.$queryRawUnsafe(`SELECT to_regclass('"AutomaticReportEventConsent"')::text AS name`))[0].name,null,'CURRENT source has no event consent table');
 await db.$transaction(async tx=>{await tx.$queryRawUnsafe("SELECT set_config('mws.lifecycle_generations',$1,true)",JSON.stringify({selected:'7',sibling:'0',foreign:'0'}));for(const{table,row,json=[]}of nativeCurrentCapturePreservedSeedPlan()){const entries=Object.entries(row);await tx.$executeRawUnsafe(`INSERT INTO ${q(table)}(${entries.map(([k])=>q(k)).join(',')}) VALUES(${entries.map(([k],i)=>'$'+(i+1)+(json.includes(k)?'::jsonb':'')).join(',')})`,...entries.map(([k,v])=>json.includes(k)?JSON.stringify(v):v))}},{timeout:60000});
 await db.$transaction(async tx=>{await tx.$queryRawUnsafe("SELECT set_config('mws.lifecycle_generations',$1,true)",JSON.stringify({selected:'7',sibling:'0',foreign:'0'}));await tx.$executeRawUnsafe(`UPDATE "StoreProduct" SET "costPriceOverride"=0,"vatDepartmentIdOverride"='current-opaque-vat',"categoryIdOverride"='current-opaque-category',"subcategoryIdOverride"='current-opaque-subcategory' WHERE "id"='stock'`)});
 return snapshotNativeCurrentCapturePreserved(db);
}
export async function snapshotNativeCurrentCapturePreserved(db){
 const rows={};for(const table of currentCapturePreservedTables)rows[table]=await db.$queryRawUnsafe(`SELECT row_to_json(t)::text AS row FROM ${q(table)} t ORDER BY row_to_json(t)::text COLLATE "C"`);const {inspectCompanyCurrentCaptureSource}=await import('../../src/services/backoffice-company-current-capture.js');const installed=(await db.$queryRawUnsafe("SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='BackofficeStaffAccount' AND column_name='companyCapabilities'")).length===1;const inspection=await inspectCompanyCurrentCaptureSource(db,'public',{phase:installed?'TARGET':'SOURCE'});inspection.evidence.defaults=inspection.evidence.defaults.filter(row=>!(row.table==='BackofficeStaffAccount'&&row.name==='companyCapabilities'));const runtimeValues={purchaseOrders:await db.$queryRawUnsafe('SELECT "id","awaitingInvoice" FROM "PurchaseOrder" ORDER BY "id"'),storeProducts:await db.$queryRawUnsafe('SELECT "id","costPriceOverride"::text AS "costPriceOverride","vatDepartmentIdOverride","categoryIdOverride","subcategoryIdOverride" FROM "StoreProduct" ORDER BY "id"'),tableOrders:await db.$queryRawUnsafe('SELECT "id","cashParts"::text AS "cashParts" FROM "TableOrder" ORDER BY "id"')};return{rows,catalogue:inspection.evidence,runtimeValues};
}
export async function verifyNativeCurrentCaptureDrift({db,runWorker}){
 const packageFunction=operational.ddl.find(sql=>sql.startsWith('CREATE OR REPLACE FUNCTION "mws_guard_package_stock"'));
 const scenarios=[
  ['unknown operational column','ALTER TABLE "InventoryWarehouseEditAudit" ADD COLUMN "unknownCurrentColumn" text','ALTER TABLE "InventoryWarehouseEditAudit" DROP COLUMN "unknownCurrentColumn"'],
  ['unknown seventh runtime column','ALTER TABLE "StoreProduct" ADD COLUMN "unknownCurrentColumn" text','ALTER TABLE "StoreProduct" DROP COLUMN "unknownCurrentColumn"'],
  ['canonical bootstrap default','ALTER TABLE "AiOwnerWallet" ALTER COLUMN "version" SET DEFAULT 1','ALTER TABLE "AiOwnerWallet" ALTER COLUMN "version" SET DEFAULT 0'],
  ['runtime default','ALTER TABLE "PurchaseOrder" ALTER COLUMN "awaitingInvoice" SET DEFAULT true','ALTER TABLE "PurchaseOrder" ALTER COLUMN "awaitingInvoice" SET DEFAULT false'],
  ['runtime type','ALTER TABLE "StoreProduct" ALTER COLUMN "costPriceOverride" TYPE numeric(14,4)','ALTER TABLE "StoreProduct" ALTER COLUMN "costPriceOverride" TYPE numeric(12,4)'],
  ['extra index','CREATE INDEX "current_unreviewed_index" ON "InvoiceQrSupplierLearning"("supplierVat")','DROP INDEX "current_unreviewed_index"'],
  ['extra FK','ALTER TABLE "PosInternalTransfer" ADD CONSTRAINT "current_unreviewed_fk" FOREIGN KEY("createdByUserId") REFERENCES "User"("id")','ALTER TABLE "PosInternalTransfer" DROP CONSTRAINT "current_unreviewed_fk"'],
  ['disabled package trigger','ALTER TABLE "StoreProduct" DISABLE TRIGGER "mws_guard_package_stock_change"','ALTER TABLE "StoreProduct" ENABLE TRIGGER "mws_guard_package_stock_change"'],
  ['changed package function',packageFunction.replace('BEGIN','BEGIN\n PERFORM 1;'),packageFunction],
  ['wrong cost CHECK',['ALTER TABLE "StoreProduct" DROP CONSTRAINT "StoreProduct_costPriceOverride_check"','ALTER TABLE "StoreProduct" ADD CONSTRAINT "StoreProduct_costPriceOverride_check" CHECK("costPriceOverride">=-1)'],['ALTER TABLE "StoreProduct" DROP CONSTRAINT "StoreProduct_costPriceOverride_check"','ALTER TABLE "StoreProduct" ADD CONSTRAINT "StoreProduct_costPriceOverride_check" CHECK("costPriceOverride">=0)']]
 ];
 const execute=async sql=>{for(const statement of Array.isArray(sql)?sql:[sql])await db.$executeRawUnsafe(statement)};
 for(const[name,change,restore]of scenarios){const before=await db.$queryRawUnsafe('SELECT "heartbeatJson","mac" FROM "StoreLifecycleRuntime" WHERE "id"=\'company-read-worker\'');await execute(change);try{await assert.rejects(runWorker(),error=>error.code===1,name+' must reject before publishing readiness');assert.deepEqual(await db.$queryRawUnsafe('SELECT "heartbeatJson","mac" FROM "StoreLifecycleRuntime" WHERE "id"=\'company-read-worker\''),before,name+' must not replace the signed capability')}finally{await execute(restore)}}
 await runWorker();
}
