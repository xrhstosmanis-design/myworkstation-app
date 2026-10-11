import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {z} from 'zod';

const source=(await readFile(new URL('../src/routes/store-transactions.js',import.meta.url),'utf8'))
  .replace(/^import .*;\n/gm,'').replace(/^export default .*;\n/gm,'');
const owner={id:'owner',role:'OWNER',tokenType:'BACKOFFICE_USER',companyId:'company-a'};
const operator={id:'operator',role:'EMPLOYEE',tokenType:'STORE_OPERATOR',companyId:'company-a',storeId:'store-a',permissions:['STORE_LEDGER']};

// Register the real runtime route and its ledger guard; only authentication and
// unrelated legacy table bootstrap are replaced. No payment route is invoked.
function registeredRoute(db){
  const handlers=new Map();let guard;
  const Router=()=>({use(...args){guard=args.at(-1)},...Object.fromEntries(['get','post','patch','put','delete'].map(method=>[method,(path,...args)=>handlers.set(method+path,args.at(-1))]))});
  new Function('Router','prisma','crypto','z','auth','executeHotTableBootstrap',source)(Router,db,crypto,z,()=>{},async()=>{});
  const handler=handlers.get('get/stores/:storeId/payroll-employees');assert.equal(typeof handler,'function');
  return (user=owner,storeId='store-a')=>new Promise((resolve,reject)=>{
    let status=200;
    const req={method:'GET',user,params:{storeId},query:{},headers:{},originalUrl:`/api/transactions/stores/${storeId}/payroll-employees`};
    const res={status(n){status=n;return this},json(data){resolve({status,data})}};
    try{guard(req,res,()=>Promise.resolve(handler(req,res)).catch(reject))}catch(error){reject(error)}
  });
}

test('registered payroll list preserves scoped lookup, bound SQL parameters and public payload',async()=>{
  const lookups=[],reads=[];
  const items=[{id:'alice',fullName:'Alice',position:null},{id:'zoe',fullName:'Zoe',position:'Cashier'}];
  const db={store:{findFirst:async({where})=>{lookups.push(where);return {id:where.id,companyId:where.companyId,active:true}}},$queryRaw:async(strings,...values)=>{reads.push({strings,values});return items}};
  const run=registeredRoute(db);
  const unusualCompany="company-a' OR TRUE --",unusualStore="store-a' OR TRUE --";
  assert.deepEqual(await run({...owner,companyId:unusualCompany},unusualStore),{status:200,data:{items}});
  assert.deepEqual(lookups,[{id:unusualStore,companyId:unusualCompany,active:true}]);
  assert.equal(reads.length,1);assert.deepEqual(reads[0].values,[unusualCompany,unusualStore]);
  assert.ok(reads[0].strings.raw,'SQL remains a tagged parameterized query');
  assert.equal(reads[0].strings.join('').includes('OR TRUE'),false);
});

test('registered payroll list denies unauthorized or foreign/missing/inactive stores before employee read',async()=>{
  let reads=0,lookups=0;
  const db={store:{findFirst:async({where})=>{lookups++;return where.id==='store-a'&&where.companyId==='company-a'&&where.active===true?{id:'store-a',companyId:'company-a',active:true}:null}},$queryRaw:async()=>{reads++;return []}};
  const run=registeredRoute(db),originalError=console.error;console.error=()=>{};
  try{
    assert.equal((await run({...operator,permissions:[]})).status,403);
    assert.equal((await run({...owner,role:'EMPLOYEE'})).status,403);
    assert.equal((await run(operator,'store-b')).status,403);
    assert.equal(lookups,0);assert.equal(reads,0);
    for(const [user,storeId] of [[{...owner,companyId:'company-b'},'store-a'],[owner,'missing'],[owner,'inactive']])assert.equal((await run(user,storeId)).status,404);
    assert.equal(reads,0);
    assert.deepEqual(await run(operator),{status:200,data:{items:[]}});assert.equal(reads,1);
  }finally{console.error=originalError}
});

function isolated(){try{const u=new URL(process.env.DATABASE_URL);return process.env.NODE_ENV==='test'&&['localhost','127.0.0.1','postgres'].includes(u.hostname)&&/test/i.test(u.pathname)}catch{return false}}
test('native PostgreSQL registered payroll route works without Employee.companyId and isolates stores/companies',{skip:!isolated()},async()=>{
  const {PrismaClient}=await import('@prisma/client'),admin=new PrismaClient(),schema=`payroll_employees_test_${crypto.randomUUID().replaceAll('-','')}`;
  const url=new URL(process.env.DATABASE_URL);url.searchParams.set('schema',schema);const db=new PrismaClient({datasourceUrl:url.toString()});
  let listReads=0;
  try{
    await admin.$executeRawUnsafe(`CREATE SCHEMA "${schema}"`);
    await db.$executeRawUnsafe('CREATE TABLE "Store"("id" text PRIMARY KEY,"companyId" text NOT NULL,"active" boolean NOT NULL)');
    // Match the relevant actual production schema: there is no companyId here.
    await db.$executeRawUnsafe('CREATE TABLE "Employee"("id" text PRIMARY KEY,"storeId" text NOT NULL REFERENCES "Store"("id"),"fullName" text NOT NULL,"position" text,"active" boolean NOT NULL)');
    await db.$executeRaw`INSERT INTO "Store" VALUES('store-a','company-a',true),('store-a2','company-a',true),('store-b','company-b',true),('inactive','company-a',false),('empty','company-a',true)`;
    await db.$executeRaw`INSERT INTO "Employee" VALUES('zoe','store-a','Zoe','Cashier',true),('alice','store-a','Alice',null,true),('disabled','store-a','Disabled','Hidden',false),('other-own','store-a2','Other own','Other',true),('foreign','store-b','Foreign','Other',true),('inactive-store','inactive','Inactive','Other',true)`;
    const routeDb={store:{findFirst:async({where})=>(await db.$queryRaw`SELECT "id","companyId","active" FROM "Store" WHERE "id"=${where.id} AND "companyId"=${where.companyId} AND "active"=${where.active} LIMIT 1`)[0]||null},$queryRaw:(...args)=>{listReads++;return db.$queryRaw(...args)}};
    const run=registeredRoute(routeDb),expected=[{id:'alice',fullName:'Alice',position:null},{id:'zoe',fullName:'Zoe',position:'Cashier'}];
    assert.deepEqual(await run(),{status:200,data:{items:expected}});
    assert.deepEqual(await run(operator),{status:200,data:{items:expected}});
    assert.deepEqual((await run(owner,'store-a2')).data.items,[{id:'other-own',fullName:'Other own',position:'Other'}]);
    assert.deepEqual((await run({...owner,companyId:'company-b'},'store-b')).data.items,[{id:'foreign',fullName:'Foreign',position:'Other'}]);
    assert.deepEqual(await run(owner,'empty'),{status:200,data:{items:[]}});
    const before=listReads,originalError=console.error;console.error=()=>{};
    try{
      assert.equal((await run(owner,'store-b')).status,404);
      assert.equal((await run(owner,'inactive')).status,404);
      assert.equal((await run(owner,'missing')).status,404);
      assert.equal((await run(operator,'store-a2')).status,403);
      assert.equal((await run({...operator,permissions:[]})).status,403);
      assert.equal(listReads,before);
    }finally{console.error=originalError}
  }finally{await db.$disconnect();await admin.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);await admin.$disconnect()}
});
