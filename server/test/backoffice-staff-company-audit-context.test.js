import test from 'node:test';
import assert from 'node:assert/strict';
import {Prisma} from '@prisma/client';
import {readCompanyAuditContext} from '../src/services/backoffice-staff-company-audit-context.js';
const at=new Date('2026-11-08T12:00Z'),route={capability:'audit-event-context.read',sourceType:'PosSaleActionAudit',id:'own-action'},forbidden=()=>assert.fail('read requested a writer, bootstrap or video command');
function fixture(){
 const state={queries:[],sets:[],snapshots:0,foreign:false,overflow:false,bad:false,enabled:true,online:false,changedStore:false};
 const db={$executeRaw:forbidden,$executeRawUnsafe:forbidden,company:{findUnique:async()=>({id:'company',active:true,licenseStatus:'ACTIVE',modules:[{moduleKey:'ONLINE_ORDERING',active:true}]})}};
 const query=async(parts,...values)=>{const sql=parts.join('?'),trimmed=sql.trimStart();state.queries.push({sql,values});assert.doesNotMatch(sql,/\b(?:INSERT|UPDATE|DELETE|CREATE|ALTER|FOR UPDATE)\b/i);
  if(trimmed.startsWith('SELECT a."id",a."companyId"'))return state.foreign?[]:[{id:'own-action',companyId:'company',storeId:'selected',eventAt:at,saleId:'own-sale'}];
  if(sql.includes('FROM "PosSaleActionAudit" a'))return[{companyId:'company',id:'own-action',createdAt:at,storeId:'selected',storeName:'Own store',actorId:'PRIVATE_ACTOR',actorName:'Own operator',terminalPos:'MAIN',actionType:'PRICE_CHANGE',reason:'Own reason',saleId:'own-sale',relatedSaleId:null,details:{productName:'Own product',oldPrice:new Prisma.Decimal('2.30'),newPrice:0,password:'PRIVATE_PASSWORD'}}];
  if(sql.includes('FROM "Sale" s JOIN "Store" scopeStore')){const rows=[{id:'line-own',saleId:'own-sale',companyId:'company',storeId:'selected',productId:'own-product',operatorName:'Own employee',description:'Own receipt product',sku:'OWN',quantity:new Prisma.Decimal(2),unitPrice:0,lineTotal:0,discount:0},{id:'line-unavailable',saleId:'own-sale',companyId:'company',storeId:'selected',productId:'PRIVATE_FOREIGN_PRODUCT',operatorName:'Own employee',description:'Own historical receipt text',sku:'PRIVATE_FOREIGN_SKU',quantity:1,unitPrice:5,lineTotal:5,discount:0}];if(state.bad)rows[0].unitPrice='bad';return state.overflow?Array.from({length:10001},()=>rows[0]):rows}
  if(sql.includes('FROM "Product"'))return[{id:'own-product'}];
  if(sql.includes('FROM "VideoOperationalEvent"'))return[{terminalPos:'MAIN',operatorName:null,eventType:'SALE',eventAt:at,nvrEventAt:at,timeOffsetSeconds:-7,clipStartAt:at,clipEndAt:at,clipStatus:'RECORDED',expiresAt:new Date('2027-01-01T00:00Z'),streamReference:'PRIVATE_STREAM',endpoint:'PRIVATE_ENDPOINT'}];
  if(sql.includes('FROM "Store" WHERE'))return state.online?[{id:'kat-test-store',name:state.changedStore?'Changed store':'ΚΥΛΙΚΕΙΟ ΚΑΤ'},{id:'own-retail',name:'Own retail store'}]:[];
  if(sql.includes('FROM "StorePaidModule"'))return[{companyId:'company',storeId:'kat-test-store',active:true,startsAt:null,endsAt:null}];
  if(sql.includes('FROM "OnlineOrderingConfig"'))return[{enabled:state.enabled}];
  if(sql.includes('WITH selected_orders')){if(state.afterOnlineRead)state.afterOnlineRead();return[{id:'online-event',createdAt:at,fromStatus:'NEW',toStatus:'ACCEPTED',note:'ORDER_RECEIVED',orderNumber:'VISIBLE-001',customerName:'Visible customer',actorName:'Own operator',customerPhone:'PRIVATE_PHONE',userId:'PRIVATE_USER'}]}
  assert.fail('Unexpected source '+sql);
 };
 db.$queryRaw=query;db.$transaction=async(fn,options)=>{assert.equal(options.isolationLevel,'RepeatableRead');state.snapshots++;return fn({...db,$transaction:forbidden,$executeRawUnsafe:async sql=>{assert.ok(['SET TRANSACTION READ ONLY',"SET LOCAL statement_timeout = '5000ms'"].includes(sql));state.sets.push(sql)}})};
 return{db,state};
}
test('selected audit context reuses native metadata and line enrichment in one actual read-only snapshot without video requests',async()=>{
 const f=fixture(),value=await readCompanyAuditContext(f.db,'company',route);assert.equal(f.state.snapshots,1);assert.equal(f.state.sets.length,2);assert.equal(value.event.amount,-2.3);assert.equal(value.items.length,2);assert.equal(value.items[0].quantity,2);assert.equal(value.items[0].unitPrice,0);assert.equal(value.items[1].productId,null);assert.equal(value.items[1].sku,null);assert.equal(value.storedVideo.timeOffsetSeconds,-7);assert.equal(value.mediaRequested,false);assert.equal(value.rawDetailsIncluded,false);assert.doesNotMatch(JSON.stringify(value),/PRIVATE_/);
 const native=f.state.queries.find(row=>row.sql.includes('SELECT a."companyId"'));assert.ok(native);assert.equal(native.values.at(-1),'own-action');assert.match(native.sql,/AND a\."id"=\?/);assert.ok(!f.state.queries.some(row=>row.sql.includes('VideoConnectorCommand')));
});
test('foreign source records, malformed line values, oversized sources and unrecognized parameters fail closed',async()=>{
 for(const key of['foreign','overflow','bad']){const f=fixture();f.state[key]=true;await assert.rejects(readCompanyAuditContext(f.db,'company',route),error=>error.status===(key==='foreign'?404:503))}
 const f=fixture();await assert.rejects(readCompanyAuditContext(f.db,'company',route,{q:'PRIVATE'}),{status:400});assert.equal(f.state.queries.length,0);await assert.rejects(readCompanyAuditContext(f.db,'company',{...route,sourceType:'VideoConnectorCommand'}),{status:403});
});
const onlineRoute={capability:'audit-event-context.read',online:true},period={from:'2026-11-08',to:'2026-11-08'};
test('online audit reproduces the native latest300 KAT order window with effective module/config gates and only visible search',async()=>{
 const f=fixture();f.state.online=true;const value=await readCompanyAuditContext(f.db,'company',onlineRoute,period);assert.equal(value.count,1);assert.equal(value.items[0].orderNumber,'VISIBLE-001');assert.match(value.items[0].description,/Λήψη παραγγελίας.*Visible customer/);assert.equal(value.window.ordersPerStore,300);assert.equal(value.videoAccessAllowed,false);assert.doesNotMatch(JSON.stringify(value),/PRIVATE_|customerPhone|userId/);const sql=f.state.queries.find(row=>row.sql.includes('WITH selected_orders')).sql;assert.match(sql,/LIMIT 300/);assert.match(sql,/o\."companyId"=/);assert.match(sql,/employee\."storeId"=/);assert.match(sql,/u\."companyId"=/);
 assert.equal((await readCompanyAuditContext(f.db,'company',onlineRoute,{...period,q:'PRIVATE_PHONE'})).count,0);assert.ok(f.state.queries.every(row=>!row.values.includes('PRIVATE_PHONE')));
});
test('online missing sources are explicit and live configuration or store changes withhold already read data',async()=>{
 let f=fixture(),value=await readCompanyAuditContext(f.db,'company',onlineRoute,period);assert.equal(value.count,0);assert.equal(value.warnings[0].code,'NO_NATIVE_ONLINE_STORES');
 f=fixture();f.state.online=true;f.state.enabled=false;value=await readCompanyAuditContext(f.db,'company',onlineRoute,period);assert.equal(value.warnings[0].code,'ONLINE_CLOSED');assert.equal(value.count,0);assert.ok(!f.state.queries.some(row=>row.sql.includes('WITH selected_orders')));
 for(const mutate of[state=>state.enabled=false,state=>state.changedStore=true]){f=fixture();f.state.online=true;f.state.afterOnlineRead=()=>mutate(f.state);await assert.rejects(readCompanyAuditContext(f.db,'company',onlineRoute,period),{status:403})}
});

test('an owned non-KAT store keeps its explicit scope with a missing-source warning and never falls back to another store',async()=>{const f=fixture();f.state.online=true;const value=await readCompanyAuditContext(f.db,'company',onlineRoute,{...period,storeId:'own-retail'});assert.equal(value.storeId,'own-retail');assert.equal(value.count,0);assert.equal(value.warnings[0].code,'NOT_PARTICIPATING');assert.ok(!f.state.queries.some(row=>row.sql.includes('WITH selected_orders')));await assert.rejects(readCompanyAuditContext(f.db,'company',onlineRoute,{...period,storeId:'foreign'}),{status:404});});
