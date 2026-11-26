import {cp1253Bytes} from '../src/rbs-capdriver-v1.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {assertRbsNativeCompletion} from '../src/integrations/netlink/paid-rbs-evidence.js';
import {rbsNetlinkAuditDetails} from '../src/integrations/netlink/paid-rbs-manifest.js';
import {assertNetlinkPaidSale} from '../src/integrations/netlink/paid-issuance-contract.js';
const id='00000000-0000-4000-8000-000000000001';
export function rbsFixture(method='CASH'){
 const scope={companyId:'company',storeId:'store'},items=['CARD','FEE'].map(role=>({productId:role,quantity:1,unitPrice:role==='CARD'?5:.5,overrideReason:`NETLINK_${role}:${id}`}));
 const intent={...scope,requestId:id,checkoutId:'checkout',saleProductId:'CARD',serviceFeeProductId:'FEE',amount:5,serviceFeeAmount:.5,customerTotal:5.5,checkoutContext:{kind:'RBS_NATIVE_COMMIT',terminalPos:'POS1',lifecycleGeneration:'0'}};
 const sale={...scope,id:'sale',clientTransactionId:'checkout',status:'COMPLETED',fiscalStatus:'ISSUED',saleFingerprint:'fingerprint',total:7.5};
 const native={...scope,id:'rbs',saleId:'sale',clientTransactionId:'checkout',terminalPos:'POS1',status:'SALE_COMMITTED',requestHash:'fingerprint',commandText:'synthetic-command',commandHash:createHash('sha256').update(cp1253Bytes('synthetic-command\r\n')).digest('hex'),claimedByDeviceId:'writer',claimedAt:'2026-11-26T10:00:00Z',dispatchedAt:'2026-11-26T10:00:01Z',updatedAt:'2026-11-26T10:00:02Z',paymentMethod:method,operatorId:method==='CARD'?'operator':null,operatorOutcome:method==='CARD'?'YES':null,total:7.5,checkoutJson:{actorId:'operator',items}};
 const audit={...scope,eventType:'POS_SALE_COMPLETED',actorId:'operator',details:{...rbsNetlinkAuditDetails(items),saleId:'sale',terminalPos:'POS1',total:7.5,paymentMethod:method}};
 return {scope,intent,sale,native,audit,device:{id:'writer'}};
}
for(const method of ['CASH','CARD'])test(`RBS ${method} uses native completion without inventing a fiscal number`,()=>{
 const f=rbsFixture(method),rbsCommit=assertRbsNativeCompletion(f);
 const proof={...f,rbsCommit,lines:[{productId:'CARD',quantity:1,unitPrice:5,lineTotal:5},{productId:'FEE',quantity:1,unitPrice:.5,lineTotal:.5}],payments:[{method,amount:7.5}],cashConfirmation:{...f.scope,requestId:id,checkoutId:'checkout',actorId:'operator',receivedAt:new Date(),amount:7.5},cardProof:{...f.scope,saleId:'sale',clientTransactionId:'checkout',status:'SUCCESS',method:'CARD',amount:7.5,evidenceId:'rbs'}};
 assert.equal(assertNetlinkPaidSale(proof).fiscalNumber,null);
 assert.throws(()=>assertNetlinkPaidSale({...proof,rbsCommit:null}),e=>e.code==='NETLINK_FISCAL_RECEIPT_REQUIRED');
 assert.throws(()=>assertNetlinkPaidSale({...proof,payments:[{method,amount:5.5}]}));
 assert.throws(()=>assertNetlinkPaidSale({...proof,cashConfirmation:null,cardProof:null}));
 assert.throws(()=>assertNetlinkPaidSale({...proof,lines:[proof.lines[0],{...proof.lines[1],lineTotal:0}]}));
});
test('RBS rejects pending, NO/CHECK, scope/terminal/writer/audit/manifest changes',()=>{
 for(const mutate of [
  f=>f.native.status='DISPATCHED',f=>f.native.status='REQUIRES_CHECK',f=>f.native.operatorOutcome='NO',f=>f.native.operatorOutcome='CHECK',f=>f.native.companyId='other',f=>f.native.storeId='other',f=>f.native.terminalPos='POS2',f=>f.native.saleId='other',f=>f.native.clientTransactionId='other',f=>f.native.claimedByDeviceId='other',f=>f.native.dispatchedAt=null,f=>f.native.claimedAt=null,f=>f.native.claimedAt='invalid',f=>f.native.commandText='changed',f=>f.native.requestHash='changed',f=>f.native.total=5.5,f=>f.native.checkoutJson.lifecycleGeneration='1',f=>f.audit=null,f=>f.audit.actorId='other',f=>f.audit.details.netlinkIntents=[],f=>f.audit.details.total=5.5,f=>f.audit.details.terminalPos='POS2',f=>f.native.checkoutJson.items[0].unitPrice=3,f=>f.native.checkoutJson.items.reverse(),f=>f.intent.checkoutContext=null
 ]){const f=rbsFixture('CARD');mutate(f);assert.throws(()=>assertRbsNativeCompletion(f),undefined,String(mutate));}
});
test('RBS manifest remains stable across PostgreSQL JSONB key order and rejects changed values',()=>{
 const a=[{productId:'card',quantity:1,overrideReason:`NETLINK_CARD:${id}`}],b=[{overrideReason:`NETLINK_CARD:${id}`,quantity:1,productId:'card'}];
 assert.equal(rbsNetlinkAuditDetails(a).netlinkManifestHash,rbsNetlinkAuditDetails(b).netlinkManifestHash);
 assert.notEqual(rbsNetlinkAuditDetails(a).netlinkManifestHash,rbsNetlinkAuditDetails([{...b[0],quantity:2}]).netlinkManifestHash);
});
