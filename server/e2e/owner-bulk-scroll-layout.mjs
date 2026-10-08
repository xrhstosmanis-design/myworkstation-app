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
  await page.setViewportSize(size);await page.setContent(markup('bulk'));
  const metrics=await page.locator('.bulk-price-scroll-region').evaluate(form=>({height:form.clientHeight,content:form.scrollHeight,overflow:getComputedStyle(form).overflowY,display:getComputedStyle(form).display,windowOverflow:getComputedStyle(form.closest('.commerce-shell')).overflowY}));
  assert.ok(metrics.height>100&&metrics.content>metrics.height,JSON.stringify({size,metrics}));assert.equal(metrics.overflow,'auto');assert.equal(metrics.display,'block');
  const form=page.locator('.bulk-price-scroll-region'),button=form.locator(':scope > button.primary');
  await form.evaluate(el=>{el.scrollTop=el.scrollHeight});
  const reach=await button.evaluate(button=>{const form=button.closest('form'),b=button.getBoundingClientRect(),f=form.getBoundingClientRect();return {bottom:b.bottom,top:b.top,formBottom:f.bottom,formTop:f.top,scroll:form.scrollTop}});
  assert.ok(reach.scroll>0&&reach.bottom<=reach.formBottom+1&&reach.top>=reach.formTop,JSON.stringify({size,reach}));
  // Restore normal mode: the existing window scrollbar must still reach the same final control.
  await page.locator('.commerce-shell').evaluate(el=>el.classList.remove('window-maximized'));
  await page.locator('.commerce-shell').evaluate(el=>{el.scrollTop=el.scrollHeight});
  const normal=await button.evaluate(b=>({buttonBottom:b.getBoundingClientRect().bottom,shellBottom:b.closest('.commerce-shell').getBoundingClientRect().bottom,overflow:getComputedStyle(b.closest('.commerce-shell')).overflowY}));
  assert.equal(normal.overflow,'auto');assert.ok(normal.buttonBottom<=normal.shellBottom+1,JSON.stringify({size,normal}));
  console.log(JSON.stringify({size,metrics,reach,normal}));
  if(process.env.LAYOUT_SCREENSHOT&&size.width===1920){await page.locator('.commerce-shell').evaluate(el=>el.classList.add('window-maximized'));await form.evaluate(el=>{el.scrollTop=el.scrollHeight});await page.screenshot({path:process.env.LAYOUT_SCREENSHOT});}
 }
 await page.setContent(markup('master'));
 assert.equal(await page.locator('.kiosk-shell').evaluate(el=>getComputedStyle(el).display),'grid');
 console.log('PASS: final control reachable in maximized/normal sizes; non-bulk kiosk grid preserved.');
 await page.close();
}finally{await browser.close()}
