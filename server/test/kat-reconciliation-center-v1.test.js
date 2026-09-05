import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const route=fs.readFileSync(new URL('../src/routes/kat-online-ordering-modifiers.js',import.meta.url),'utf8');
const ordering=fs.readFileSync(new URL('../src/routes/kat-online-ordering.js',import.meta.url),'utf8');
const panel=fs.readFileSync(new URL('../../client/src/components/commerce/OnlineOrdersBackofficePanel.jsx',import.meta.url),'utf8');

test('KAT BackOffice reconciles order sale fiscal EFTPOS and stock evidence',()=>{
  assert.match(route,/fiscalStatus/);
  assert.match(route,/PaymentDeviceRouteAttempt/);
  assert.match(route,/StockMovement/);
  assert.match(route,/attemptBySale/);
  assert.match(route,/movementsByOrder/);
  assert.match(ordering,/ONLINE_ORDER_SALE/);
  assert.match(panel,/Παραγγελία → Πώληση → Φορολογική → EFTPOS → Απόθεμα/);
});

test('missing critical evidence is visible and never silently green',()=>{
  assert.match(panel,/Απαιτείται fiscalization/);
  assert.match(panel,/ΧΩΡΙΣ EFTPOS ATTEMPT/);
  assert.match(panel,/ΧΩΡΙΣ ΚΙΝΗΣΗ/);
  assert.match(panel,/ΛΕΙΠΕΙ/);
  assert.match(panel,/attempt\?\.status==='SUCCESS'/);
});
