import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {z} from 'zod';
import {declaredEftpos} from '../../shared/declared-eftpos.mjs';
import {assertPosShiftOwner} from '../src/lib/pos-shift-owner.js';
const source=await readFile(new URL('../src/routes/cash-control.js',import.meta.url),'utf8');
const schemaText=source.slice(source.indexOf('const amount='),source.indexOf('const reportDateSchema='));
const closeSchema=new Function('z','declaredEftpos',schemaText+'return closeSchema;')(z,declaredEftpos);
test('actual close schema rejects absent EFTPOS instead of coercing to zero; explicit zero and amounts remain valid',()=>{
 for(const value of [undefined,null,'','   ',false,true,[],{},-1,'-1','NaN','Infinity',Infinity,'1e3','0x10',1000000000]){
  assert.equal(closeSchema.safeParse({eftposTotal:value}).success,false,String(value));
 }
 for(const [value,expected]of [[0,0],['0',0],['0,00',0],[12.34,12.34],['12,34',12.34]])assert.equal(closeSchema.parse({eftposTotal:value}).eftposTotal,expected);
});
test('owner conflict refuses foreign owner and allows same owner or empty terminal',async()=>{
 const calls=[],db={$queryRaw:async(strings,...values)=>{calls.push({sql:strings.join('?'),values});return [{id:'shift'}]}};
 await assert.rejects(()=>assertPosShiftOwner(db,{companyId:'c',storeId:'s',operatorId:'b',terminalPos:null}),e=>e.status===409&&e.code==='POS_SHIFT_OTHER_OPERATOR');
 assert.deepEqual(calls[0].values,['c','s','MAIN','b']);
 db.$queryRaw=async()=>[];await assertPosShiftOwner(db,{companyId:'c',storeId:'s',operatorId:'a',terminalPos:'main'});
});
test('actual close handler does not start transaction/card/audit/attendance on invalid EFTPOS',async()=>{
 const start=source.indexOf('router.post("/sessions/:sessionId/close",route(async(req,res)=>{')+'router.post("/sessions/:sessionId/close",route(async(req,res)=>{'.length,end=source.indexOf('\n}));',start),body=source.slice(start,end);
 const handler=new Function('closeSchema','prisma','return async(req,res)=>{'+body+'}')(closeSchema,{$transaction:()=>{throw Error('unexpected transaction')}});
 for(const eftposTotal of [undefined,null,'',' '])await assert.rejects(()=>handler({body:{eftposTotal},user:{fullName:'Fixture'},params:{sessionId:'shift'}},{}),e=>e.name==='ZodError');
});
