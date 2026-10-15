import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,readFile,writeFile,rm,copyFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {execFileSync} from 'node:child_process';

test('production audit preparation preserves permanent-price receipts and all existing safe actions on repeated builds',async()=>{
 const root=await mkdtemp(join(tmpdir(),'audit-build-'));
 try{
  await mkdir(join(root,'scripts'));await mkdir(join(root,'src/routes'),{recursive:true});
  const routeUrl=new URL('../src/routes/kiosk-reports-audit.js',import.meta.url);
  const original=await readFile(routeUrl,'utf8');
  const routePath=join(root,'src/routes/kiosk-reports-audit.js');
  const patchPath=join(root,'scripts/patch-audit-action-filter.mjs');
  await copyFile(new URL('../scripts/patch-audit-action-filter.js',import.meta.url),patchPath);
  // Reproduce the previous prepared artifact, then execute the real production patch.
  await writeFile(routePath,original.replace("'PRICE_CHANGE','PERMANENT_PRICE_CHANGE'","'PRICE_CHANGE'"));
  execFileSync(process.execPath,[patchPath]);
  const once=await readFile(routePath,'utf8');
  const query=once.slice(once.indexOf('const actionRows=await prisma.$queryRaw`'),once.indexOf('const operatorRows='));
  const actions=[...query.match(/a\."actionType" IN \(([^)]+)\)/)[1].matchAll(/'([^']+)'/g)].map(m=>m[1]);
  assert.deepEqual(actions,['RETURN','CANCEL','RETURN_ITEMS','SELF_CONSUMPTION','PRODUCT_DESTRUCTION','CART_ITEM_ADD','CART_QTY_CHANGE','CART_ITEM_REMOVE','CART_CANCEL','PRICE_CHANGE','PERMANENT_PRICE_CHANGE','AUDIENCE_DISCOUNT_SELECTED','ITEM_CHANGE_REQUEST','ITEM_EXCHANGE_COMPLETED','HOLD_RESTORE','HOLD_SAVE']);
  assert.ok(!actions.includes('WASTE'));
  assert.ok(query.includes('a."companyId"=${companyId}'));
  assert.ok(query.includes('a."storeId"=${storeId}'));
  execFileSync(process.execPath,[patchPath]);
  assert.equal(await readFile(routePath,'utf8'),once);
  // No other query, description, financial mapping or tenant filter may be rewritten.
  assert.equal(once,original);
 }finally{await rm(root,{recursive:true,force:true})}
});
