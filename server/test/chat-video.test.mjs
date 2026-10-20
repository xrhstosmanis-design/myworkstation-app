import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';
import {validateVideoMp4,parseVideoAttachment,VIDEO_MAX_BYTES} from '../src/chat-video.mjs';
const original=fs.readFileSync(new URL('./fixtures/chat-video/one-second.mp4',import.meta.url));
const attachment=bytes=>({mimeType:'video/mp4',dataUrl:'data:video/mp4;base64,'+bytes.toString('base64')});
test('actual H264/AAC MP4 verifies tracks, sample ranges, duration and checksum',()=>{
 const parsed=parseVideoAttachment(attachment(original));assert.equal(parsed.durationMs,1000);assert.equal(parsed.size,original.length);assert.equal(parsed.checksum,crypto.createHash('sha256').update(original).digest('hex'));assert.equal(parsed.name,'video.mp4');
});
test('video rejects invalid headers, codecs, external sources, duration and sample offsets',()=>{
 for(const name of ['ftyp','moov','mdat','avc1','mp4a','avcC','url ','mdhd','stsc','stsz','stts','stco']){
  const copy=Buffer.from(original),at=name==='avc1'?copy.lastIndexOf(name):copy.indexOf(name);assert.ok(at>0,name);copy[at]^=1;assert.throws(()=>validateVideoMp4(copy),{status:400},name);
 }
 for(const name of ['mvhd','mdhd']){const copy=Buffer.from(original),at=name==='avc1'?copy.lastIndexOf(name):copy.indexOf(name);copy.writeUInt32BE(0xffffffff,at+20);assert.throws(()=>validateVideoMp4(copy),{status:400});}
 const offset=Buffer.from(original);offset.writeUInt32BE(0,offset.indexOf('stco')+12);assert.throws(()=>validateVideoMp4(offset),{status:400});
 const source=Buffer.from(original);source.writeUInt32BE(0,source.indexOf('url ')+4);assert.throws(()=>validateVideoMp4(source),{status:400});
 for(const bytes of [Buffer.alloc(0),original.subarray(0,original.length-1),Buffer.concat([original,Buffer.alloc(1)]),Buffer.alloc(VIDEO_MAX_BYTES+1)])assert.throws(()=>validateVideoMp4(bytes),{status:400});
});
test('video parser rejects forged MIME/noncanonical base64 and mixed unsupported payload',()=>{
 const valid=attachment(original);for(const value of [null,[],{}, {...valid,mimeType:'image/jpeg'},{...valid,dataUrl:valid.dataUrl+'='},{...valid,dataUrl:valid.dataUrl+'\n'},{...valid,dataUrl:'data:video/mp4;base64,AA=='}])assert.throws(()=>parseVideoAttachment(value),{status:400});
});
function harness(){
 const routes=new Map(),messages=[],audits=[],pushes=[];let fail=false,disabled=false;
 const db={store:{findUnique:async({where})=>where.id==='store'?{id:'store',companyId:'company',name:'LAB'}:null},employee:{findMany:async()=>[]},$queryRaw:async()=>disabled?[{photosEnabled:false}]:[],
 $executeRaw:async(strings,...values)=>{const sql=strings.join('?');if(sql.includes('INSERT INTO "StoreChatMessage"')){messages.push(values);return 1;}if(sql.includes('INSERT INTO "WorkforceAuditLog"')){if(fail)throw Error('audit unavailable');audits.push(JSON.parse(values[6]));return 1;}throw Error('Unexpected write');},
 $transaction:async fn=>{const m=messages.length,a=audits.length;try{return await fn(db)}catch(e){messages.splice(m);audits.splice(a);throw e;}}};
 const router={get:(p,...h)=>routes.set('GET '+p,h.at(-1)),post:(p,...h)=>routes.set('POST '+p,h.at(-1)),put(){},patch(){}};
 const source=fs.readFileSync(new URL('../src/routes/store-chat.js',import.meta.url),'utf8').replace(/^import .*;$/gm,'').replace('export async function','async function').replace('export default router;','return router;');
 new Function('express','prisma','crypto','parseVideoAttachment','isPlatformSuperAdmin','sendStoreChatPush','nativePushStatus',source)({Router:()=>router},db,crypto,parseVideoAttachment,u=>u?.role==='SUPER_ADMIN',async value=>{pushes.push(value);return {}},()=>({configured:false}));
 return {messages,audits,pushes,fail(){fail=true},disable(){disabled=true},async request(body,user={id:'owner',role:'OWNER',companyId:'company'},storeId='store'){
  const res={statusCode:200,headers:{},status(code){this.statusCode=code;return this},setHeader(k,v){this.headers[k]=v},json(body){this.body=body;return this}};let error;await routes.get('POST /stores/:storeId/video-messages')({body,user,params:{storeId},query:{}},res,e=>{error=e});return {...res,error};
 }};
}
test('registered video route commits scoped GENERAL attachment and metadata audit before generic push',async()=>{
 const h=harness(),r=await h.request({body:'Private caption',attachment:attachment(original)});assert.equal(r.error,undefined);assert.equal(r.statusCode,201);assert.equal(r.body.ok,true);assert.equal(h.messages.length,1);assert.deepEqual(h.messages[0].slice(1,4),['company','store','owner']);assert.equal(h.messages[0][6],'video/mp4');assert.equal(h.audits.length,1);assert.equal(h.audits[0].durationMs,1000);assert.doesNotMatch(JSON.stringify(h.audits),/Private caption|base64/);assert.equal(h.pushes.length,1);assert.match(r.headers['Cache-Control'],/no-store/);
});
test('video route rejects foreign tenants/stores/settings/invalid requests without writes or pushes',async()=>{
 for(const [user,store] of [[{id:'x',companyId:'foreign'},'store'],[{id:'op',companyId:'company',tokenType:'STORE_OPERATOR',storeId:'other'},'store'],[{id:'owner',companyId:'company'},'missing']]){const h=harness(),r=await h.request({attachment:attachment(original)},user,store);assert.equal(r.statusCode,404);assert.equal(h.messages.length+h.audits.length+h.pushes.length,0);}
 for(const body of [{category:'INVOICE',attachment:attachment(original)},{body:{},attachment:attachment(original)},{body:'x'.repeat(5001),attachment:attachment(original)},{attachment:attachment(Buffer.alloc(50))}]){const h=harness(),r=await h.request(body);assert.ok(r.statusCode===400||r.error?.status===400);assert.equal(h.messages.length+h.audits.length+h.pushes.length,0);}
 const h=harness();h.disable();assert.equal((await h.request({attachment:attachment(original)})).statusCode,403);assert.equal(h.messages.length+h.audits.length+h.pushes.length,0);
});
test('audit failure rolls back video before any push',async()=>{const h=harness();h.fail();const r=await h.request({attachment:attachment(original)});assert.match(r.error.message,/audit unavailable/);assert.equal(h.messages.length+h.audits.length+h.pushes.length,0);});
