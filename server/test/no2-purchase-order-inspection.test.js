import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import {once} from 'node:events';
import router,{readPurchaseOrderInspection,purchaseOrderInspectionAdmission,createPurchaseOrderInspectionHandler} from '../src/routes/purchase-orders.js';
import {prisma} from '../src/prisma.js';
import {readFileSync} from 'node:fs';

const actor={id:'u',companyId:'c',role:'SUPER_ADMIN',tokenType:'BACKOFFICE_USER'};
const order={id:'o',companyId:'c',storeId:'s',supplierId:'sup',supplierName:'Saved supplier',storeName:'Store',status:'NEW',sourceType:'POS_OCR_DRAFT',invoiceNumber:'A 12'};
const line={id:'l',orderId:'o',description:'SAVED LINE',quantity:'2',unitCost:'5',netAmount:'10',vatAmount:'2.4',grossAmount:'12.4',vatRate:'24'};
function fixture(){
 const calls=[];
 const tx={user:{findUnique:async()=>({id:'u',role:'SUPER_ADMIN',companyId:'c'})},store:{findFirst:async({where})=>where.id==='s'&&where.companyId==='c'?{id:'s',companyId:'c',name:'Store'}:null},
  $executeRawUnsafe:async sql=>{calls.push(sql);assert.ok(sql.startsWith('SET '),'no writes');},
  $queryRaw:async(strings,...values)=>{const sql=strings.join('?');calls.push({sql,values});if(sql.includes('information_schema.columns'))return [];if(sql.includes('FROM "PurchaseOrder" o'))return values[0]==='o'&&values[1]==='c'&&values[2]==='s'?[{...order}]:[];if(sql.includes('FROM "PurchaseOrderLine" l'))return [{...line}];throw Error('Unexpected SQL '+sql)}
 };
 const db={$transaction:async(fn,options)=>{calls.push({transaction:options});return fn(tx)}};return {db,calls};
}

test('inspection reads the saved draft/lines inside a read-only scoped snapshot without repair',async()=>{
 const f=fixture(),before=JSON.stringify({order,line}),data=await readPurchaseOrderInspection(f.db,actor,'s','o');
 assert.equal(data.order.id,'o');assert.equal(data.lines[0].description,'SAVED LINE');assert.equal(data.lines[0].quantity,2);assert.equal(data.totals.gross,12.4);assert.equal(data.readOnly,true);assert.equal(data.navigationOnly,true);assert.equal(JSON.stringify({order,line}),before);
 assert.equal(f.calls[1],'SET TRANSACTION READ ONLY');assert.equal(f.calls[0].transaction.isolationLevel,'RepeatableRead');assert.ok(!f.calls.some(x=>typeof x==='string'&&/UPDATE|INSERT|CREATE|ALTER/.test(x)));
});

test('inspection rejects foreign order/store/company and denied personal roles',async()=>{
 for(const [user,store,id]of [[actor,'other','o'],[actor,'s','foreign'],[{...actor,companyId:'foreign'},'s','o'],[{...actor,role:'CASHIER'},'s','o'],[{...actor,storeId:'other'},'s','o']])await assert.rejects(readPurchaseOrderInspection(fixture().db,user,store,id),e=>[400,403,404].includes(e.status));
});

test('actual detail GET inspection bypasses schema bootstrap and repair, rejecting malformed mode before data access',async()=>{
 const f=fixture(),names=['$transaction','$executeRawUnsafe','$executeRaw','$queryRaw'],saved=new Map(names.map(k=>[k,prisma[k]]));let globalReads=0,globalWrites=0;
 for(const name of names)prisma[name]=name==='$transaction'?f.db.$transaction:async()=>{name==='$queryRaw'?globalReads++:globalWrites++;throw Error('Global/bootstrap/repair access forbidden')};
 const app=express();app.use((req,res,next)=>{req.user=actor;next()});app.use('/api/purchase-orders',router);app.use((error,req,res,next)=>res.status(error.status||500).json({error:error.message}));const server=app.listen(0,'127.0.0.1');await once(server,'listening');const origin='http://127.0.0.1:'+server.address().port;
 try{
  const response=await fetch(origin+'/api/purchase-orders/o/detail?inspection=true&storeId=s');assert.equal(response.status,200);assert.equal(response.headers.get('cache-control'),'no-store');const data=await response.json();assert.equal(data.readOnly,true);assert.equal(data.lines[0].description,'SAVED LINE');
  for(const query of ['inspection=false&storeId=s','inspection=true','inspection=true&storeId=s&extra=1','inspection=true&storeId=s&storeId=other']){const count=f.calls.length;const bad=await fetch(origin+'/api/purchase-orders/o/detail?'+query);assert.equal(bad.status,400,query);assert.equal(f.calls.length,count)}
  assert.equal((await fetch(origin+'/api/purchase-orders/o/detail?inspection=true&storeId=other')).status,404);assert.equal(globalReads,0);assert.equal(globalWrites,0);
 }finally{server.closeAllConnections?.();await new Promise(resolve=>server.close(resolve));for(const[name,value]of saved)prisma[name]=value}
});


test('production inspection registration precedes every legacy alias/bootstrap guard and fallthrough only serves ordinary requests',async()=>{
 const source=readFileSync(new URL('../src/index.js',import.meta.url),'utf8'),early=source.indexOf('app.get("/api/purchase-orders/:orderId/detail",auth,purchaseOrderInspectionAdmission,requireStoreModule("INVENTORY"),createPurchaseOrderInspectionHandler(prisma))');
 assert.ok(early>0);for(const marker of ['app.use("/api/purchase-orders",auth,posPurchaseOrderAccess','app.use("/api/purchase-orders",auth,requireCompanyModule'])assert.ok(early<source.indexOf(marker));
 const f=fixture(),app=express();let legacy=0,entitlement=0;
 app.get('/api/purchase-orders/:orderId/detail',(req,res,next)=>{req.user=actor;next()},purchaseOrderInspectionAdmission,(req,res,next)=>{entitlement++;next()},createPurchaseOrderInspectionHandler(f.db));
 app.use('/api/purchase-orders',(req,res)=>{legacy++;res.json({ordinary:true})});app.use((error,req,res,next)=>res.status(error.status||500).json({error:error.message}));const server=app.listen(0,'127.0.0.1');await once(server,'listening');const origin='http://127.0.0.1:'+server.address().port;
 try{
  const opened=await fetch(origin+'/api/purchase-orders/o/detail?inspection=true&storeId=s');assert.equal(opened.status,200);assert.equal((await opened.json()).order.id,'o');assert.equal(entitlement,1);assert.equal(legacy,0);
  for(const query of ['inspection=false&storeId=s','inspection=true&storeId=s&extra=1','inspection=true'])assert.equal((await fetch(origin+'/api/purchase-orders/o/detail?'+query)).status,400);
  assert.equal((await fetch(origin+'/api/purchase-orders/o/detail?inspection=true&storeId=other')).status,404);assert.equal(legacy,0);
  assert.deepEqual(await(await fetch(origin+'/api/purchase-orders/o/detail')).json(),{ordinary:true});assert.equal(legacy,1);
 }finally{server.close();await once(server,'close')}
});
