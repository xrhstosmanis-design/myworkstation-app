import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import http from 'node:http';
import {readFile} from 'node:fs/promises';
import test from 'node:test';
import {assertEfoodLabContext,normalizeEfoodWebhook} from '../src/integrations/efood/foundation.js';
import {constantTimeSecretEquals,encryptStoreIntegrationValue,decryptStoreIntegrationValue} from '../src/integrations/store-integration-crypto.js';

const source=await readFile(new URL('../src/routes/efood-pelican-webhook.js',import.meta.url),'utf8');
const secret='mws_lab_synthetic_test_key_0123456789';
const hash=value=>crypto.createHash('sha256').update(value).digest('hex');
const payload={order_id:'synthetic-order',status:'READY_FOR_PICKUP',store_id:'9344842',items:[{sku:'SYNTHETIC',quantity:1}]};

// Execute the registered production callback with real HTTP and cryptography.
// The database adapter is isolated/in-memory; this is not PostgreSQL or live LAB evidence.
async function harness(overrides={}){
  const state={integration:{id:'integration',companyId:'company',storeId:'store',kind:'EFOOD',environment:'SANDBOX',companyName:'MYWORKSTATION LAB',storeName:'ΕΡΓΑΣΤΗΡΙΟ ΔΟΚΙΜΩΝ',metadataJson:{vendorId:'9344842'},webhookSecretHash:hash(secret),enabled:true,externalCallsEnabled:false,webhookTestOpenedAt:new Date(),webhookTestExpiresAt:new Date(Date.now()+300000),webhookTestConsumedAt:null,...overrides},events:[]};
  const statements=[];
  let handler;
  const db={async $transaction(callback){return callback(db)},async $queryRaw(strings,...values){
    const sql=strings.join('?');statements.push(sql);
    if(sql.includes('FOR UPDATE'))return [state.integration];
    if(sql.includes('AS "companyName"'))return [{companyName:state.integration.companyName,storeName:state.integration.storeName}];
    if(sql.includes('FROM "EfoodWebhookEvent"'))return state.events.filter(e=>e.idempotencyKey===values[1]);
    throw new Error('Unexpected query: '+sql);
  },async $executeRaw(strings,...values){
    const sql=strings.join('?');statements.push(sql);
    if(sql.includes('INSERT INTO "EfoodWebhookEvent"')){state.events.push({id:values[0],idempotencyKey:values[10],payloadHash:values[11],payloadEnc:values[12],processingStatus:values[15]});return 1;}
    if(sql.includes("'CONSUMED'")){Object.assign(state.integration,{enabled:false,webhookTestConsumedAt:new Date(),webhookTestClosedReason:'CONSUMED',webhookTestEventId:values[0]});return 1;}
    if(sql.includes("'EXPIRED'")){Object.assign(state.integration,{enabled:false,webhookTestClosedReason:'EXPIRED'});return 1;}
    if(sql.includes("'CONFLICT'")){state.events[0].processingStatus='CONFLICT';return 1;}
    throw new Error('Unexpected mutation: '+sql);
  }};
  const transformed=source.replace(/^import .*;\r?\n/gm,'').replace(/export default router;\s*$/,'').replace(/export /g,'');
  const compile=new Function('crypto','Router','prisma','ensureStoreIntegrationSchema','ensureEfoodIntegrationSchema','constantTimeSecretEquals','encryptStoreIntegrationValue','assertEfoodLabContext','normalizeEfoodWebhook','assertCustomerDemoOutboundAllowed',transformed);
  compile(crypto,()=>({post(path,callback){assert.equal(path,'/pelican/:webhookKey');handler=callback}}),db,async()=>{},async()=>{},constantTimeSecretEquals,encryptStoreIntegrationValue,assertEfoodLabContext,normalizeEfoodWebhook,()=>{});
  assert.equal(typeof handler,'function');
  const server=http.createServer(async(req,res)=>{
    const chunks=[];for await(const chunk of req)chunks.push(chunk);
    let status=200;
    const response={status(value){status=value;return this},json(body){res.writeHead(status,{'Content-Type':'application/json'});res.end(JSON.stringify(body));return this}};
    await handler({get:name=>req.headers[name.toLowerCase()],params:{webhookKey:'synthetic'},body:JSON.parse(Buffer.concat(chunks).toString())},response,error=>response.status(error.status||500).json({error:error.message,code:error.code}));
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const url='http://127.0.0.1:'+server.address().port+'/pelican/synthetic';
  return {state,statements,async send(authorization,body=payload){const headers={'Content-Type':'application/json'};if(authorization!==undefined)headers.Authorization=authorization;const r=await fetch(url,{method:'POST',headers,body:JSON.stringify(body)});return {status:r.status,body:await r.json()}},async close(){await new Promise(resolve=>server.close(resolve))}};
}

test('efood registered callback accepts provider Bearer and legacy raw secret without business writes',async t=>{
  const previous=process.env.INTEGRATION_CREDENTIALS_KEY;
  process.env.INTEGRATION_CREDENTIALS_KEY='synthetic-test-encryption-key';
  t.after(()=>{if(previous===undefined)delete process.env.INTEGRATION_CREDENTIALS_KEY;else process.env.INTEGRATION_CREDENTIALS_KEY=previous});
  for(const authorization of [secret,'Bearer '+secret,'bEaReR '+secret,'Bearer\t'+secret]){
    await t.test(authorization===secret?'legacy raw header':'Bearer scheme variant',async()=>{
      const h=await harness();try{
        const r=await h.send(authorization);assert.equal(r.status,202);assert.equal(r.body.processingStatus,'LAB_WEBHOOK_VALIDATED_ONLY');
        assert.equal(r.body.windowAutoLocked,true);assert.equal(h.state.integration.enabled,false);assert.equal(h.state.integration.webhookTestClosedReason,'CONSUMED');
        assert.equal(h.state.events.length,1);assert.deepEqual(decryptStoreIntegrationValue(h.state.events[0].payloadEnc),payload);
        for(const field of ['externalCall','orderCreated','saleCreated','stockChanged','paymentPosted','fiscalExecution'])assert.equal(r.body[field],false);
        assert.ok(h.statements.every(sql=>!sql.includes('INSERT INTO "Sale"')&&!sql.includes('INSERT INTO "Payment"')&&!sql.includes('INSERT INTO "StockMovement"')));
        const replay=await h.send(authorization);assert.equal(replay.status,200);assert.equal(replay.body.idempotent,true);assert.equal(replay.body.eventId,r.body.eventId);assert.equal(h.state.events.length,1);
        const next=await h.send(authorization,{...payload,order_id:'other-order'});assert.equal(next.status,409);assert.equal(next.body.code,'EFOOD_TEST_WINDOW_CONSUMED');
      }finally{await h.close()}
    });
  }
  await t.test('wrong, malformed, empty and missing authentication cannot consume the window',async()=>{
    const h=await harness();try{
      for(const authorization of [undefined,'','Bearer','Bearer wrong','Basic '+secret,'Bearer '+secret+',other','Bearer Bearer '+secret,secret+',other']){
        const r=await h.send(authorization);assert.equal(r.status,401);assert.equal(h.state.events.length,0);assert.equal(h.state.integration.enabled,true);assert.equal(h.state.integration.webhookTestConsumedAt,null);
        assert.ok(['EFOOD_TEST_SECRET_INVALID','EFOOD_TEST_SECRET_REQUIRED'].includes(r.body.code));assert.ok(!JSON.stringify(r.body).includes(secret));
      }
    }finally{await h.close()}
  });
  await t.test('valid Bearer still enforces expiry, closed window, SANDBOX and vendor scope',async()=>{
    const cases=[[{webhookTestExpiresAt:new Date(Date.now()-1)},410,'EFOOD_TEST_WINDOW_EXPIRED',payload],[{enabled:false},503,'EFOOD_FAIL_CLOSED',payload],[{environment:'PRODUCTION'},503,'EFOOD_FAIL_CLOSED',payload],[{externalCallsEnabled:true},503,'EFOOD_FAIL_CLOSED',payload],[{companyName:'OTHER'},404,'EFOOD_WEBHOOK_NOT_FOUND',payload],[{},409,'VENDOR_MISMATCH',{...payload,store_id:'other-store'}]];
    for(const [overrides,status,code,body] of cases){const h=await harness(overrides);try{const r=await h.send('Bearer '+secret,body);assert.equal(r.status,status);assert.equal(r.body.code,code);assert.equal(h.state.events.length,0)}finally{await h.close()}}
  });
});
