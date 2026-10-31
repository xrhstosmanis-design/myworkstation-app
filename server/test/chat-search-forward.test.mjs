import test from 'node:test';import assert from 'node:assert/strict';import crypto from 'node:crypto';import fs from 'node:fs';
import {searchInput,forwardInput,forwardAttachment} from '../src/chat-search-forward.mjs';
test('history input is bounded and literal wildcard/escape characters cannot broaden the search',()=>{
 assert.deepEqual(searchInput('  100%_!  ','message-1'),{q:'100%_!',pattern:'%100!%!_!!%',before:'message-1'});
 assert.equal(searchInput("a' OR 1=1--").pattern,"%a' OR 1=1--%");
 for(const q of [null,{},['test'],'','a','x'.repeat(121)])assert.throws(()=>searchInput(q),{status:400});
 for(const cursor of ['bad/id',{},'x'.repeat(161)])assert.throws(()=>searchInput('valid',cursor),{status:400});
 assert.equal(searchInput('ΚΑΦΕΣ').q,'ΚΑΦΕΣ');
});
test('forward intent requires an explicit valid destination and bounded unique key',()=>{
 const value={targetStoreId:'store-b',requestId:crypto.randomUUID()};assert.deepEqual(forwardInput(value),value);
 for(const bad of [null,{}, {...value,targetStoreId:'bad/id'},{...value,requestId:'short'},{...value,requestId:'x'.repeat(81)}])assert.throws(()=>forwardInput(bad),{status:400});
});
const policy={canCopyAttachment:true,photosEnabled:true,pdfEnabled:true};
function row(mime,bytes){return {attachmentName:'fixture',attachmentMimeType:mime,attachmentData:bytes.toString('base64'),attachmentSize:bytes.length,attachmentChecksum:crypto.createHash('sha256').update(bytes).digest('hex')}}
test('forward attachment respects source download restrictions, target flags and exact stored bytes/checksum',()=>{
 const png=row('image/png',Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9ZlS8AAAAASUVORK5CYII=','base64'));
 assert.equal(forwardAttachment(png,policy).data,png.attachmentData);
 assert.throws(()=>forwardAttachment(png,{...policy,canCopyAttachment:false}),{status:403});
 assert.throws(()=>forwardAttachment(png,{...policy,photosEnabled:false}),{status:403});
 assert.throws(()=>forwardAttachment({...png,attachmentChecksum:'0'.repeat(64)},policy),{status:400});
 assert.throws(()=>forwardAttachment({...png,attachmentSize:1},policy),{status:400});
 assert.throws(()=>forwardAttachment(row('text/html',Buffer.from('<script>')),policy),{status:400});
 const pdf=row('application/pdf',Buffer.from('%PDF-fixture'));assert.throws(()=>forwardAttachment(pdf,{...policy,pdfEnabled:false}),{status:403});
 assert.equal(forwardAttachment({attachmentData:null},{...policy,canCopyAttachment:false}),null,'text-only forwarding does not bypass or need an attachment download');
});
test('forwarding retains the existing canonical audio/video validators and bounds',()=>{
 const bytes=Buffer.alloc(46);bytes.write('RIFF');bytes.writeUInt32LE(38,4);bytes.write('WAVE',8);bytes.write('fmt ',12);bytes.writeUInt32LE(16,16);bytes.writeUInt16LE(1,20);bytes.writeUInt16LE(1,22);bytes.writeUInt32LE(16000,24);bytes.writeUInt32LE(32000,28);bytes.writeUInt16LE(2,32);bytes.writeUInt16LE(16,34);bytes.write('data',36);bytes.writeUInt32LE(2,40);
 assert.equal(forwardAttachment(row('audio/wav',bytes),policy).size,46);
 assert.throws(()=>forwardAttachment(row('audio/wav',Buffer.from('RIFFbad')),policy),{status:400});
 const video=fs.readFileSync(new URL('./fixtures/chat-video/one-second.mp4',import.meta.url));assert.equal(forwardAttachment(row('video/mp4',video),policy).size,video.length);
 assert.throws(()=>forwardAttachment(row('video/mp4',Buffer.from('not MP4')),policy),{status:400});
 assert.throws(()=>forwardAttachment(row('video/mp4',video),{...policy,photosEnabled:false}),{status:403});
});
