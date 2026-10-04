import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import router,{expenseDocumentSchema,expenseDocumentId,mayManageExpenseDocuments} from '../src/routes/expense-documents.js';
import {prisma} from '../src/prisma.js';
const sample={documentNumber:'LAB-EXP-001',documentDate:'2026-10-04',issuer:'Virtual LAB',description:'Cleaning service',totalNet:100,totalVat:24,totalGross:124,idempotencyKey:'test-expense-001'};
test('manual expense validates reconciled cents, explicit zero VAT and real calendar date',()=>{
 assert.equal(expenseDocumentSchema.parse(sample).totalGross,124);
 assert.equal(expenseDocumentSchema.parse({...sample,totalVat:0,totalGross:100}).totalVat,0);
 for(const change of [{totalGross:125},{totalVat:-1},{totalNet:100.001,totalGross:124.001},{documentDate:'2026-02-30'},{totalNet:0},{totalVat:NaN},{productId:'stock'},{status:'APPROVED'}])assert.equal(expenseDocumentSchema.safeParse({...sample,...change}).success,false);
});
test('retry identity is tenant/store scoped and operator accounts cannot approve',()=>{
 assert.equal(expenseDocumentId('c','s','key'),expenseDocumentId('c','s','key'));
 assert.notEqual(expenseDocumentId('c','s','key'),expenseDocumentId('c','other','key'));
 assert.notEqual(expenseDocumentId('c','s','key'),expenseDocumentId('other','s','key'));
 for(const role of ['OWNER','ADMIN','MANAGER','SUPER_ADMIN'])assert.equal(mayManageExpenseDocuments({role}),true);
 for(const role of ['EMPLOYEE','ACCOUNTANT','STORE_OPERATOR'])assert.equal(mayManageExpenseDocuments({role}),false);
 assert.equal(mayManageExpenseDocuments({role:'OWNER',tokenType:'STORE_OPERATOR'}),false);
});
test('isolated HTTP draft/replay/conflict/approval preserves one document and audit, no stock SQL',async()=>{
 const docs=new Map(),lines=new Map(),events=[];
 const originals={$queryRaw:prisma.$queryRaw,$executeRaw:prisma.$executeRaw,$executeRawUnsafe:prisma.$executeRawUnsafe,$transaction:prisma.$transaction,findUnique:prisma.store.findUnique};
 const query=async (q,...args)=>{const sql=Array.isArray(q)?q.join("?"):q.sql,values=Array.isArray(q)?args:q.values;
  if(sql.includes('pg_advisory'))return [{locked:true}];
  if(sql.includes('LOWER(TRIM')){const [company,store,number]=values;return [...docs.values()].filter(d=>d.companyId===company&&d.storeId===store&&d.documentNumber.toLowerCase()===number.toLowerCase()).map(d=>({id:d.id}));}
  if(sql.includes('FROM "PurchaseDocumentLine"'))return lines.has(values[0])?[lines.get(values[0])]:[];
  if(sql.includes('FOR UPDATE')){const [id,company,store]=values,d=docs.get(id);return d&&d.companyId===company&&d.storeId===store&&d.sourceType==='MANUAL_EXPENSE'?[{...d}]:[];}
  if(sql.includes('d."id"=?')){const [id,company,store]=values,d=docs.get(id);return d&&d.companyId===company&&d.storeId===store?[{...d,description:lines.get(id).description}]:[];}
  if(sql.includes('ORDER BY')){const [company,store]=values;return [...docs.values()].filter(d=>d.companyId===company&&d.storeId===store).map(d=>({...d,description:lines.get(d.id).description}));}
  throw new Error('Unexpected query: '+sql);
 };
 const execute=async (q,...args)=>{const sql=Array.isArray(q)?q.join("?"):q.sql,v=Array.isArray(q)?args:q.values;
  assert.doesNotMatch(sql,/StockMovement|StoreProduct|SupplierProduct|StoreTransaction|AiReaderJob/);
  if(sql.startsWith('INSERT INTO "PurchaseDocument"')){const [id,companyId,storeId,documentNumber,documentDate,totalNet,totalVat,totalGross]=v;docs.set(id,{id,companyId,storeId,documentNumber,documentDate,totalNet,totalVat,totalGross,status:'DRAFT',sourceType:'MANUAL_EXPENSE'});}
  else if(sql.startsWith('INSERT INTO "PurchaseDocumentLine"')){const [,id,description,,netAmount,,vatAmount,grossAmount]=v;lines.set(id,{productId:null,unit:'SERVICE',description,netAmount,vatAmount,grossAmount});}
  else if(sql.startsWith('UPDATE "PurchaseDocument"'))docs.get(v[0]).status='APPROVED';
  else if(sql.startsWith('INSERT INTO "StoreOperatorAudit"'))events.push(v[4]);
  else throw new Error('Unexpected mutation: '+sql);
  return 1;
 };
 prisma.store.findUnique=async({where})=>({id:where.id,companyId:where.id==='foreign'?'other-tenant':'tenant'});
 prisma.$queryRaw=query;prisma.$executeRaw=execute;prisma.$executeRawUnsafe=async sql=>{assert.match(sql,/CREATE TABLE IF NOT EXISTS "StoreOperatorAudit"/);return 0};prisma.$transaction=async fn=>fn(prisma);
 const app=express();app.use(express.json());app.use((req,res,next)=>{req.user={id:'lab-admin',role:req.headers['x-role']||'SUPER_ADMIN',companyId:'tenant'};next()});app.use(router);app.use((e,req,res,next)=>res.status(e.name==='ZodError'?400:e.status||500).json({error:e.message}));
 const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));const base=`http://127.0.0.1:${server.address().port}`;
 const request=async(path,body,role)=>{const r=await fetch(base+path,{method:body?'POST':'GET',headers:{'Content-Type':'application/json',...(role?{'x-role':role}:{})},...(body?{body:JSON.stringify(body)}:{})});return {status:r.status,data:await r.json()}};
 try{
  const path='/stores/lab/expense-documents';
  assert.equal((await request(path,sample,'EMPLOYEE')).status,403);
  assert.equal((await request('/stores/foreign/expense-documents',sample,'OWNER')).status,404);
  assert.equal((await request(path,{...sample,storeId:'other'})).status,400);
  assert.equal((await request(path+'?storeId=other')).status,400);
  assert.equal((await request(path,{...sample,totalGross:125})).status,400);
  const first=await request(path,sample);assert.equal(first.status,201);assert.equal(first.data.status,'DRAFT');assert.equal(docs.size,1);assert.equal(events.length,1);
  assert.equal((await request(path,sample)).status,200);assert.equal(events.length,1);
  assert.equal((await request(path,{...sample,totalNet:99,totalVat:25})).status,409);
  assert.equal((await request(path,{...sample,idempotencyKey:'different-retry-key'})).status,409);
  assert.equal((await request('/stores/other/expense-documents/'+first.data.id+'/approve',{})).status,404);
  const approved=await request(path+'/'+first.data.id+'/approve',{});assert.equal(approved.status,200);assert.equal(approved.data.stockUpdated,false);assert.equal(events.length,2);
  assert.equal((await request(path+'/'+first.data.id+'/approve',{})).data.replayed,true);assert.equal(events.length,2);
  assert.equal((await request(path)).data.length,1);assert.equal((await request('/stores/other/expense-documents')).data.length,0);
  docs.get(first.data.id).status='DRAFT';lines.get(first.data.id).productId='forbidden-stock';assert.equal((await request(path+'/'+first.data.id+'/approve',{})).status,409);assert.equal(events.length,2);
 }finally{await new Promise(r=>server.close(r));Object.assign(prisma,{$queryRaw:originals.$queryRaw,$executeRaw:originals.$executeRaw,$executeRawUnsafe:originals.$executeRawUnsafe,$transaction:originals.$transaction});prisma.store.findUnique=originals.findUnique;}
});
