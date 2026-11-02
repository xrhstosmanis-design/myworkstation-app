import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {pathToFileURL} from 'node:url';
const root=new URL('../../',import.meta.url).pathname;
const {default:sharp}=await import(pathToFileURL(`${root}/node_modules/sharp/lib/index.js`).href);
function loader(filename){
 const source=readFileSync(filename,'utf8').replace(/^import .*;\r?\n/gm,'').replace(/^export /gm,'');
 return new Function('sharp',`${source}\nreturn invoiceAssistantImageViews;`)(sharp);
}
const candidate=loader(`${root}/server/src/lib/invoice-assistant-image-views.js`);
const media=content=>content.filter(part=>part.type!=='input_text');
const pdf={filename:'unchanged-original.pdf',mimeType:'application/pdf',contentData:`data:application/pdf;base64,${Buffer.from('%PDF-1.4 synthetic original bytes').toString('base64')}`};
const portrait=await sharp({create:{width:900,height:1600,channels:3,background:'white'}}).jpeg().toBuffer();
const landscape=await sharp({create:{width:1200,height:900,channels:3,background:'white'}}).jpeg().toBuffer();
const sideways=await sharp({create:{width:1600,height:900,channels:3,background:'#242424'}}).composite([{input:await sharp({create:{width:1450,height:510,channels:3,background:'white'}}).png().toBuffer(),left:75,top:100}]).jpeg().toBuffer();
const photo=bytes=>({filename:'unchanged.jpg',mimeType:'image/jpeg',contentData:`data:image/jpeg;base64,${bytes.toString('base64')}`});
for(const [name,pages,images,files]of [
 ['single PDF',[pdf],0,1],['PDF plus photo',[pdf,photo(portrait)],4,1],['two photos',[photo(portrait),photo(portrait)],8,0],['landscape photo',[photo(landscape)],4,0],['sideways photo',[photo(sideways)],5,0],
]){
 test(`${name} labels attachments while retaining original PDF bytes and expected image resources`,async()=>{
  const before=JSON.stringify(pages),content=await candidate(pages,{attachmentLabels:true});
  assert.deepEqual(media(content),media(await candidate(pages)));
  assert.equal(content.length,2*(images+files));
  for(const part of media(content)){
   if(part.type==='input_file'){assert.equal(part.file_data,pdf.contentData);assert.equal(part.filename,pdf.filename)}
   else{assert.equal(part.type,'input_image');assert.equal(part.detail,'high');assert.match(part.image_url,/^data:image\/jpeg;base64,/);const metadata=await sharp(Buffer.from(part.image_url.split(',')[1],'base64')).metadata();assert.ok(metadata.width>0&&metadata.height>0)}
  }
  assert.equal(content.filter(part=>part.type==='input_image').length,images);
  assert.equal(content.filter(part=>part.type==='input_file').length,files);
  assert.equal(JSON.stringify(pages),before);
  for(const text of content.filter(part=>part.type==='input_text').map(part=>part.text)){
   assert.match(text,/^Συνημμένο \d+/);assert.doesNotMatch(text,/Σελίδα \d+/);
  }
  if(files){assert.match(content[0].text,/πολλές φυσικές σελίδες/);assert.match(content[0].text,/δεν δηλώνει αριθμό φυσικής σελίδας/)}
  if(images)assert.ok(content.some(part=>part.type==='input_text'&&/κάθε φυσική γραμμή μόνο μία φορά/.test(part.text)));
  if(name==='sideways photo')assert.match(content[0].text,/ΙΔΙΟ παραστατικό/);
 });
}

test('default photo labels retain actual unnumbered-page verification full and bottom views',async()=>{
 const files=await candidate([photo(portrait),photo(portrait)]);
 const source=readFileSync(`${root}/server/src/routes/invoice-assistant-pos.js`,'utf8');
 const start=source.indexOf('async function readUnnumberedPageEvidence('),end=source.indexOf('\nfunction manager(',start);
 assert.ok(start>=0&&end>start);
 const calls=[];
 const read=new Function('fetch','process','AbortSignal','pageEvidenceSchema','responseText',`${source.slice(start,end)}\nreturn readUnnumberedPageEvidence;`)(async(url,options)=>{assert.equal(url,'https://api.openai.com/v1/responses');calls.push(JSON.parse(options.body));return {ok:true,json:async()=>({output_text:JSON.stringify({unnumberedPageEvidence:[],printedTotal:'0'})})}},{env:{OPENAI_API_KEY:'synthetic-only'}},AbortSignal,{},value=>value.output_text);
 await read(files,'SYNTHETIC',2);
 assert.equal(calls.length,1);
 const selected=calls[0].input[0].content.slice(1);
 assert.deepEqual(selected,[files[0],files[1],files[6],files[7],files[8],files[9],files[14],files[15]]);
 assert.equal(selected.filter(part=>part.type==='input_image').length,4);
 assert.ok(selected.filter(part=>part.type==='input_text').every(part=>/^Σελίδα \d+/.test(part.text)));
});

test('default mixed PDF and photo labels retain original PDF plus full and bottom image evidence',async()=>{
 const files=await candidate([pdf,photo(portrait)]);
 const source=readFileSync(`${root}/server/src/routes/invoice-assistant-pos.js`,'utf8');
 const start=source.indexOf('async function readUnnumberedPageEvidence('),end=source.indexOf('\nfunction manager(',start);
 const calls=[];
 const read=new Function('fetch','process','AbortSignal','pageEvidenceSchema','responseText',`${source.slice(start,end)}\nreturn readUnnumberedPageEvidence;`)(async(url,options)=>{calls.push(JSON.parse(options.body));return {ok:true,json:async()=>({output_text:JSON.stringify({unnumberedPageEvidence:[],printedTotal:'0'})})}},{env:{OPENAI_API_KEY:'synthetic-only'}},AbortSignal,{},value=>value.output_text);
 await read(files,'SYNTHETIC',3);
 const selected=calls[0].input[0].content.slice(1);
 assert.deepEqual(selected,[files[2],files[3],files[8],files[9],files[1]]);
 assert.equal(selected.filter(part=>part.type==='input_file').length,1);
 assert.equal(selected.filter(part=>part.type==='input_image').length,2);
 assert.equal(selected.at(-1).file_data,pdf.contentData);
});
