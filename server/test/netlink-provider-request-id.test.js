import test from 'node:test';
import assert from 'node:assert/strict';
import {assertNetlinkProviderRequestId} from '../src/integrations/netlink/provider-request-id.js';
import {dispatchPaidNetlink} from '../src/integrations/netlink/paid-issuance-contract.js';

test('provider tracing IDs are seconds-sized bounded numeric strings',()=>{
 for(const id of ['35386829','1790000000','2147483647'])assert.equal(assertNetlinkProviderRequestId(id),id);
 for(const id of ['0','-1','2147483648','1790000000000','123456789012345678901234567890123456789','uuid','1.5','01'])assert.throws(()=>assertNetlinkProviderRequestId(id),{code:'NETLINK_PROVIDER_REQUEST_ID_INVALID'});
});
test('an old oversized ready intent is rejected before any provider dispatch',async()=>{
 let touched=0;const scope={companyId:'company',storeId:'store'},requestId='existing';
 await assert.rejects(()=>dispatchPaidNetlink({scope,requestId,repository:{load:async()=>({...scope,requestId,status:'READY_FOR_PAYMENT',providerRequestId:'123456789012345678901234567890123456789'}),claim:async()=>{touched++}},provider:{execute:async()=>{touched++}},loadEvidence:async()=>{touched++}}),{code:'NETLINK_PROVIDER_REQUEST_ID_INVALID'});
 assert.equal(touched,0);
});
test('an already uncertain legacy request is retained without validation-driven resubmission',async()=>{
 let touched=0;const scope={companyId:'company',storeId:'store'},requestId='existing';
 const result=await dispatchPaidNetlink({scope,requestId,repository:{load:async()=>({...scope,requestId,status:'UNKNOWN',providerRequestId:'123456789012345678901234567890123456789'})},provider:{execute:async()=>{touched++}},loadEvidence:async()=>{touched++}});
 assert.equal(result.status,'UNKNOWN');assert.equal(result.idempotentReplay,true);assert.equal(touched,0);
});
