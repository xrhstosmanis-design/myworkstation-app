import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,mkdtemp,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import express from 'express';
import {build} from 'esbuild';
import vite from '../../client/vite.config.js';

test('standalone wholesale built entry reuses the actual suite without retail/POS/root/admin bootstraps',async()=>{
 const entry=fileURLToPath(new URL('../../client/wholesale.html',import.meta.url));
 assert.equal(vite.build.rollupOptions.input.wholesale,entry);
 assert.equal(vite.build.rollupOptions.input.main,fileURLToPath(new URL('../../client/index.html',import.meta.url)));
 assert.equal(vite.build.rollupOptions.input.b2b,fileURLToPath(new URL('../../client/b2b.html',import.meta.url)));
 const html=await readFile(entry,'utf8');assert.match(html,/wholesale-entry\.jsx/);assert.match(html,/lang="el"/);
 assert.doesNotMatch(html,/entry-dispatch|serviceWorker|manifest\.webmanifest|purchase-order|localStorage|store-lifecycle-bootstrap/);
 const compiled=await build({entryPoints:[fileURLToPath(new URL('../../client/src/wholesale-entry.jsx',import.meta.url))],bundle:true,write:false,metafile:true,format:'esm',platform:'browser',loader:{'.css':'empty'}});
 const modules=Object.keys(compiled.metafile.inputs).filter(name=>!name.includes('node_modules/'));
 for(const name of ['WholesaleApp.jsx','WholesaleSuiteWorkspace.jsx','WholesaleB2BPanel.jsx','WholesalePortalAdmin.jsx','SellerWorkspace.jsx','store-lifecycle-fetch.js','backofficeSessionBoundary.mjs'])assert.ok(modules.some(p=>p.endsWith('/'+name)),name+' must be the existing implementation');
 assert.ok(modules.every(name=>/wholesale-entry\.jsx$|\/components\/wholesale\/|\/components\/field-sales\/|\/components\/commerce\/(?:Wholesale(?:SuiteWorkspace|B2BPanel|PortalAdmin|SalesAssignments)\.jsx|wholesale-[a-z0-9-]+\.css)$|\/utils\/(?:backofficeSessionBoundary\.mjs|store-lifecycle-(?:fetch|origin)\.js)$/.test(name)),modules.join('\n'));
 assert.ok(!modules.some(name=>/\/main\.jsx$|CommerceLauncher|StoreCloudPage|entry-dispatch|store-lifecycle-bootstrap|workforce|pos-/i.test(name)));
 const source=await readFile(new URL('../src/index.js',import.meta.url),'utf8');
 assert.match(source,/import wholesaleWorkspaceRoutes from "\.\/routes\/wholesale-workspace\.js"/);
 assert.ok(source.indexOf('app.use("/api/wholesale/workspace",auth,wholesaleWorkspaceRoutes)')<source.indexOf('app.use("/api",auth,'));
 assert.ok(source.indexOf('app.get(["/wholesale","/wholesale.html"]')<source.indexOf('app.use(express.static(dist))'));
 assert.match(source,/app\.get\("\/b2b\/:publicSlug"/);assert.match(source,/app\.get\("\/online\/:publicSlug"/);
});

test('actual standalone HTML route serves its own file with no-store headers before generic fallback',async()=>{
 const source=await readFile(new URL('../src/index.js',import.meta.url),'utf8');
 const match=source.match(/app\.get\(\["\/wholesale","\/wholesale\.html"\],\(req,res\)=>\{[\s\S]*?\n\}\);/);assert.ok(match,'actual standalone entry registration');
 const dist=await mkdtemp(path.join(tmpdir(),'wholesale-entry-'));
 const app=express();let server;
 try{
  await writeFile(path.join(dist,'wholesale.html'),'<html><body>WHOLESALE_ENTRY_FIXTURE</body></html>');
  new Function('app','path','dist',match[0])(app,path,dist);
  app.get('*',(_req,res)=>res.send('RETAIL_FALLBACK'));
  server=await new Promise(resolve=>{const s=app.listen(0,'127.0.0.1',()=>resolve(s))});
  for(const pathname of ['/wholesale','/wholesale/','/wholesale?storeId=owned','/wholesale.html']){
   const response=await fetch('http://127.0.0.1:'+server.address().port+pathname);assert.equal(response.status,200);
   assert.equal(response.headers.get('cache-control'),'no-store');assert.equal(response.headers.get('referrer-policy'),'no-referrer');assert.equal(response.headers.get('x-content-type-options'),'nosniff');
   assert.match(await response.text(),/WHOLESALE_ENTRY_FIXTURE/);
  }
 }finally{if(server)await new Promise(resolve=>{server.close(resolve);server.closeIdleConnections()});await rm(dist,{recursive:true,force:true})}
});
