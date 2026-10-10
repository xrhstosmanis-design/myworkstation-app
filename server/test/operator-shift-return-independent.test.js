import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import crypto from 'node:crypto';
const auth=fs.readFileSync(new URL('../src/middleware/auth.js',import.meta.url),'utf8');
const extract=(name,end)=>vm.runInNewContext(`(${auth.slice(auth.indexOf(`function ${name}(`),auth.indexOf(`function ${end}(`)).trim()})`);
const rights=extract('storeRuntimePermissions','enforceStorePaymentPermissions'),enforce=extract('enforceStorePosPermissions','exposeStorePosRuntimeAccess');
test('shift view is independent of returns while base shift and all-only permissions remain distinct',()=>{
 const req={method:'GET',originalUrl:'/api/store-pos/stores/A/sales/recent?view=SHIFT',query:{view:'SHIFT'}};
 let code;const res={status(v){code=v;return this},json(){return this}};
 const shift=rights({permissions:{shiftTransactionsPos:true,returnItems:false}});
 assert.equal(enforce(req,res,shift),true);
 assert.equal(enforce(req,res,rights({permissions:{allShiftTransactionsPos:true,returnItems:true}})),false);assert.equal(code,403);
 req.query={};assert.equal(enforce(req,res,shift),false);assert.equal(enforce(req,res,['RETURN_ITEMS']),true);
 req.method='POST';req.originalUrl='/api/store-pos/stores/A/sales/sale/return-items';assert.equal(enforce(req,res,shift),false);
 req.originalUrl='/api/store-pos/stores/A/exchange';assert.equal(enforce(req,res,shift),false);
});
const routeSource=fs.readFileSync(new URL('../src/routes/store-pos-sale-display.js',import.meta.url),'utf8');
const start=routeSource.indexOf('router.get("/stores/:storeId/sales/recent",');
const handlerSource=routeSource.slice(start,routeSource.indexOf('\nrouter.get("/sales/journal"',start));
let handler;const queries=[];
vm.runInNewContext(handlerSource,{router:{get(_path,fn){handler=fn}},ownedStore:async(req,id)=>{if(id!==req.user.storeId)throw Object.assign(new Error('foreign store'),{status:403});return{id}},prisma:{$queryRaw:async(strings,...values)=>{queries.push({strings,values});return[]}},normalizeSale:x=>x});
test('actual sale handler fails closed on revoked shift permission and binds immutable actor and terminal',async()=>{
 let status,body,error;const res={status(v){status=v;return this},json(v){body=v}};
 const req={params:{storeId:'A'},query:{view:'SHIFT'},user:{tokenType:'STORE_OPERATOR',storeId:'A',companyId:'C',id:'credential',employeeId:'employee',terminalPos:'MAIN',permissions:[]}};
 await handler(req,res,e=>error=e);assert.equal(status,403);assert.equal(queries.length,0);
 req.user.permissions=['SHIFT_TRANSACTIONS'];await handler(req,res,e=>error=e);assert.equal(error,undefined);assert.equal(body.rows.length,0);
 const q=queries.at(-1);assert.ok(q.values.includes('employee'));assert.ok(q.values.includes('MAIN'));assert.ok(q.values.includes('C'));assert.ok(q.values.includes('A'));
 req.params.storeId='B';await handler(req,res,e=>error=e);assert.equal(error.status,403);
});
const isolated=()=>{try{const u=new URL(process.env.DATABASE_URL);return process.env.NODE_ENV==='test'&&['localhost','127.0.0.1','postgres'].includes(u.hostname)&&/test/i.test(u.pathname)}catch{return false}};
test('native shift sale predicate rejects another actor, closed shift, foreign terminal/company/store', {skip:!isolated()},async()=>{
 const {PrismaClient}=await import('@prisma/client'),admin=new PrismaClient(),schema=`shift_view_${crypto.randomUUID().replaceAll('-','')}`;
 const url=new URL(process.env.DATABASE_URL);url.searchParams.set('schema',schema);const db=new PrismaClient({datasourceUrl:url.toString()});
 try{
  await admin.$executeRawUnsafe(`CREATE SCHEMA "${schema}"`);
  await db.$executeRawUnsafe('CREATE TABLE "Sale"("id" text,"companyId" text,"storeId" text,"operatorEmployeeId" text,"source" text,"status" text)');
  await db.$executeRawUnsafe('CREATE TABLE "StoreTransaction"("companyId" text,"storeId" text,"sessionId" text,"description" text)');
  await db.$executeRawUnsafe('CREATE TABLE "CashShiftSession"("id" text,"companyId" text,"storeId" text,"terminalPos" text,"status" text)');
  await db.$executeRawUnsafe(`INSERT INTO "CashShiftSession" VALUES ('main','C','A','MAIN','OPEN'),('control','C','A','CONTROL','OPEN'),('closed','C','A','MAIN','CLOSED')`);
  const fixtures=[['own','C','A','employee','main'],['other','C','A','otherEmployee','main'],['control','C','A','employee','control'],['closed','C','A','employee','closed'],['foreignCompany','D','A','employee','main'],['foreignStore','C','B','employee','main']];
  for(const [id,company,store,employee,session] of fixtures){await db.$executeRaw`INSERT INTO "Sale" VALUES (${id},${company},${store},${employee},'POS','COMPLETED')`;await db.$executeRaw`INSERT INTO "StoreTransaction" VALUES (${company},${store},${session},${`Sale ${id}`})`;}
  // Execute the exact actual-handler WHERE template, retaining every bound scope parameter.
  const q=queries[0],allSql=q.strings.reduce((s,part,i)=>s+part+(i<q.values.length?`$${i+1}`:''),'');
  const predicate=allSql.slice(allSql.indexOf('WHERE s."companyId"',allSql.indexOf('FROM "Sale" s')),allSql.indexOf('ORDER BY s."createdAt"'));
  const used=[...new Set([...predicate.matchAll(/\$(\d+)/g)].map(m=>Number(m[1])))];
  let sql='SELECT s."id" FROM "Sale" s '+predicate;sql=sql.replace(/\$(\d+)/g,(_,n)=>`$${used.indexOf(Number(n))+1}`);
  const vals=used.map(n=>q.values[n-1]);
  assert.deepEqual((await db.$queryRawUnsafe(sql,...vals)).map(r=>r.id),['own']);
  const allValues=[...vals];const ownIndex=q.values.findIndex(v=>v===false); // own-only is the first false binding
  allValues[used.indexOf(ownIndex+1)]=true;
  assert.deepEqual((await db.$queryRawUnsafe(sql,...allValues)).map(r=>r.id).sort(),['other','own']);
 }finally{await db.$disconnect();await admin.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);await admin.$disconnect()}
});

test('actual mounted timeline switches own/all by immutable IDs even with identical actor names',async()=>{
 const {build}=await import('esbuild'),{JSDOM}=await import('jsdom'),{createRequire}=await import('node:module'),{fileURLToPath}=await import('node:url');
 const dom=new JSDOM('<div id="root"></div>',{url:'https://isolated.invalid'}),keys=['window','document','navigator','HTMLElement','Event','IS_REACT_ACT_ENVIRONMENT'];
 const old=new Map(keys.map(k=>[k,Object.getOwnPropertyDescriptor(globalThis,k)]));
 for(const k of keys)Object.defineProperty(globalThis,k,{configurable:true,writable:true,value:k==='IS_REACT_ACT_ENVIRONMENT'?true:dom.window[k]});
 const React=await import('react'),{createRoot}=await import('react-dom/client'),{act}=React;
 const compiled=await build({entryPoints:[fileURLToPath(new URL('../../client/src/components/store/StoreShiftTransactionsModal.jsx',import.meta.url))],bundle:true,write:false,format:'cjs',platform:'node',external:['react','react-dom','react/jsx-runtime'],loader:{'.css':'empty'},plugins:[{name:'payments-panel',setup(b){b.onResolve({filter:/MyShiftEntriesPanel/},()=>({path:'panel',namespace:'stub'}));b.onLoad({filter:/.*/,namespace:'stub'},()=>({contents:'export default ()=>null'}));}}]});
 const m={exports:{}};new Function('require','module','exports',compiled.outputFiles[0].text)(createRequire(import.meta.url),m,m.exports);
 const paths=[],props={store:{id:'A',name:'A'},operator:{id:'credential',employeeId:'employee',fullName:'SAME'},onClose(){},api:async path=>{paths.push(path);return path.includes('sales/recent')?{rows:[{id:'mine',sessionId:'main',actorName:'SAME',operatorEmployeeId:'employee',total:1,lines:[{description:'OWN SALE'}]},{id:'other',sessionId:'main',actorName:'SAME',operatorEmployeeId:'other',total:2,lines:[{description:'OTHER SALE'}]}]}:{openSession:{id:'main'},recent:[{id:'own-ledger',sessionId:'main',actorId:'credential',actorName:'SAME',type:'TRANSFER_OUT',amount:1,description:'OWN LEDGER'},{id:'other-ledger',sessionId:'main',actorId:'other',actorName:'SAME',type:'TRANSFER_AMOUNT',amount:1,description:'OTHER LEDGER'}]}}};
 const root=createRoot(document.getElementById('root'));
 const render=async allowAll=>act(async()=>{root.render(React.createElement(m.exports.default,{...props,allowAll}));await new Promise(r=>setTimeout(r,15))});
 try{
  await render(true);assert.match(document.body.textContent,/OTHER SALE/);assert.match(document.body.textContent,/OTHER LEDGER/);
  await render(false);assert.match(document.body.textContent,/OWN SALE/);assert.match(document.body.textContent,/OWN LEDGER/);assert.doesNotMatch(document.body.textContent,/OTHER SALE|OTHER LEDGER/);
  await render(true);assert.match(document.body.textContent,/OTHER SALE/);assert.match(document.body.textContent,/OTHER LEDGER/);
  assert.ok(paths.some(p=>p.endsWith('/sales/recent?view=SHIFT')));assert.equal(paths.length,6);
 }finally{await act(async()=>root.unmount());dom.window.close();for(const k of keys){const d=old.get(k);if(d)Object.defineProperty(globalThis,k,d);else delete globalThis[k]}}
});
