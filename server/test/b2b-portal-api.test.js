import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createB2BApi} from '../../client/src/components/b2b/b2b-api.js';

test('portal request helper uses isolated cookie/CSRF/no-store requests without admin bearer or caller header override',async()=>{
 const calls=[];const api=createB2BApi('own-site',{fetchImpl:async(url,options)=>{calls.push({url,options});return {ok:true,status:200,json:async()=>calls.length===1?{csrfToken:'private-csrf'}:{ok:true}}}});
 await api('/me');await api('/quotes',{method:'POST',body:{storeId:'own',items:[]},headers:{Authorization:'Bearer admin'}});
 assert.equal(calls[0].url,'/api/b2b/own-site/me');assert.equal(calls[1].options.credentials,'same-origin');assert.equal(calls[1].options.cache,'no-store');assert.equal(calls[1].options.headers['X-CSRF-Token'],'private-csrf');assert.equal(calls[1].options.headers.Authorization,undefined);api.clear();await api('/session',{method:'POST',body:{login:'user',password:'secret'}});assert.equal(calls[2].options.headers['X-CSRF-Token'],undefined);
 for(const slug of ['ab','a'.repeat(64),'two--hyphens','bad-','../foreign'])assert.throws(()=>createB2BApi(slug));await assert.rejects(api('https://foreign.invalid/me'));
});
test('portal request helper preserves status/code and treats malformed success as uncertain server failure',async()=>{
 const rejected=createB2BApi('own-site',{fetchImpl:async()=>({ok:false,status:409,json:async()=>({error:'changed',code:'PRICE_CHANGED',details:{}})})});await assert.rejects(rejected('/orders',{method:'POST',body:'{}'}),e=>e.status===409&&e.code==='PRICE_CHANGED');
 const malformed=createB2BApi('own-site',{fetchImpl:async()=>({ok:true,status:200,json:async()=>{throw Error('not json')}})});await assert.rejects(malformed('/orders',{method:'POST',body:'{}'}),e=>e.status===502);
});
test('dedicated B2B HTML/entry omit administrative bootstraps, storage and service-worker registration',async()=>{
 const html=await readFile(new URL('../../client/b2b.html',import.meta.url),'utf8'),entry=await readFile(new URL('../../client/src/b2b-entry.jsx',import.meta.url),'utf8'),portal=await readFile(new URL('../../client/src/components/b2b/B2BPortal.jsx',import.meta.url),'utf8'),api=await readFile(new URL('../../client/src/components/b2b/b2b-api.js',import.meta.url),'utf8');
 assert.match(html,/src="\/src\/b2b-entry.jsx"/);assert.equal((html.match(/<script/g)||[]).length,1);assert.doesNotMatch(html+entry+portal+api,/localStorage|sessionStorage|indexedDB|serviceWorker|entry-dispatch|\/src\/entry\.jsx|StoreOperator|PlatformAdmin|Bearer/);
});
