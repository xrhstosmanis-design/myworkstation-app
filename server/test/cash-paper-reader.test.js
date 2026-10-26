import test from 'node:test';
import assert from 'node:assert/strict';
import {createCashPaperReader} from '../src/services/cash-paper-reader.js';
import {createCashPaperProvider} from '../src/services/cash-paper-provider.js';
import sharp from 'sharp';
const raw={dateText:'21/10/2026',documentDate:'2026-10-21',operatorText:'Test',shiftText:'Morning',notes:[],lines:[{kind:'CASHBOX',label:'Cashbox',amountText:'10',quantityText:null,timeText:null,uncertain:false}]};
const scope={companyId:'c',storeId:'s',generation:'0'},actor={id:'actor'},request={messageId:'m',checksum:'a'.repeat(64)};
function fixture(){let state={status:'NOT_READ'},calls=0,completeFails=false,generation='0',pending;const repository={generation:async()=>generation,source:async()=>({bytes:Buffer.from('test')}),get:async()=>state,claim:async()=>{if(state.status!=='NOT_READ')return{claimed:false,state};state={status:'PENDING'};return{claimed:true,state}},complete:async(_s,_a,_m,_c,result)=>{if(completeFails)throw Error('lost completion');state=result;return state;}};const provider={configuration(){},prepare:async()=>[],read:async()=>{calls++;return pending?await pending:raw;}};return {repository,provider,get calls(){return calls},get state(){return state},set pending(v){pending=v},set completeFails(v){completeFails=v},set generation(v){generation=v}};}
test('durable intent reuses an uncertain or successful outcome and makes only one paid call under overlapping requests',async()=>{
 const f=fixture();let release;f.pending=new Promise(resolve=>release=resolve);const reader=createCashPaperReader(f),first=reader.read(scope,actor,request);
 while(!f.calls)await new Promise(resolve=>setImmediate(resolve));
 const second=await reader.read(scope,actor,request);assert.equal(second.status,'PENDING');assert.equal(f.calls,1);release(raw);assert.equal((await first).status,'EXTRACTED_UNVERIFIED');
 assert.equal((await reader.read(scope,actor,request)).reused,true);assert.equal(f.calls,1);
});
test('original image preparation decodes bounded pixels; broken image/PDF fail before provider dispatch',async()=>{
 let paid=0;
 const provider=createCashPaperProvider({env:{OPENAI_API_KEY:'synthetic'},meter:async()=>{paid++;throw Error('unexpected dispatch')}});
 const bytes=await sharp({create:{width:12,height:8,channels:4,background:'#ff000080'}}).png().toBuffer();
 const prepared=await provider.prepare({mimeType:'image/png',bytes,filename:'paper.png'});
 assert.equal(prepared.length,1);assert.equal(prepared[0].type,'input_image');
 const output=await sharp(Buffer.from(prepared[0].image_url.split(',')[1],'base64')).metadata();assert.equal(output.format,'jpeg');assert.equal(output.width,12);assert.equal(output.height,8);
 await assert.rejects(provider.prepare({mimeType:'image/png',bytes:Buffer.from('broken'),filename:'broken.png'}));
 await assert.rejects(provider.prepare({mimeType:'application/pdf',bytes:Buffer.from('%PDF-broken'),filename:'broken.pdf'}));assert.equal(paid,0);
});
test('lost completion, bad provider output and stale generation never authorize an automatic paid retry',async()=>{
 const f=fixture();f.completeFails=true;const reader=createCashPaperReader(f);await assert.rejects(reader.read(scope,actor,request),/lost completion/);assert.equal((await reader.read(scope,actor,request)).status,'PENDING');assert.equal(f.calls,1);
 const bad=fixture();bad.provider.read=async()=>{throw Error('unknown provider outcome')};const b=createCashPaperReader(bad);assert.equal((await b.read(scope,actor,request)).status,'REQUIRES_REVIEW');assert.equal((await b.read(scope,actor,request)).reused,true);
 const stale=fixture();stale.generation='1';await assert.rejects(createCashPaperReader(stale).read(scope,actor,request),e=>e.code==='STORE_LIFECYCLE_STALE_GENERATION');assert.equal(stale.calls,0);assert.equal(stale.state.status,'NOT_READ');
});
test('bad original preparation and capacity refusal happen before durable intent or paid dispatch',async()=>{
 const f=fixture();f.provider.prepare=async()=>{throw Error('bad photo')};await assert.rejects(createCashPaperReader(f).read(scope,actor,request),/bad photo/);assert.equal(f.calls,0);assert.equal(f.state.status,'NOT_READ');
 const busy=fixture();await assert.rejects(createCashPaperReader({...busy,maxActive:0}).read(scope,actor,request),e=>e.status===429);assert.equal(busy.calls,0);assert.equal(busy.state.status,'NOT_READ');
});
test('provider uses the existing scoped wallet adapter, no tools/storage, strict extraction and one original input with no real network',async()=>{
 let calls=0,billed,settings;
 const provider=createCashPaperProvider({env:{OPENAI_API_KEY:'synthetic-key',OPENAI_COMMAND_CENTER_MODEL:'gpt-5-mini'},meter:async(s,p,invoke)=>{billed=s;settings=p;return invoke(p)},transport:async(url,options)=>{calls++;assert.equal(url,'https://api.openai.com/v1/responses');assert.equal(options.method,'POST');return{ok:true,json:async()=>({output_text:JSON.stringify(raw)})}}});
 const out=await provider.read(scope,[{type:'input_image',image_url:'data:image/jpeg;base64,SYNTHETIC',detail:'high'}]);assert.deepEqual(out,raw);assert.equal(calls,1);assert.equal(billed.feature,'CASH_PAPER_READING');assert.equal(billed.storeId,'s');assert.equal(settings.store,false);assert.equal(settings.tools,undefined);assert.equal(settings.text.format.strict,true);assert.equal(settings.input[0].content.filter(c=>c.type==='input_image').length,1);
 assert.throws(()=>createCashPaperProvider({env:{}}).configuration(),e=>e.code==='CASH_PAPER_PROVIDER_UNAVAILABLE');
 const invalid=createCashPaperProvider({env:{OPENAI_API_KEY:'synthetic'},meter:async()=>({response:{ok:true},raw:{output_text:'not json'}})});await assert.rejects(invalid.read(scope,[]),e=>e.code==='CASH_PAPER_INVALID_RESULT');
});
