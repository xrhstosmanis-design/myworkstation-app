import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {staffProfiles,validStaffCapabilities} from '../../shared/backoffice-staff.mjs';
import {printInventoryArchivePage} from '../../client/src/components/commerce/inventory-export.js';

test('delegated inventory printing is opt-in and requires product read access',()=>{
  assert.ok(!staffProfiles.MANAGER.capabilities.includes('products.print'));
  assert.equal(validStaffCapabilities(['products.print']),false);
  assert.equal(validStaffCapabilities(['products.read','products.print']),true);
  const workspace=readFileSync(new URL('../../client/src/components/BackofficeStaffWorkspace.jsx',import.meta.url),'utf8');
  const panel=readFileSync(new URL('../../client/src/components/commerce/InventoryArchivePanel.jsx',import.meta.url),'utf8');
  assert.match(workspace,/staffPrint=\{capabilities.includes\("products.print"\)\}/);
  assert.match(panel,/printSnapshot\.storeId===storeId/);
  assert.match(panel,/readOnly&&staffPrint&&<button/);
});

test('the warehouse print popup contains only explicit current-page fields and escapes values',context=>{
  let markup,prints=0;
  const popup={opener:{},document:{write:value=>{markup=value},close(){}},focus(){},print(){prints++}};
  const previousWindow=globalThis.window;
  context.after(()=>{if(previousWindow===undefined)delete globalThis.window;else globalThis.window=previousWindow;});
  globalThis.window={open:()=>popup};
  const rows=[{sku:'001',name:'<script>ignore</script>',salePrice:0,currentStock:-4,internalNotes:'private inventory data'}];
  assert.equal(printInventoryArchivePage({storeName:'Δοκιμή <καταστήματος>',page:2,rows}),true);
  assert.equal(popup.opener,null);
  assert.equal(prints,1);
  assert.match(markup,/Δοκιμή &lt;καταστήματος&gt;/);
  assert.match(markup,/Τρέχουσα σελίδα 2 · 1 είδη/);
  assert.match(markup,/&lt;script&gt;ignore&lt;\/script&gt;/);
  assert.match(markup,/<td>0<\/td><td>-4<\/td>/);
  assert.doesNotMatch(markup,/private inventory data|<script>/);
  globalThis.window={open:()=>null};
  assert.equal(printInventoryArchivePage({storeName:'Δοκιμή',page:1,rows}),false);
});
