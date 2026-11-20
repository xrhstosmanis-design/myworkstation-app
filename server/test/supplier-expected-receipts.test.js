import test from 'node:test';
import assert from 'node:assert/strict';
import {buildOrderSuggestions} from '../src/lib/order-suggestions.js';
import {expectedReceiptSchemas} from '../src/services/supplier-expected-receipts.js';
import {staffRequestCapability} from '../../shared/backoffice-staff.mjs';
import {expectedReceiptAction,expectedReceiptProduct} from '../../shared/supplier-expected-receipts.mjs';
const row={productId:'p',name:'Product',unit:'PIECE',currentStock:3,minStock:15,soldQuantity:0,returnedQuantity:0};

test('only confirmed expected quantities reduce proposals; draft counts retain their informational role',()=>{
  assert.equal(buildOrderSuggestions([{...row,pendingPurchaseReview:[{status:'NEW',recordedStockQuantity:20}]}])[0].suggestedQuantity,12);
  assert.equal(buildOrderSuggestions([{...row,confirmedPendingStockQuantity:5}])[0].suggestedQuantity,7);
  const missing=buildOrderSuggestions([{...row,expectedReceiptsAvailable:false,confirmedPendingStockQuantity:5}])[0];assert.equal(missing.suggestedQuantity,12);assert.equal(missing.confirmedPendingStockQuantity,null);
  const changed=buildOrderSuggestions([{...row,confirmedPendingStockQuantity:5,expectedReceiptReviewReasons:['Η πηγή άλλαξε']}])[0];assert.equal(changed.suggestedQuantity,null);assert.match(changed.reason,/παραλαβές/);
});

test('confirmation preview preserves exact decimal multiplication and validation rejects unsupported scales',()=>{
  assert.equal(expectedReceiptProduct('999999999.999999','999999999.999999'),'999999999999998000.000000000001');
  assert.equal(expectedReceiptProduct('2','6'),'12');assert.equal(expectedReceiptProduct('0.000001','0.000001'),'0.000000000001');
  assert.equal(expectedReceiptProduct('1.0000001','6'),null);
  const body={storeId:'s',productId:'p',supplierId:'sup',invoiceUnit:'PACKAGE',invoiceQuantity:'1.0000001',stockUnitsPerInvoiceUnit:'6',idempotencyKey:'ffffffff-ffff-4fff-8fff-ffffffffffff'};
  assert.equal(expectedReceiptSchemas.confirm.safeParse(body).success,false);
});

test('exact routes reuse invoice grants without exposing adjacent endpoints or new capabilities',()=>{
  for(const path of ['/api/commerce/order-suggestions','/api/commerce/order-suggestions/by-supplier'])assert.equal(staffRequestCapability('GET',path),'order-suggestions.read');
  for(const path of ['/api/commerce/expected-receipts','/api/commerce/expected-receipts/candidates'])assert.equal(staffRequestCapability('GET',path),'invoices.read');
  for(const path of ['/api/commerce/expected-receipts','/api/commerce/expected-receipts/id/link','/api/commerce/expected-receipts/id/cancel-remaining'])assert.equal(staffRequestCapability('POST',path),'invoices.approve');
  for(const path of ['/api/commerce/expected-receipts/id/delete','/api/commerce/order-suggestions/unrelated','/api/commerce/expected-receipts/id/link/other'])assert.equal(expectedReceiptAction('POST',path),null);
  assert.equal(staffRequestCapability('PATCH','/api/purchase-orders/id',{status:'FINAL'}),'invoices.approve');
});
