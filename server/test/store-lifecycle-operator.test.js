import test from 'node:test';
import assert from 'node:assert/strict';
import {lifecycleOperatorRequest} from '../scripts/store-lifecycle-operator.mjs';
const env={NODE_ENV:'production',RENDER_SERVICE_ID:'srv-d9isenfavr4c73bdh52g'},scope=['--approval','STORE-LIFECYCLE-01','--company','pilot-company','--store','kat-store'];
test('private operator refuses Work, wrong service/company/store/approval and malformed or duplicate actions before any DB import',()=>{
 for(const wrong of [{}, {...env,NODE_ENV:'test'},{...env,RENDER_SERVICE_ID:'crn-other'}])assert.throws(()=>lifecycleOperatorRequest(['inspect',...scope],wrong));
 for(const args of [['DELETE',...scope],['inspect'],['inspect',...scope,'--company','other'],['inspect',...scope,'--unknown','value'],['execute',...scope],['prepare',...scope,'--operation','11111111-1111-4111-8111-111111111111']])assert.throws(()=>lifecycleOperatorRequest(args,env));
 const request=lifecycleOperatorRequest(['inspect',...scope],env);assert.deepEqual(request.scope,{companyId:'pilot-company',storeId:'kat-store'});assert.equal(request.actor.id,'service-operator:render:STORE-LIFECYCLE-01');assert.notEqual(request.actor.id,'admin');assert.equal(request.actor.platformRole,'SUPER_ADMIN');
 assert.throws(()=>lifecycleOperatorRequest(['execute',...scope,'--operation','11111111-1111-4111-8111-111111111111','--snapshot','1'.repeat(64),'--confirmation','OTHER'],env));
});
