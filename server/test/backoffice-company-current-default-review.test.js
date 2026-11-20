import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {buildCurrentDefaultReview} from '../scripts/backoffice-company-current-default-review.mjs';

test('Current defaults review is reproducible from canonical source DDL without a database',async()=>{
 const stored=JSON.parse(await readFile(new URL('../../ops/backup/lifecycle/backoffice-company-current-defaults.proposed.json',import.meta.url),'utf8'));
 const generated=await buildCurrentDefaultReview();assert.deepEqual(generated,stored);
 assert.equal(Object.keys(generated.tables).length,14);assert.equal(Object.values(generated.tables).reduce((sum,t)=>sum+t.columns.length,0),168);
 assert.equal(generated.policy,'SOURCE_DERIVED_DEFAULTS_ONLY_NO_LIVE_ROW_OR_SCHEMA_ADMISSION');
 for(const item of generated.sourceFiles){const bytes=await readFile(new URL('../../'+item.path,import.meta.url));assert.equal(createHash('sha256').update(bytes).digest('hex'),item.sha256)}
});

test('Reviewed defaults retain independently specified disabled, zero, clock and source-eight semantics',async()=>{
 const review=await buildCurrentDefaultReview();
 const column=(table,name)=>{const c=review.tables[table].columns.find(c=>c.name===name);assert.ok(c,table+'.'+name);assert.equal(c.identity,'');assert.equal(c.generated,'');return c.defaultExpression};
 assert.equal(column('BackofficeStaffAccount','active'),'true');assert.equal(column('BackofficeStaffAccount','revision'),'1');assert.equal(column('BackofficeStaffAccount','pinHash'),null);
 assert.ok(!review.tables.BackofficeStaffAccount.columns.some(c=>c.name==='companyCapabilities'),'SOURCE is eight columns; target-only capability default is a separate reviewed transition');
 assert.equal(column('AiOwnerWallet','enabled'),'false');assert.equal(column('AiOwnerWallet','balanceMicros'),'0');assert.equal(column('AiOwnerWalletNotice','emailStatus'),"'DISABLED'::text");
 assert.equal(column('FtextCashRequest','status'),"'PREPARED'::text");assert.equal(column('MonthlyInventorySnapshot','storedAt'),'clock_timestamp()');
 assert.equal(column('MonthlyInventoryCaptureGrant','active'),'false');assert.equal(column('MonthlyInventoryCaptureJob','status'),"'PENDING'::text");assert.equal(column('MonthlyInventoryCaptureJob','attempt'),'0');
 assert.equal(column('StoreChatDelivery','deliveredAt'),'now()');assert.equal(column('StoreChatReaction','updatedAt'),'now()');
});
