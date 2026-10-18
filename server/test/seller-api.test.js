import test from 'node:test';
import assert from 'node:assert/strict';
import {createSellerApi} from '../../client/src/components/field-sales/seller-api.js';
const ctx={user:{id:'seller-a'},companyId:'company-a',actorId:'seller:seller-a',stores:[]};
test('seller helper discovers context and binds both mandatory comparison headers without selecting identity from body',async()=>{
 const calls=[];const api=createSellerApi(async(path,options)=>{calls.push({path,options});return path.endsWith('/context')?ctx:{ok:true}});
 await assert.rejects(api('/orders'),error=>error.status===428);assert.equal(calls.length,0);await api('/context');assert.deepEqual(calls[0].options.headers,{});
 for(const path of ['/customers?storeId=a','/catalog?storeId=a&customerId=b','/quotes','/orders','/orders/own?storeId=a&customerId=b']){await api(path,{headers:{'X-Wholesale-Seller':'foreign'}});assert.deepEqual(calls.at(-1).options.headers,{'X-Wholesale-Seller':'seller-a','X-Wholesale-Company':'company-a'});assert.ok(calls.at(-1).path.startsWith('/api/wholesale/sellers/'))}
 api.clear();await assert.rejects(api('/orders'),error=>error.status===428);await assert.rejects(api('https://foreign.invalid/orders'));
});
