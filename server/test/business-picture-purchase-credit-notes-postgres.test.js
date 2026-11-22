import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {z} from 'zod';
import {greeceRangeDate,greeceMonthStart} from '../../shared/greece-time.mjs';
import {businessPictureCalendarRange} from '../src/business-picture-dates.js';
import {finishBusinessPictureRow} from '../src/business-picture-totals.js';
import {applyBusinessPictureCostEstimates,collectBusinessPictureMissingCosts} from '../src/business-picture-cost-estimates.js';
import {businessPictureCsv} from '../../client/src/components/cloud/business-picture-values.js';
import {businessPicturePrintHtml} from '../../client/src/components/cloud/business-picture-print.js';

test('production purchase credit notes keep supplier signs, report scopes and CSV/print totals without writes',{skip:!process.env.DATABASE_URL,timeout:45000},async()=>{
 const url=new URL(process.env.DATABASE_URL);
 assert.ok(['localhost','127.0.0.1','[::1]'].includes(url.hostname));assert.match(url.pathname,/_test$/);assert.equal(process.env.NODE_ENV,'test');
 const {PrismaClient}=await import('@prisma/client'),db=new PrismaClient();
 try{await db.$transaction(async tx=>{
  await tx.$executeRawUnsafe('CREATE TEMP TABLE "Store" ("id" TEXT PRIMARY KEY,"companyId" TEXT,"name" TEXT,"active" BOOLEAN NOT NULL DEFAULT true) ON COMMIT DROP');
  await tx.$executeRawUnsafe('CREATE TEMP TABLE "PurchaseDocument" ("id" TEXT PRIMARY KEY,"companyId" TEXT,"storeId" TEXT,"documentType" TEXT NOT NULL DEFAULT \'INVOICE\',"status" TEXT,"documentDate" TIMESTAMP(3),"totalNet" NUMERIC,"totalVat" NUMERIC,"totalGross" NUMERIC) ON COMMIT DROP');
  await tx.$executeRawUnsafe(`INSERT INTO "Store" ("id","companyId","name") VALUES ('a1','a','synthetic target'),('a2','a','synthetic sibling'),('b1','b','synthetic foreign')`);
  const doc=async(id,date,net,vat,gross,type='INVOICE',status='APPROVED',company='a',store='a1')=>tx.$executeRaw`INSERT INTO "PurchaseDocument" ("id","companyId","storeId","documentType","status","documentDate","totalNet","totalVat","totalGross") VALUES (${id},${company},${store},${type},${status},${new Date(date+'T12:00:00Z')},${net},${vat},${gross})`;
  await doc('invoice','2032-01-31',100,24,124);
  await doc('credit','2032-02-01',3.78,.4914,4.2714,'CREDIT_NOTE');
  // Match the existing supplier-control CASE convention exactly; do not introduce ABS.
  await doc('negative-credit','2032-02-02',-.5,-.065,-.565,'CREDIT_NOTE');
  await doc('negative-invoice','2032-02-03',-2,-.26,-2.26);
  for(const [id,status,company,store] of [['draft','DRAFT','a','a1'],['cancelled','CANCELLED','a','a1'],['foreign','APPROVED','b','a1'],['sibling','APPROVED','a','a2'],['foreign-store','APPROVED','a','b1']])await doc(id,'2032-02-01',100,24,124,'CREDIT_NOTE',status,company,store);
  await doc('outside','2032-02-04',100,24,124,'CREDIT_NOTE');
  const source=await readFile(new URL('../src/routes/owner-payments.js',import.meta.url),'utf8'),handlers=new Map();
  const router=Object.fromEntries(['get','post','patch','put','delete','use'].map(method=>[method,(path,...args)=>{if(method==='get')handlers.set(path,args.at(-1));}]));
  let executedPurchases=0;
  const prisma={store:{
   findFirst:async({where})=>(await tx.$queryRaw`SELECT "id","name" FROM "Store" WHERE "id"=${where.id} AND "companyId"=${where.companyId} AND "active"=true`)[0]||null,
   findMany:async({where})=>tx.$queryRaw`SELECT "id","name" FROM "Store" WHERE "companyId"=${where.companyId} AND "active"=true ORDER BY "name"`
  },$queryRaw:(parts,...values)=>{
   const sql=parts.join('');
   if(sql.includes('AS "purchaseGross"')){executedPurchases++;return tx.$queryRaw(parts,...values);}
   // Only the purchase query is under test. No sales, stock or expense fixture is reenacted.
   assert.ok(sql.includes('WITH "postedCostGroups"')||sql.includes('WITH "expenseLinks"'),'unexpected production report query');return Promise.resolve([]);
  }};
  new Function('Router','z','prisma','greeceRangeDate','greeceMonthStart','businessPictureCalendarRange','finishBusinessPictureRow','applyBusinessPictureCostEstimates','collectBusinessPictureMissingCosts',source.replace(/^import .*;\s*$/gm,'').replace(/export default router;?/,'').replace(/^export /gm,''))(()=>router,z,prisma,greeceRangeDate,greeceMonthStart,businessPictureCalendarRange,finishBusinessPictureRow,applyBusinessPictureCostEstimates,collectBusinessPictureMissingCosts);
  assert.equal(typeof handlers.get('/business-picture'),'function');
  const report=async(from,to=from,storeId='a1',role='OWNER')=>{
   let result;await handlers.get('/business-picture')({user:{companyId:'a',role},query:{storeId,calendarFrom:from,calendarTo:to}},{set(){},json(value){result=value;}},error=>{throw error;});return result;
  };
  const fingerprint=async()=>tx.$queryRawUnsafe(`SELECT md5(string_agg(row_to_json(d)::text,',' ORDER BY "id")) AS digest FROM "PurchaseDocument" d`);
  const before=await fingerprint(),combined=await report('2032-01-31','2032-02-01');
  assert.equal(combined.totals.purchaseGross,119.7286,'124 invoice less positive 4.2714 credit; baseline incorrectly adds the credit');
  assert.equal(combined.totals.purchaseNet,96.22);assert.equal(combined.totals.purchaseVat,23.5086);assert.equal(combined.totals.documents,2);
  assert.deepEqual(combined.monthly.map(row=>[row.month,row.purchaseNet,row.purchaseVat,row.purchaseGross,row.documents]),[['2032-02',-3.78,-.4914,-4.2714,1],['2032-01',100,24,124,1]]);
  assert.deepEqual(combined.daily.map(row=>[row.day,row.purchaseGross,row.documents]),[['2032-02-01',-4.2714,1],['2032-01-31',124,1]]);
  const credit=await report('2032-02-01');assert.equal(credit.totals.purchaseGross,-4.2714);assert.equal(credit.totals.documents,1,'draft, cancelled, foreign and sibling credits are excluded');
  const ordinary=await report('2032-01-31');assert.equal(ordinary.totals.purchaseGross,124);assert.equal(ordinary.totals.purchaseNet,100);assert.equal(ordinary.totals.purchaseVat,24);
  assert.equal((await report('2032-02-02')).totals.purchaseGross,.565,'negative CREDIT_NOTE follows existing supplier CASE, not ABS');
  assert.equal((await report('2032-02-03')).totals.purchaseGross,-2.26,'signed non-credit document remains unchanged');
  const empty=await report('2032-03-01');assert.equal(empty.totals.purchaseGross,0);assert.equal(empty.totals.documents,0);
  for(const row of [combined.totals,...combined.monthly,...combined.daily]){assert.equal(row.salesGross,0);assert.equal(row.costValue,0);assert.equal(row.expenseGross,0);assert.equal(row.paymentTotal,0);}
  const columns=[['purchaseNet','Net',value=>Number(value).toFixed(4)],['purchaseVat','VAT',value=>Number(value).toFixed(4)],['purchaseGross','Gross',value=>Number(value).toFixed(4)]];
  const csv=businessPictureCsv(combined,columns,'ALL'),lines=csv.replace(/^\ufeff/,'').split('\n').slice(1).map(line=>line.match(/"(?:[^"]|"")*"/g).map(cell=>cell.slice(1,-1).replaceAll('""','"')));
  assert.deepEqual(lines.map(row=>row.slice(0,4)),[['2032-02','-3.78','-0.4914','-4.2714'],['2032-01','100','24','124']]);
  assert.equal(Number(lines.reduce((sum,row)=>sum+Number(row[3]),0).toFixed(4)),combined.totals.purchaseGross);
  const html=businessPicturePrintHtml({data:combined,storeName:'synthetic target',columns,rows:[...combined.monthly.map(row=>({...row,label:row.month})),{...combined.totals,label:'TOTAL'}]});
  for(const expected of ['<td>-3.7800</td>','<td>-0.4914</td>','<td>-4.2714</td>','<td>96.2200</td>','<td>23.5086</td>','<td>119.7286</td>'])assert.ok(html.includes(expected),expected);
  assert.ok(html.includes('2032-01-31 έως 2032-02-01'));
  await assert.rejects(report('2032-02-01','2032-02-01','b1'),/κατάστημα/);await assert.rejects(report('2032-02-01','2032-02-01','a1','EMPLOYEE'),/διαθέσιμη/);
  assert.ok(executedPurchases>=6);assert.deepEqual(await fingerprint(),before,'registered report and exports do not alter original documents');
 },{timeout:40000});}finally{await db.$disconnect();}
});
