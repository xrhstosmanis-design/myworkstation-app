import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {z} from 'zod';
import {businessPictureCalendarRange} from '../src/business-picture-dates.js';
import {finishBusinessPictureRow} from '../src/business-picture-totals.js';

test('production expense SQL allocates payment dates, cents and tenant boundaries without writes',{skip:!process.env.DATABASE_URL,timeout:45000},async()=>{
 const url=new URL(process.env.DATABASE_URL);
 assert.ok(['localhost','127.0.0.1','[::1]'].includes(url.hostname));assert.match(url.pathname,/_test$/);assert.equal(process.env.NODE_ENV,'test');
 const {PrismaClient}=await import('@prisma/client');const db=new PrismaClient();
 try{await db.$transaction(async tx=>{
  await tx.$executeRawUnsafe('CREATE TEMP TABLE "PurchaseDocument" ("id" TEXT PRIMARY KEY,"companyId" TEXT,"storeId" TEXT,"status" TEXT,"totalNet" NUMERIC,"totalVat" NUMERIC,"totalGross" NUMERIC) ON COMMIT DROP');
  await tx.$executeRawUnsafe('CREATE TEMP TABLE "StoreTransaction" ("id" TEXT PRIMARY KEY,"companyId" TEXT,"storeId" TEXT,"type" TEXT,"amount" NUMERIC,"occurredAt" TIMESTAMPTZ,"attachmentMimeType" TEXT,"attachmentFilename" TEXT,"reversedAt" TIMESTAMPTZ) ON COMMIT DROP');
  const doc=async(id,net=100,vat=24,gross=124,company='a',store='a1',status='APPROVED')=>tx.$executeRaw`INSERT INTO "PurchaseDocument" VALUES (${id},${company},${store},${status},${net},${vat},${gross})`;
  const pay=async(id,document,amount,date='2032-05-01T12:00Z',company='a',store='a1',reversed=false)=>tx.$executeRaw`INSERT INTO "StoreTransaction" VALUES (${id},${company},${store},'OTHER_EXPENSE',${amount},${new Date(date)},'application/vnd.myworkstation.purchase-document',${document},${reversed?new Date(date):null})`;
  const source=await readFile(new URL('../src/routes/owner-payments.js',import.meta.url),'utf8');const handlers=new Map();
  const router=Object.fromEntries(['get','post','patch','put','delete','use'].map(method=>[method,(path,...args)=>{if(method==='get')handlers.set(path,args.at(-1));}]));
  const prisma={store:{findFirst:async({where})=>where.companyId==='a'&&where.id==='a1'?{id:'a1'}:null,findMany:async()=>[{id:'a1',name:'Isolated test'}]},$queryRaw:(parts,...values)=>parts.join('').includes('WITH "expenseLinks"')?tx.$queryRaw(parts,...values):Promise.resolve([])};
  new Function('Router','z','prisma','businessPictureCalendarRange','finishBusinessPictureRow',source.replace(/^import .*;\s*$/gm,'').replace(/export default router;?/,''))(()=>router,z,prisma,businessPictureCalendarRange,finishBusinessPictureRow);
  const report=async(from,to=from,role='OWNER',storeId='a1')=>{
   let result;await handlers.get('/business-picture')({user:{companyId:'a',role},query:{storeId,calendarFrom:from,calendarTo:to}},{set(){},json(r){result=r;}},e=>{throw e;});return result;
  };
  await doc('split');await pay('split-a','split',62);await pay('split-b','split',62,'2032-06-01T12:00Z');
  let r=await report('2032-05-01');assert.equal(r.totals.expenseVat,12);assert.equal(r.totals.expenses,50);assert.equal(r.totals.expenseGross,62);
  r=await report('2032-06-01');assert.equal(r.totals.expenseVat,12);assert.equal(r.totals.expenses,50);
  r=await report('2032-05-01','2032-06-01');assert.equal(r.totals.expenseVat,24);assert.equal(r.totals.expenses,100);assert.equal(r.monthly.length,2);
  await doc('cents',1,.01,1.01);await pay('cents-a','cents',.5,'2032-07-01T12:00Z');await pay('cents-b','cents',.5,'2032-07-01T12:00Z');await pay('cents-c','cents',.01,'2032-08-01T12:00Z');await pay('cents-reversed','cents',.5,'2032-07-02T12:00Z','a','a1',true);
  r=await report('2032-07-01');assert.equal(r.totals.expenseVat,.01);assert.equal(r.totals.expenses,.99);assert.equal(r.totals.missingExpenseVatPayments,0);
  r=await report('2032-08-01');assert.equal(r.totals.expenseVat,0);assert.equal(r.totals.expenses,.01);
  r=await report('2032-07-02');assert.equal(r.totals.expensePayments,0);
  await doc('credit',-100,-24,-124);await pay('credit-a','credit',-62,'2032-09-01T12:00Z');r=await report('2032-09-01');assert.equal(r.totals.expenseVat,-12);assert.equal(r.totals.expenses,-50);
  await doc('zero',100,0,100);await pay('zero-a','zero',30,'2032-09-02T12:00Z');r=await report('2032-09-02');assert.equal(r.totals.expenseVat,0);assert.equal(r.totals.expenses,30);
  await doc('subcent',99.9999,24,123.9999);await pay('subcent-a','subcent',124,'2032-09-03T12:00Z');r=await report('2032-09-03');assert.equal(r.totals.expenseVat,24);assert.equal(r.totals.expenses,100);
  const invalid=[['over',100,24,124,'a','a1','APPROVED'],['mixed',100,24,124,'a','a1','APPROVED'],['foreign',100,24,124,'b','a1','APPROVED'],['sibling',100,24,124,'a','a2','APPROVED'],['draft',100,24,124,'a','a1','DRAFT'],['bad',90,24,124,'a','a1','APPROVED']];
  for(let i=0;i<invalid.length;i++){const row=invalid[i],date=`2032-10-${String(i+1).padStart(2,'0')}`;await doc(...row);await pay(`${row[0]}-a`,row[0],row[0]==='over'?124:62,date+'T12:00Z');if(row[0]==='over')await pay('over-b','over',124,'2032-11-01T12:00Z');if(row[0]==='mixed')await pay('mixed-b','mixed',-1,'2032-11-02T12:00Z');r=await report(date);assert.equal(r.totals.expenseVat,null,row[0]);assert.equal(r.totals.expenses,null,row[0]);assert.equal(r.totals.missingExpenseVatPayments,1);assert.equal(r.totals.expenseGross,row[0]==='over'?124:62);}
  // A different tenant/store payment referencing the same id cannot invalidate our allocation.
  await pay('foreign-reference','split',124,'2032-05-01T12:00Z','b','b1');await pay('sibling-reference','split',124,'2032-05-01T12:00Z','a','a2');r=await report('2032-05-01');assert.equal(r.totals.expenseVat,12);
  await assert.rejects(report('2032-05-01','2032-05-01','EMPLOYEE'),/διαθέσιμη/);await assert.rejects(report('2032-05-01','2032-05-01','OWNER','a2'),/κατάστημα/);
  const digest=async()=>tx.$queryRawUnsafe('SELECT md5(string_agg(row_to_json(t)::text,\',\' ORDER BY "id")) AS digest FROM "StoreTransaction" t');const before=await digest();await report('2032-05-01','2032-12-31');assert.deepEqual(await digest(),before);
 },{timeout:40000});}finally{await db.$disconnect();}
});
