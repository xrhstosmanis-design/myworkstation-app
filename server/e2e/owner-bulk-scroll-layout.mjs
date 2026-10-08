// Isolated real-component browser geometry regression. No API or live data access.
// Requires a local Playwright module and Chromium executable via the two env vars.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFileSync,readdirSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {build} from 'esbuild';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
const require=createRequire(import.meta.url);
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const compiled=await build({entryPoints:[fileURLToPath(new URL('../../client/src/components/commerce/OwnerProductCenter.jsx',import.meta.url))],bundle:true,write:false,format:'cjs',platform:'node',external:['react','react-dom','react-dom/server','react/jsx-runtime'],loader:{'.css':'empty'}});
const module={exports:{}};new Function('require','module','exports',compiled.outputFiles[0].text)(require,module,module.exports);
const Component=module.exports.default;
const assets=fileURLToPath(new URL('../../client/dist/assets/',import.meta.url));
const css=readdirSync(assets).filter(name=>name.endsWith('.css')).map(name=>readFileSync(assets+name,'utf8')).join('\n');
const markup=tab=>{
 globalThis.sessionStorage={getItem:()=>tab};
 const component=renderToStaticMarkup(React.createElement(Component,{api:()=>{throw Error('No API request allowed')},stores:[{id:'isolated-store',name:'Isolated store',active:true}]}));
 delete globalThis.sessionStorage;
 // Exact wrapper chain in CommerceLauncher -> stock host -> KioskStyleProductCenter full mode.
 return `<html><head><style>${css}</style></head><body><div class="commerce-overlay"><section class="commerce-shell window-maximized"><div class="commerce-window-bar"><strong>Isolated commerce window</strong></div><div class="commerce-mode-switch"><button>Products</button></div><div><div class="kiosk-shell"><div class="kiosk-return">Full management</div>${component}</div></div></section></div></body></html>`;
};
const browser=await chromium.launch({executablePath:process.env.CHROMIUM_EXECUTABLE_PATH,args:['--no-sandbox','--disable-dev-shm-usage','--disable-gpu'],headless:true});
try{
 const page=await browser.newPage();await page.route('**/*',route=>route.abort());
 for(const size of [{width:1920,height:925},{width:1366,height:768},{width:1280,height:600}]){
  await page.setViewportSize(size);
  for(const [tab,selector] of [['bulk','.bulk-price-scroll-region'],['promotion-import','.promotion-import-workspace']]){
   await page.setContent(markup(tab));
   const region=page.locator(selector),buttons=region.locator('button.primary');
   const metrics=await region.evaluate(el=>({height:el.clientHeight,content:el.scrollHeight,overflow:getComputedStyle(el).overflowY}));
   assert.ok(metrics.height>100&&metrics.content>metrics.height,JSON.stringify({size,tab,metrics}));assert.equal(metrics.overflow,'auto');
   const headerBefore=await page.locator('.owner-product-tabs').boundingBox();
   await region.hover();await page.mouse.wheel(0,1000);
   await page.waitForFunction(selector=>document.querySelector(selector).scrollTop>0,selector,{timeout:2000});
   const headerAfter=await page.locator('.owner-product-tabs').boundingBox();
   assert.equal(headerAfter.y,headerBefore.y);
   assert.equal(await buttons.count(),tab==='bulk'?1:2);
   for(const button of await buttons.all()){
    await button.evaluate(el=>el.scrollIntoView({block:'nearest'}));
    const reach=await button.evaluate(b=>{const r=b.closest('.bulk-price-scroll-region,.promotion-import-workspace'),br=b.getBoundingClientRect(),rr=r.getBoundingClientRect();return {top:br.top,bottom:br.bottom,regionTop:rr.top,regionBottom:rr.bottom,scroll:r.scrollTop};});
    assert.ok(reach.bottom<=reach.regionBottom+1&&reach.top>=reach.regionTop,JSON.stringify({size,tab,reach}));
   }
   await page.locator('.commerce-shell').evaluate(el=>el.classList.remove('window-maximized'));
   for(const button of await buttons.all()){
    await button.evaluate(el=>el.scrollIntoView({block:'nearest'}));
    const normal=await button.evaluate(b=>{const s=b.closest('.commerce-shell'),br=b.getBoundingClientRect(),sr=s.getBoundingClientRect();return {buttonTop:br.top,buttonBottom:br.bottom,shellTop:sr.top,shellBottom:sr.bottom,overflow:getComputedStyle(s).overflowY};});
    assert.equal(normal.overflow,'auto');assert.ok(normal.buttonBottom<=normal.shellBottom+1&&normal.buttonTop>=normal.shellTop,JSON.stringify({size,tab,normal}));
   }
   console.log(JSON.stringify({size,tab,metrics,controls:await buttons.count()}));
   if(process.env.LAYOUT_SCREENSHOT&&size.width===1920&&tab==='promotion-import'){
    await page.locator('.commerce-shell').evaluate(el=>el.classList.add('window-maximized'));await region.evaluate(el=>{el.scrollTop=el.scrollHeight});await page.screenshot({path:process.env.LAYOUT_SCREENSHOT});
   }
  }
 }
 await page.setContent(markup('master'));
 assert.equal(await page.locator('.kiosk-shell').evaluate(el=>getComputedStyle(el).display),'grid');
 console.log('PASS: final control reachable in maximized/normal sizes; Excel/Barcode both controls reachable; Master kiosk grid preserved.');
 await page.close();
}finally{await browser.close()}
