import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import http from 'node:http';
import {readFile} from 'node:fs/promises';
import test from 'node:test';
import * as foundation from '../src/integrations/efood/foundation.js';
import {buildEfoodEventList,buildEfoodEventPreview} from '../src/integrations/efood/event-preview.js';
import {decryptStoreIntegrationValue,encryptStoreIntegrationValue} from '../src/integrations/store-integration-crypto.js';

const source=await readFile(new URL('../src/routes/platform-efood-integrations.js',import.meta.url),'utf8');
const webhook=await readFile(new URL('../src/routes/efood-pelican-webhook.js',import.meta.url),'utf8');
const identityStart=webhook.indexOf('export function requireWebhookIdentity('),identityEnd=webhook.indexOf('\nasync function ensureEfoodLabIntegrationScope',identityStart);
const requireWebhookIdentity=new Function('metadata','publicError',webhook.slice(identityStart,identityEnd).replace('export ','')+';return requireWebhookIdentity;')(row=>row.metadataJson||{},(status,code,message)=>Object.assign(new Error(message),{status,code,public:true}));
const payload={order_id:'safe-order',status:'READY_FOR_PICKUP',client:{store_id:'9344842'},items:[{sku:'SLL45E',name:'<img src=x>',barcode:['05201050130791'],pricing:{quantity:2,unit_price:1.5}}],customer:{phone:'PRIVATE_PHONE',address:'PRIVATE_ADDRESS'},authorization:'PRIVATE_AUTH',payment:{type:'PAID',order_total:99}};
const scope={companyId:'company',storeId:'store',integrationId:'integration'};
const mapping={...scope,externalProductId:'SLL45E',externalSku:'SLL45E',status:'MATCHED',productId:'product',productName:'Mustard',productSku:'LOCAL',inSelectedStore:true,notes:'PRIVATE_NOTES'};

async function harness(overrides={}){
  const state={integration:{id:'integration',companyId:'company',storeId:'store',environment:'SANDBOX',externalCallsEnabled:false,metadataJson:{vendorId:'9344842'}},event:{...scope,id:'event',mode:'LAB_WEBHOOK_TEST',payloadEnc:encryptStoreIntegrationValue(payload),payloadHash:foundation.efoodPayloadHash(payload)},mappings:[mapping],...overrides};
  const queries=[],middlewares=[];let handler,listHandler;
  const database={store:{async findFirst({where}){if(where.companyId!=='company')return null;if(where.id==='store')return {id:'store',companyId:'company',name:foundation.EFOOD_LAB_STORE_NAME,company:{name:foundation.EFOOD_LAB_COMPANY_NAME}};return {id:where.id,companyId:'company',name:'REAL STORE',company:{name:'REAL COMPANY'}}}},async $queryRaw(strings,...values){const sql=strings.join('?');queries.push({sql,values});if(sql.includes('FROM "StoreIntegrationCredential"'))return state.integration?[state.integration]:[];if(sql.includes('FROM "EfoodWebhookEvent"'))return sql.includes('LIMIT 200')?(state.event?[{...state.event,externalOrderId:'safe-order',externalStatus:'READY_FOR_PICKUP'}]:[]):state.event&&values[0]===state.event.id?[state.event]:[];if(sql.includes('FROM "EfoodProductMapping"'))return state.mappings;throw Error('Unexpected query')},async $executeRaw(){throw Error('Read-only route attempted a mutation')}};
  let chain;chain=new Proxy(()=>chain,{get:()=>chain,apply:()=>chain});
  const router={use(fn){middlewares.push(fn)},get(path,fn){if(path.endsWith('/events/:eventId/preview'))handler=fn;if(path.endsWith('/event-previews'))listHandler=fn},put(){},post(){},delete(){}};
  const transformed=source.replace(/^import .*;\r?\n/gm,'').replace(/export default router;\s*$/,'');
  const names=['crypto','Router','z','prisma','auth','ensureStoreIntegrationSchema','ensureEfoodIntegrationSchema','decryptStoreIntegrationValue','encryptStoreIntegrationValue','recordEfoodWebhookEvent','requireWebhookIdentity','buildEfoodEventList','buildEfoodEventPreview','assertCustomerDemoOutboundAllowed',...Object.keys(foundation)];
  const values=[crypto,()=>router,chain,database,(_req,_res,next)=>next(),()=>{throw Error('Unexpected schema write')},()=>{throw Error('Unexpected schema write')},decryptStoreIntegrationValue,encryptStoreIntegrationValue,()=>{throw Error('Unexpected event replay')},requireWebhookIdentity,buildEfoodEventList,buildEfoodEventPreview,integration=>assert.equal(integration.companyId,'company'),...Object.values(foundation)];
  new Function(...names,transformed)(...values);assert.equal(typeof handler,'function');
  const server=http.createServer(async(req,res)=>{let status=200;const response={status(value){status=value;return this},json(body){res.writeHead(status,{'Content-Type':'application/json'});res.end(JSON.stringify(body));return this}};const url=new URL(req.url,'http://fixture.invalid');const parts=url.pathname.split('/');const request={params:{companyId:parts[1],storeId:parts[2],eventId:parts[3]},user:req.headers['x-test-admin']==='yes'?{isSuperAdmin:true}:{},headers:{}};let allowed=true;for(const middleware of middlewares){let next=false;middleware(request,response,()=>next=true);if(!next){allowed=false;break}}if(allowed)await (parts[3]==='list'?listHandler:handler)(request,response,error=>response.status(error.status||500).json({error:error.message,code:error.code}));});
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  return {state,queries,async get(path='/company/store/event',admin=true){const r=await fetch('http://127.0.0.1:'+server.address().port+path,{headers:admin?{'x-test-admin':'yes'}:{}});return {status:r.status,body:await r.json()}},async close(){await new Promise(resolve=>server.close(resolve))}};
}

