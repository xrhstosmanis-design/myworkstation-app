import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {assertWholesaleManager,assertWholesalePrincipal,authorizeWholesalePrincipal,authorizeWholesaleQuoteProducts,createWholesalePortalPrincipal,isWholesalePortalPrincipal} from '../src/lib/wholesale-principal.js';
import {buildWholesaleQuote} from '../src/lib/wholesale-pricing.js';
import {createWholesaleOrder} from '../src/lib/wholesale-orders.js';

const scope={companyId:'company-a',accountId:'account-a',sessionId:'session-a',siteId:'site-a',customerId:'customer-a',storeId:'store-a'};
const input={customerId:'customer-a',storeId:'store-a',items:[{productId:'product-a',quantity:'2'}]};
const manager={companyId:'company-a',actorId:'owner-a',role:'OWNER',tokenType:'BACKOFFICE_USER',channel:'BACKOFFICE'};
const bootstrapSource=(await readFile(new URL('../src/wholesale-b2b-bootstrap.js',import.meta.url),'utf8')).replace(/^import .*;\n/gm,'').replace('export async function','async function');
const bootstrapFor=db=>new Function('prisma',bootstrapSource+'\nreturn ensureWholesaleSchema;')(db);

function fixture(){
  const state={calls:[],orders:[],events:[],active:true,published:true,price:'3.2500',auth:[],publication:[]};
  const query=async(strings,...values)=>{
    const sql=Array.isArray(strings)?strings.join('?'):strings.sql||strings.text,v=Array.isArray(strings)?values:strings.values;state.calls.push({sql,values:v});
    if(sql.includes('pg_advisory_xact_lock'))return [{locked:''}];
    if(sql.includes('INSERT INTO "WholesaleOrderRequest"')){const [id,companyId,storeId,customerId,actorId,channel,clientOrderId,requestHash,quoteId,snapshot,notes,netTotal,vatTotal,grossTotal]=v;const row={id,companyId,storeId,customerId,actorId,channel,clientOrderId,requestHash,quoteId,snapshot:JSON.parse(snapshot),notes,netTotal,vatTotal,grossTotal,status:'SUBMITTED',createdAt:new Date('2026-10-18T12:00Z')};state.orders.push(row);return [structuredClone(row)]}
    if(sql.includes('INSERT INTO "WholesaleOrderEvent"')){state.events.push(v);return 1}
    if(sql.includes('FROM "WholesaleOrderRequest"'))return state.orders.filter(row=>row.companyId===v[0]&&row.actorId===v[1]&&row.clientOrderId===v[2]).map(row=>structuredClone(row));
    if(sql.includes('FROM "Company"'))return [{id:'company-a'}];
    if(sql.includes('FROM "Store"'))return [{id:'store-a',name:'Store A'}];
    if(sql.includes('FROM "WholesaleCustomer"'))return [{id:'customer-a',name:'Customer A'}];
    if(sql.includes('FROM "WholesaleCustomerPriceList"'))return [{id:'list-a',name:'List A'}];
    if(sql.includes('FROM "Product"'))return [{id:'product-a',name:'Product A',sku:'SKU-A',unit:'PIECE',vatRate:'24.000'}];
    if(sql.includes('JOIN LATERAL'))return [{id:'tier-a',productId:'product-a',minimumQuantity:'1.0000',unitPrice:state.price,discountPercent:null,priceBasis:'NET',version:1}];
    throw Error('Unexpected principal test query: '+sql);
  };
  const db={$queryRaw:query,$executeRaw:query,async $transaction(work,options){assert.equal(options.isolationLevel,'ReadCommitted');const before=structuredClone({orders:state.orders,events:state.events});try{return await work(db)}catch(error){state.orders=before.orders;state.events=before.events;throw error}}};
  const principal=(patch={})=>createWholesalePortalPrincipal({...scope,...patch},{authorize:async(tx,ctx,options)=>{assert.equal(tx,db);state.auth.push({ctx,options,callCount:state.calls.length});return state.active},authorizeProducts:async(tx,ctx,body,options)=>{assert.equal(tx,db);state.publication.push({ctx,body,options});return state.published}});
  return {db,state,principal};
}

test('portal principal is immutable, unforgeable by copying, and never passes the unchanged manager guard',()=>{
  const {principal}=fixture(),ctx=principal();assert.ok(Object.isFrozen(ctx));assert.ok(isWholesalePortalPrincipal(ctx));assert.equal(ctx.actorId,'b2b:account-a');assert.equal(ctx.role,undefined);assert.equal(ctx.channel,'B2B_SITE');
  assert.doesNotThrow(()=>assertWholesalePrincipal(ctx));assert.throws(()=>assertWholesaleManager(ctx),error=>error.status===403);
  for(const forged of [{...ctx},JSON.parse(JSON.stringify(ctx)),{...ctx,role:'OWNER'},Object.create(ctx)]){assert.equal(isWholesalePortalPrincipal(forged),false);assert.throws(()=>assertWholesalePrincipal(forged),error=>error.status===403)}
  assert.throws(()=>createWholesalePortalPrincipal(scope,{}),error=>error.status===403);assert.throws(()=>createWholesalePortalPrincipal({...scope,accountId:''},{authorize:async()=>true,authorizeProducts:async()=>true}));
  assert.throws(()=>{ctx.customerId='foreign-customer'},TypeError);assert.doesNotThrow(()=>assertWholesaleManager(manager));
});

