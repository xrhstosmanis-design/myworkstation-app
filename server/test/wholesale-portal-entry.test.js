import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {build} from 'esbuild';
import vite from '../../client/vite.config.js';

test('customer portal has a separate entry without administrative or POS bootstrap dependencies',async()=>{
  assert.equal(vite.build.rollupOptions.input.main,fileURLToPath(new URL('../../client/index.html',import.meta.url)));
  assert.equal(vite.build.rollupOptions.input.b2b,fileURLToPath(new URL('../../client/b2b.html',import.meta.url)));
  const html=await readFile(vite.build.rollupOptions.input.b2b,'utf8');
  assert.match(html,/b2b-entry\.jsx/);assert.doesNotMatch(html,/entry-dispatch|serviceWorker|manifest.webmanifest|purchase-order|localStorage/);
  const compiled=await build({entryPoints:[fileURLToPath(new URL('../../client/src/b2b-entry.jsx',import.meta.url))],bundle:true,write:false,metafile:true,format:'esm',platform:'browser',loader:{'.css':'empty'}});
  const modules=Object.keys(compiled.metafile.inputs).filter(path=>!path.includes('node_modules/'));
  assert.ok(modules.some(path=>path.endsWith('B2BPortal.jsx')));
  assert.ok(modules.every(path=>/b2b-entry\.jsx$|\/components\/b2b\//.test(path)),modules.join('\n'));
  const index=await readFile(new URL('../src/index.js',import.meta.url),'utf8');
  assert.ok(index.indexOf('app.use("/api/b2b",wholesalePortalRoutes)')<index.indexOf('app.use("/api",auth,'));
  assert.ok(index.indexOf('app.get("/b2b/:publicSlug"')<index.indexOf('app.get("*"'));
  assert.match(index,/app\.use\("\/api\/wholesale\/portal",auth,createWholesaleEntitlementGuard\(\),wholesalePortalAdminRoutes\)/);
  assert.match(index,/app\.get\("\/online\/:publicSlug"/);
});