test('scoped efood preview resolves explicit mappings and never projects raw/customer/payment data',()=>{
  const parsed=foundation.normalizeEfoodWebhook(payload),event={id:'event',mode:'LAB_WEBHOOK_TEST'};
  for(const [mappings,status,reason] of [[[], 'UNMATCHED','MAPPING_MISSING'],[[mapping],'MATCHED',null],[[{...mapping,inSelectedStore:false}],'BLOCKED','PRODUCT_NOT_IN_SELECTED_STORE'],[[{...mapping,status:'UNMATCHED'}],'UNMATCHED','MAPPING_UNCONFIRMED'],[[mapping,{...mapping,productId:'another'}],'BLOCKED','AMBIGUOUS_MAPPING'],[[{...mapping,companyId:'foreign'}],'UNMATCHED','MAPPING_MISSING']]){
    const r=buildEfoodEventPreview({event,parsed,mappings,scope});assert.equal(r.items[0].mappingStatus,status);assert.equal(r.items[0].reason,reason);assert.equal(r.commercialExecutionReady,false);assert.equal(r.items[0].quantity,2);assert.equal(r.items[0].barcodes[0],'05201050130791');assert.doesNotMatch(JSON.stringify(r),/PRIVATE_|unit_price|order_total|payloadEnc|payloadHash|authorization|customer/);
  }
});

test('registered authenticated preview handler is read-only, scoped, encrypted and fail-closed',async t=>{
  const old=process.env.INTEGRATION_CREDENTIALS_KEY;process.env.INTEGRATION_CREDENTIALS_KEY='synthetic-preview-encryption-key';t.after(()=>{if(old===undefined)delete process.env.INTEGRATION_CREDENTIALS_KEY;else process.env.INTEGRATION_CREDENTIALS_KEY=old});
  const h=await harness();try{
    const denied=await h.get('/company/store/event',false);assert.equal(denied.status,403);assert.equal(h.queries.length,0);
    assert.equal((await h.get('/company/store/list',false)).status,403);assert.equal(h.queries.length,0);
    const listed=await h.get('/company/store/list');assert.equal(listed.status,200);assert.deepEqual(listed.body.events,[{id:'event',externalOrderId:'safe-order',externalStatus:'READY_FOR_PICKUP'}]);assert.doesNotMatch(JSON.stringify(listed.body),/PRIVATE_|payload|customer|payment/i);
    const foreignCompany=await h.get('/foreign/store/event');assert.equal(foreignCompany.status,404);
    const realStore=await h.get('/company/real/event');assert.equal(realStore.status,409);
    const missing=await h.get('/company/store/foreign-event');assert.equal(missing.status,404);
    const r=await h.get();assert.equal(r.status,200);assert.equal(r.body.storeId,'store');assert.equal(r.body.eventId,'event');assert.equal(r.body.items[0].product.id,'product');assert.equal(r.body.preparationOnly,true);assert.equal(r.body.commercialExecutionReady,false);
    assert.doesNotMatch(JSON.stringify(r.body),/PRIVATE_|payloadEnc|payloadHash|"customer"|"payment"|"authorization"/i);
    const eventQuery=h.queries.find(q=>q.sql.includes('FROM "EfoodWebhookEvent"')&&q.values[0]==='event');assert.deepEqual(eventQuery.values,['event','company','store','integration']);
    const mapQuery=h.queries.find(q=>q.sql.includes('FROM "EfoodProductMapping"'));assert.deepEqual(mapQuery.values,['company','store','company','store','integration']);assert.match(mapQuery.sql,/LEFT JOIN "StoreProduct"/);
    for(const key of ['externalCall','orderCreated','saleCreated','stockChanged','paymentPosted','fiscalExecution'])assert.equal(r.body[key],false);
    const before=JSON.stringify(h.state);await h.get();assert.equal(JSON.stringify(h.state),before);
  }finally{await h.close()}
  for(const [overrides,status,code] of [[{integration:null},404,'EFOOD_PREVIEW_NOT_FOUND'],[{integration:{id:'integration',companyId:'company',storeId:'store',environment:'PRODUCTION'}},409,'EFOOD_PREVIEW_LAB_ONLY'],[{event:{...scope,id:'event',companyId:'foreign'}},404,'EFOOD_PREVIEW_NOT_FOUND']]){const h=await harness(overrides);try{const r=await h.get();assert.equal(r.status,status);assert.equal(r.body.code,code)}finally{await h.close()}}
  const h2=await harness();try{h2.state.event.payloadEnc='PRIVATE_CORRUPT';let r=await h2.get();assert.equal(r.status,503);assert.equal(r.body.code,'EFOOD_PREVIEW_UNAVAILABLE');assert.doesNotMatch(JSON.stringify(r.body),/PRIVATE/);h2.state.event.payloadEnc=encryptStoreIntegrationValue(payload);h2.state.event.payloadHash='wrong';r=await h2.get();assert.equal(r.status,409);assert.equal(r.body.code,'EFOOD_PREVIEW_PAYLOAD_CONFLICT')}finally{await h2.close()}
});
