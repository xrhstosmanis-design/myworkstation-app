import test from 'node:test';
import assert from 'node:assert/strict';
import {reviewLifecycleDependencies} from '../src/services/store-lifecycle-dependencies.js';
const edge=(parent,child,constraint,deletion='c',childSchema='app',parentSchema='app')=>({parent,child,constraint,deletion,childSchema,parentSchema});
const review=(dependencies,inventory=[])=>reviewLifecycleDependencies({schema:'app',selected:new Set(['Sale']),inventory,dependencies});
test('dependency review traverses grandchildren and cycles exactly once without treating them as owned',()=>{
  const edges=[edge('Sale','Line','line_sale'),edge('Line','Attachment','attachment_line'),edge('Attachment','Line','line_attachment')];
  const rows=review(edges);assert.equal(rows.length,3);
  assert.ok(rows.some(row=>row.table==='Attachment'&&row.parent==='Line'));
  assert.ok(rows.every(row=>row.action==='REVIEW'));
  assert.deepEqual(review([...edges].reverse()),rows);
});
test('KEEP, directly inventoried and cross-schema descendants remain visible for review',()=>{
  const rows=review([edge('Sale','Settings','settings_sale','n'),edge('Settings','Audit','audit_settings','r'),edge('Sale','Line','external_sale','c','external')],[{table:'Settings',action:'KEEP'}]);
  assert.equal(rows.find(row=>row.table==='Settings').action,'KEEP');
  assert.ok(rows.some(row=>row.table==='Audit'));
  assert.equal(rows.find(row=>row.schema==='external').crossSchema,true);
});
test('same named foreign parent and unrelated shared catalog are outside traversal',()=>{
  assert.deepEqual(review([edge('Sale','ForeignLine','foreign_sale','c','external','external'),edge('Product','CatalogHistory','catalog_product')]),[]);
  assert.deepEqual(reviewLifecycleDependencies({schema:'app',selected:new Set(),inventory:[],dependencies:[edge('Sale','Line','line_sale')]}),[]);
});
