import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {nativeCurrentCaptureSupplierDDL} from './fixtures/backoffice-current-capture-native.mjs';

test('Current native fixture preserves canonical Supplier monthly-only CHECK beyond Recipient constraints',()=>{
 const metadata=JSON.parse(readFileSync(new URL('./fixtures/ftext-full-schema-metadata-20261024.json',import.meta.url)));
 const review=JSON.parse(readFileSync(new URL('../../ops/backup/lifecycle/automatic-report-consent-extension.proposed.json',import.meta.url)));
 const inherited=metadata.constraints.filter(row=>row.table==='AutomaticReportRecipientConsent'&&row.kind==='c').map(row=>row.definition);
 const expected=review.checks.AutomaticReportSupplierComparisonConsent[0];
 const additional=expected.filter(definition=>!inherited.includes(definition));
 assert.equal(inherited.length,6);assert.equal(expected.length,7);
 assert.deepEqual(additional,['CHECK ("allowedFrequencies" <@ ARRAY[\'MONTHLY\'::text])']);
 const ddl=nativeCurrentCaptureSupplierDDL();
 assert.match(ddl,/LIKE "AutomaticReportRecipientConsent" INCLUDING DEFAULTS INCLUDING CONSTRAINTS INCLUDING INDEXES/);
 assert.match(ddl,/CHECK \("allowedFrequencies" <@ ARRAY\['MONTHLY'\]::text\[\]\)/);
 assert.match(ddl,/FOREIGN KEY \("companyId","storeId","recipientId"\)/);
 assert.ok(!/ALTER TABLE|BEGIN;|COMMIT;/.test(ddl),'isolated fixture does not execute unrelated migration operations');
});