test('portal authorization rechecks delegates in the same transaction with locks and rejects foreign bindings before delegates',async()=>{
  const {db,state,principal}=fixture(),ctx=principal();await authorizeWholesalePrincipal(db,ctx,input,{lock:true});await authorizeWholesaleQuoteProducts(db,ctx,input,{lock:true});
  assert.equal(state.auth[0].options.lock,true);assert.equal(state.publication[0].options.lock,true);
  for(const body of [{...input,customerId:'foreign-customer'},{...input,storeId:'foreign-store'}])await assert.rejects(authorizeWholesalePrincipal(db,ctx,body,{lock:true}),error=>error.code==='WHOLESALE_PORTAL_SCOPE_DENIED');
  assert.equal(state.auth.length,1);state.active=false;await assert.rejects(authorizeWholesalePrincipal(db,ctx,input,{lock:true}),error=>error.code==='WHOLESALE_PORTAL_ACCESS_DENIED');assert.equal(state.auth.length,2);
  const incomplete=createWholesalePortalPrincipal(scope,{authorize:async()=>{},authorizeProducts:async()=>{}});await assert.rejects(authorizeWholesalePrincipal(db,incomplete,input),error=>error.status===403);await assert.rejects(authorizeWholesaleQuoteProducts(db,incomplete,input),error=>error.status===403);
});

test('portal fresh quotes require publication; backoffice quote hashes retain their exact previous shape',async()=>{
  const {db,state,principal}=fixture(),ctx=principal(),quote=await buildWholesaleQuote(db,ctx,input,{lock:true});assert.equal(quote.totals.gross,'8.06');assert.equal(state.publication.length,1);assert.equal(state.auth.length,1);
  state.published=false;await assert.rejects(buildWholesaleQuote(db,ctx,input),error=>error.code==='WHOLESALE_PORTAL_PRODUCTS_DENIED');
  const backoffice=await buildWholesaleQuote(db,manager,input),{quoteId,...snapshot}=backoffice;
  const oldHash=crypto.createHash('sha256').update(JSON.stringify({companyId:manager.companyId,actorId:manager.actorId,role:manager.role,channel:manager.channel,quote:snapshot})).digest('hex');assert.equal(quoteId,oldHash);assert.equal(state.publication.length,2);
});

test('portal accepted replay survives withdrawal and re-login, but revalidates current access before disclosing the snapshot',async()=>{
  const {db,state,principal}=fixture(),ctx=principal(),quote=await buildWholesaleQuote(db,ctx,input),body={...input,clientOrderId:crypto.randomUUID(),quoteId:quote.quoteId,notes:'Customer request'};
  const first=await createWholesaleOrder(db,ctx,body);assert.equal(first.order.channel,'B2B_SITE');assert.equal(first.order.actorId,'b2b:account-a');assert.equal(first.order.notes,'Customer request');assert.equal(state.orders.length,1);assert.equal(state.events.length,1);
  const productsBefore=state.publication.length;state.published=false;state.price='99.0000';const start=state.calls.length;
  const relogged=principal({sessionId:'new-valid-session'}),replay=await createWholesaleOrder(db,relogged,body);assert.equal(replay.replayed,true);assert.deepEqual(replay.order,first.order);assert.equal(state.publication.length,productsBefore);
  assert.ok(!state.calls.slice(start).some(call=>call.sql.includes('JOIN LATERAL')));const auth=state.auth.at(-1);assert.equal(auth.ctx.sessionId,'new-valid-session');assert.equal(auth.options.lock,true);
  const replayLookup=state.calls.findIndex((call,index)=>index>=start&&call.sql.includes('FROM "WholesaleOrderRequest"'));assert.ok(auth.callCount<=replayLookup);
  state.active=false;const beforeDenied=state.calls.length;await assert.rejects(createWholesaleOrder(db,relogged,body),error=>error.code==='WHOLESALE_PORTAL_ACCESS_DENIED');assert.ok(!state.calls.slice(beforeDenied).some(call=>call.sql.includes('FROM "WholesaleOrderRequest"')));
  assert.equal(state.orders.length,1);assert.equal(state.events.length,1);
});

test('plain portal-shaped identities and foreign bindings cannot enter shared quote or order services',async()=>{
  const {db,state,principal}=fixture(),ctx=principal(),quote=await buildWholesaleQuote(db,ctx,input),body={...input,quoteId:quote.quoteId,clientOrderId:crypto.randomUUID()};
  for(const forged of [{...ctx},{...ctx,role:'OWNER'},{...manager,channel:'B2B_SITE'},{...manager,tokenType:'B2B_CUSTOMER'}]){
    await assert.rejects(buildWholesaleQuote(db,forged,input),error=>error.status===403);await assert.rejects(createWholesaleOrder(db,forged,body),error=>error.status===403);
  }
  await assert.rejects(createWholesaleOrder(db,ctx,{...body,customerId:'foreign-customer'}),error=>error.code==='WHOLESALE_PORTAL_SCOPE_DENIED');assert.equal(state.orders.length,0);assert.equal(state.events.length,0);
});

