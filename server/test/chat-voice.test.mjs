import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';
import {parseVoiceAttachment,validateVoiceWave,VOICE_MAX_BYTES} from '../src/chat-voice.mjs';

function wave(size=2){
  const b=Buffer.alloc(44+size);b.write('RIFF');b.writeUInt32LE(b.length-8,4);b.write('WAVE',8);b.write('fmt ',12);b.writeUInt32LE(16,16);b.writeUInt16LE(1,20);b.writeUInt16LE(1,22);b.writeUInt32LE(16000,24);b.writeUInt32LE(32000,28);b.writeUInt16LE(2,32);b.writeUInt16LE(16,34);b.write('data',36);b.writeUInt32LE(size,40);return b;
}
const attachment=bytes=>({mimeType:'audio/wav',name:'ignored.wav',dataUrl:'data:audio/wav;base64,'+bytes.toString('base64')});
test('voice parser accepts canonical signed PCM with bounded duration and exact checksum',()=>{
  for(const size of [2,32000,1920000]){
    const b=wave(size),value=parseVoiceAttachment(attachment(b));
    assert.equal(value.size,b.length);assert.equal(value.durationMs,size/32);assert.equal(value.name,'voice.wav');assert.equal(value.checksum,crypto.createHash('sha256').update(b).digest('hex'));
  }
  assert.equal(VOICE_MAX_BYTES,1920044);
});
test('voice parser rejects forged header/container/sample parameters and empty/oversize PCM',()=>{
  for(const offset of [0,4,8,12,16,20,22,24,28,32,34,36,40]){const b=wave();b[offset]^=1;assert.throws(()=>parseVoiceAttachment(attachment(b)),{status:400});}
  for(const b of [wave(0),wave(1),wave(1920002),Buffer.alloc(43),wave().subarray(0,45)])assert.throws(()=>validateVoiceWave(b),{status:400});
});
test('voice parser rejects wrong MIME, noncanonical base64, missing or mixed payloads',()=>{
  const valid=attachment(wave());
  for(const value of [null,[],{}, {...valid,mimeType:'application/pdf'},{...valid,dataUrl:valid.dataUrl+'='},{...valid,dataUrl:valid.dataUrl+'\n'},{...valid,dataUrl:'data:audio/wav;base64,AA=='},{...valid,dataUrl:'data:audio/wav;base64,'+'A'.repeat(2560084)}])assert.throws(()=>parseVoiceAttachment(value),{status:400});
});

function harness(){
  const routes=new Map(),messages=[],audits=[],pushes=[];let auditFailure=false;
  const db={store:{findUnique:async({where})=>where.id==='store'?{id:'store',companyId:'company',name:'LAB'}:null},employee:{findMany:async()=>[]},$queryRaw:async()=>[],
    $executeRaw:async(strings,...values)=>{const sql=strings.join('?');if(sql.includes('INSERT INTO "StoreChatMessage"')){messages.push({id:values[0],companyId:values[1],storeId:values[2],sender:values[3],body:values[4],mime:values[6],data:values[9]});return 1;}if(sql.includes('INSERT INTO "WorkforceAuditLog"')){if(auditFailure)throw new Error('audit unavailable');audits.push(JSON.parse(values[6]));return 1;}throw new Error('Unexpected write');},
    $transaction:async callback=>{const m=messages.length,a=audits.length;try{return await callback(db)}catch(error){messages.splice(m);audits.splice(a);throw error;}}
  };
  const router={get:(p,...handlers)=>routes.set('GET '+p,handlers.at(-1)),post:(p,...handlers)=>routes.set('POST '+p,handlers.at(-1)),put(){},patch(){}};
  const source=fs.readFileSync(new URL('../src/routes/store-chat.js',import.meta.url),'utf8').replace(/^import .*;$/gm,'').replace('export async function','async function').replace('export default router;','return router;');
  new Function('express','prisma','crypto','parseVoiceAttachment','isPlatformSuperAdmin','sendStoreChatPush','nativePushStatus',source)({Router:()=>router},db,crypto,parseVoiceAttachment,u=>u?.role==='SUPER_ADMIN',async value=>{pushes.push(value);return {attempted:0,delivered:0}},()=>({configured:false}));
  const request=async(body,user={id:'owner',role:'OWNER',companyId:'company'},method='POST',storeId='store')=>{
    const res={statusCode:200,headers:{},status(code){this.statusCode=code;return this},setHeader(k,v){this.headers[k]=v},json(value){this.body=value;return this}};let error;
    await routes.get(method==='GET'?'GET /stores/:storeId/messages':'POST /stores/:storeId/voice-messages')({body,user,params:{storeId},query:{}},res,e=>{error=e});
    return {...res,error};
  };
  return {request,messages,audits,pushes,failAudit(){auditFailure=true}};
}
test('registered voice handler commits one scoped GENERAL message and metadata audit before generic push',async()=>{
  const h=harness(),data=attachment(wave(32000)),result=await h.request({body:'Private caption',category:'GENERAL',attachment:data});
  assert.equal(result.error,undefined);assert.equal(result.statusCode,201);assert.equal(result.body.ok,true);assert.equal(result.body.id,h.messages[0].id);assert.equal(h.messages.length,1);
  assert.deepEqual({company:h.messages[0].companyId,store:h.messages[0].storeId,sender:h.messages[0].sender,mime:h.messages[0].mime},{company:'company',store:'store',sender:'owner',mime:'audio/wav'});
  assert.equal(h.messages[0].data,data.dataUrl.split(',')[1]);assert.equal(h.audits.length,1);assert.equal(h.audits[0].durationMs,1000);assert.doesNotMatch(JSON.stringify(h.audits),/Private caption|base64/);
  assert.deepEqual(h.pushes,[{store:{id:'store',companyId:'company',name:'LAB'},senderId:'owner'}]);assert.match(result.headers['Cache-Control'],/no-store/);
});
test('registered voice handler rejects foreign store/company and malformed requests with no writes or push',async()=>{
  for(const [user,store] of [[{id:'foreign',companyId:'foreign'},'store'],[{id:'op',companyId:'company',tokenType:'STORE_OPERATOR',storeId:'other'},'store'],[{id:'owner',companyId:'company'},'missing']]){
    const h=harness(),r=await h.request({attachment:attachment(wave())},user,'POST',store);assert.equal(r.statusCode,404);assert.equal(h.messages.length+h.audits.length+h.pushes.length,0);
  }
  for(const body of [{attachment:attachment(wave()),category:'INVOICE'},{attachment:attachment(wave()),body:'a'.repeat(5001)},{attachment:attachment(wave()),body:{}},{body:'missing attachment'},{attachment:attachment(Buffer.alloc(44))}]){
    const h=harness(),r=await h.request(body);assert.ok(r.statusCode===400||r.error?.status===400);assert.equal(h.messages.length+h.audits.length+h.pushes.length,0);
  }
});
test('voice audit failure rolls back message and suppresses push; existing scoped list advertises support',async()=>{
  const h=harness();h.failAudit();const result=await h.request({attachment:attachment(wave())});assert.match(result.error.message,/audit unavailable/);assert.equal(h.messages.length+h.audits.length+h.pushes.length,0);
  const list=await harness().request(null,{id:'op',companyId:'company',storeId:'store',tokenType:'STORE_OPERATOR'},'GET');assert.equal(list.error,undefined);assert.equal(list.body.voiceMessagesAvailable,true);
});
