import test from 'node:test';
import assert from 'node:assert/strict';
import {internetMarketSearch} from '../src/routes/commerce-advanced-online-search.js';
const env={SERPER_API_KEY:'synthetic-serper',GOOGLE_CSE_API_KEY:'synthetic-google',GOOGLE_CSE_CX:'synthetic-cx'};
test('actual market search propagates cost/funds/REVIEW failure without paying a fallback provider',async()=>{
 for(const code of ['AI_WALLET_EXTERNAL_TARIFF_REQUIRED','AI_WALLET_INSUFFICIENT','AI_WALLET_USAGE_REVIEW']){
  let paid=0,attempts=0;
  await assert.rejects(internetMarketSearch('synthetic product',async()=>{attempts++;throw Object.assign(new Error(),{code});},{env,transport:async()=>{paid++;return new Response('{}');}}),e=>e.code===code);
  assert.equal(attempts,1);assert.equal(paid,0);
 }
});
test('actual market search meters each confirmed completed empty/result request separately and preserves normalized results',async()=>{
 const providers=[],requests=[];
 const result=await internetMarketSearch('synthetic product',async(provider,invoke)=>{providers.push(provider);return invoke();},{env,transport:async(url)=>{requests.push(String(url));return new Response(JSON.stringify(requests.length===1?{organic:[]}:{items:[{title:'Synthetic product 1 kg 2.00 €',link:'https://synthetic.invalid/product',snippet:'Synthetic result'}]}),{status:200});}});
 assert.deepEqual(providers,['SERPER_GOOGLE','GOOGLE_CSE']);assert.equal(requests.length,2);assert.equal(result.rows.length,1);assert.equal(result.provider,'GOOGLE_CSE');assert.equal(result.rows[0].sourceUrl,'https://synthetic.invalid/product');
});
test('actual market search provider timeout/error is inside one cost boundary and cannot fall through to another paid request',async()=>{
 let boundaries=0,paid=0;
 await assert.rejects(internetMarketSearch('synthetic product',async(provider,invoke)=>{boundaries++;try{return await invoke();}catch{throw Object.assign(new Error(),{code:'AI_WALLET_USAGE_REVIEW'});}},{env,transport:async()=>{paid++;throw new Error('lost response');}}),e=>e.code==='AI_WALLET_USAGE_REVIEW');
 assert.equal(boundaries,1);assert.equal(paid,1);
});