test('shared schema bootstrap caches per injected database and retries after failed initialization',async()=>{
  const first=[],second=[],db={$executeRawUnsafe:async sql=>{first.push(sql)}},other={$executeRawUnsafe:async sql=>{second.push(sql)}},ensure=bootstrapFor(db);
  await Promise.all([ensure(),ensure(db)]);const count=first.length;await ensure(db);assert.equal(first.length,count);await ensure(other);assert.equal(second.length,count);
  assert.ok(first.some(sql=>sql.includes('WholesaleOrderRequest_channel_v2_check')&&sql.includes('NOT VALID')));assert.ok(first.at(-1).includes('DROP CONSTRAINT IF EXISTS "WholesaleOrderRequest_channel_check"'));
  let attempts=0;const failing={$executeRawUnsafe:async()=>{attempts++;throw Error('DDL unavailable')}};await assert.rejects(ensure(failing),/DDL unavailable/);await assert.rejects(ensure(failing),/DDL unavailable/);assert.equal(attempts,2);
});

function isolated(){try{const url=new URL(process.env.DATABASE_URL);return process.env.NODE_ENV==='test'&&['localhost','127.0.0.1','postgres'].includes(url.hostname)&&url.pathname==='/myworkstation_test'}catch{return false}}

test('native shared bootstrap upgrades a populated legacy channel constraint atomically and idempotently',{skip:!isolated()},async()=>{
  const {PrismaClient}=await import('@prisma/client'),admin=new PrismaClient(),schema='wholesale_channel_'+crypto.randomBytes(8).toString('hex'),url=new URL(process.env.DATABASE_URL);url.searchParams.set('schema',schema);
  const db=new PrismaClient({datasources:{db:{url:url.toString()}}}),fresh=new PrismaClient({datasources:{db:{url:url.toString()}}}),unexpected=new PrismaClient({datasources:{db:{url:url.toString()}}});
  const ensure=bootstrapFor(db);
  try{
    await admin.$executeRawUnsafe(`CREATE SCHEMA "${schema}"`);
    await db.$executeRawUnsafe('CREATE TABLE "Company" ("id" TEXT PRIMARY KEY)');await db.$executeRawUnsafe('CREATE TABLE "Store" ("id" TEXT PRIMARY KEY)');await db.$executeRawUnsafe('CREATE TABLE "Product" ("id" TEXT PRIMARY KEY)');await ensure(db);
    await db.$executeRawUnsafe('ALTER TABLE "WholesaleOrderRequest" DROP CONSTRAINT "WholesaleOrderRequest_channel_v2_check", ADD CONSTRAINT "WholesaleOrderRequest_channel_check" CHECK ("channel"=\'BACKOFFICE\')');
    await db.$executeRawUnsafe('INSERT INTO "Company" VALUES (\'company\')');await db.$executeRawUnsafe('INSERT INTO "Store" VALUES (\'store\')');await db.$executeRawUnsafe('INSERT INTO "WholesaleCustomer" ("id","companyId","name") VALUES (\'customer\',\'company\',\'Customer\')');
    const insert=async(id,channel)=>db.$executeRaw`INSERT INTO "WholesaleOrderRequest" ("id","companyId","storeId","customerId","actorId","channel","clientOrderId","requestHash","quoteId","snapshot","netTotal","vatTotal","grossTotal") VALUES (${id},'company','store','customer','actor',${channel},${id},'hash','quote','{}'::jsonb,1,0,1)`;
    await insert('legacy','BACKOFFICE');await ensure(fresh);await ensure(fresh);await insert('portal','B2B_SITE');
    await assert.rejects(insert('forbidden','FIELD_SALES'));const rows=await db.$queryRaw`SELECT "id","channel" FROM "WholesaleOrderRequest" ORDER BY "id"`;assert.deepEqual(rows,[{id:'legacy',channel:'BACKOFFICE'},{id:'portal',channel:'B2B_SITE'}]);
    await db.$executeRawUnsafe('ALTER TABLE "WholesaleOrderRequest" ADD CONSTRAINT "WholesaleOrderRequest_channel_check" CHECK ("channel" IN (\'BACKOFFICE\',\'B2B_SITE\'))');
    await assert.rejects(ensure(unexpected),/Unexpected legacy wholesale channel constraint/);
    const constraints=await db.$queryRaw`SELECT "conname" FROM "pg_constraint" WHERE "conrelid"='"WholesaleOrderRequest"'::regclass AND "conname" IN ('WholesaleOrderRequest_channel_check','WholesaleOrderRequest_channel_v2_check')`;assert.equal(constraints.length,2,'unexpected-definition failure must leave both constraints intact');
  }finally{await db.$disconnect();await fresh.$disconnect();await unexpected.$disconnect();await admin.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);await admin.$disconnect()}
});
