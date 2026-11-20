import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {z} from 'zod';
import {declaredEftpos} from '../../shared/declared-eftpos.mjs';

const source=await readFile(new URL('../src/routes/cash-control.js',import.meta.url),'utf8');
const schemas=source.slice(source.indexOf('const amount='),source.indexOf('const reportDateSchema='));
const closeSchema=new Function('z','declaredEftpos',schemas+';return closeSchema;')(z,declaredEftpos);
const body={cashSales:-13,cardSales:0,expenses:0,eftposTotal:0,drawer:0,custody:0,coins:0,safe:0};

test('normal close accepts return-only cash totals without changing their sign or value',()=>{
 assert.equal(closeSchema.parse(body).cashSales,-13);
 for(const field of ['cashSales','cardSales','expenses'])assert.equal(closeSchema.parse({...body,[field]:-17.25})[field],-17.25);
});

test('signed derived ledger totals remain finite and bounded',()=>{
 for(const field of ['cashSales','cardSales','expenses'])for(const value of [Infinity,-Infinity,NaN,-1000000000,1000000000])assert.equal(closeSchema.safeParse({...body,[field]:value}).success,false,`${field}: ${value}`);
 for(const value of [-999999999,999999999])assert.equal(closeSchema.parse({...body,cashSales:value}).cashSales,value);
});

test('signed ledger totals never permit negative physical counts or declared EFTPOS',()=>{
 for(const field of ['drawer','custody','coins','safe','eftposTotal']){
  const result=closeSchema.safeParse({...body,[field]:-0.01});
  assert.equal(result.success,false);assert.ok(result.error.issues.some(issue=>issue.path[0]===field));
 }
 const missing={...body};delete missing.eftposTotal;assert.equal(closeSchema.safeParse(missing).success,false);
 assert.equal(closeSchema.parse({...body,eftposTotal:'0,00'}).eftposTotal,0);
});

test('credential validation survives signed totals',()=>{
 for(const credentials of [{closeCredentialMethod:'PIN'},{closeCredentialMethod:'PIN',pin:'123'},{closeCredentialMethod:'CARD',pin:'1234'},{closeCredentialMethod:'PIN',pin:'1234',cardCode:'fixture-card'}])assert.equal(closeSchema.safeParse({...body,...credentials}).success,false);
 assert.equal(closeSchema.parse({...body,closeCredentialMethod:'PIN',pin:'1234'}).cashSales,-13);
});

test('actual registered normal-close handler passes negative net totals to its unchanged locked transaction',async()=>{
 // Stop at transaction admission: no substituted authentication, ledger or close
 // result can turn this regression into a false business acceptance claim.
 const marker=new Error('locked-transaction-admission');let admitted=0,handler;
 const closeRoute=source.slice(source.indexOf('router.post("/sessions/:sessionId/close"'),source.indexOf('\nexport default router;'));
 new Function('z','declaredEftpos','router','route','prisma',schemas+closeRoute)(z,declaredEftpos,{post(path,callback){assert.equal(path,'/sessions/:sessionId/close');handler=callback}},callback=>callback,{$transaction(){admitted++;throw marker}});
 await assert.rejects(handler({body,user:{fullName:'Fixture'}},{}),error=>error===marker);assert.equal(admitted,1);
 for(const field of ['drawer','eftposTotal'])await assert.rejects(handler({body:{...body,[field]:-1},user:{}},{}),error=>error.name==='ZodError');
 assert.equal(admitted,1,'invalid physical counts never enter the transaction');
});
