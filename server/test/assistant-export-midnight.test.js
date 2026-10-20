import test from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {assistantReportTables} from '../src/services/assistant-report-table.js';

const record=(recordedAt)=>({kind:'business_records',domain:'BANK_MOVEMENTS',title:'Καταχωρημένες τραπεζικές κινήσεις',source:'Synthetic bank fixture',storeName:'Fixture store',from:'2026-10-13',to:'2026-10-13',rows:[{recordedAt,recordType:'POS_SETTLEMENT',label:'=FIXTURE()',amount:-7.25,status:'CONFIRMED'}]});
const clocks=[
 ['summer midnight','2026-10-12T21:00:00Z','13/10/2026, 00:00:00'],
 ['observed midnight hour','2026-10-12T21:52:13Z','13/10/2026, 00:52:13'],
 ['previous local day','2026-10-12T20:59:59Z','12/10/2026, 23:59:59'],
 ['next local hour','2026-10-12T22:00:00Z','13/10/2026, 01:00:00'],
 ['winter midnight hour','2026-12-12T22:02:22Z','13/12/2026, 00:02:22'],
 ['spring DST day midnight','2026-03-28T22:00:00Z','29/3/2026, 00:00:00'],
 ['autumn DST day midnight','2026-10-24T21:00:00Z','25/10/2026, 00:00:00'],
 ['first autumn repeated hour','2026-10-25T00:30:00Z','25/10/2026, 03:30:00'],
 ['second autumn repeated hour','2026-10-25T01:30:00Z','25/10/2026, 03:30:00'],
];
for(const [name,instant,expected] of clocks)test(`export timestamp uses original Athens calendar date and h23: ${name}`,()=>{
 const evidence=record(instant),before=JSON.stringify(evidence);
 const table=assistantReportTables([evidence],{generatedAt:new Date(instant)})[0];
 assert.equal(table.rows[0][0],expected);assert.equal(table.notes[0],`Ώρα δημιουργίας: ${expected}`);
 assert.equal(table.rows[0][3],-7.25);assert.equal(JSON.stringify(evidence),before);
});

test('consumption and closed-shift export timestamps share the corrected midnight clock',()=>{
 const instant='2026-10-12T21:52:13Z',expected='13/10/2026, 00:52:13';
 const consumption={kind:'consumption',rows:[{recordedAt:instant,name:'Fixture',quantity:1,referenceValue:2}]};
 const shift={closedShiftsOnly:true,rows:[{closedAt:instant,expectedOperational:1,actualOperational:1,variance:0,cardVariance:0}]};
 for(const evidence of [consumption,shift]){
  const t=assistantReportTables([evidence],{generatedAt:new Date(instant)})[0];
  assert.ok(t.rows[0].includes(expected));assert.equal(t.notes[0],`Ώρα δημιουργίας: ${expected}`);
 }
});

test('invalid or absent export timestamp remains explicitly unrecorded',()=>{
 for(const instant of [null,undefined,'not-an-instant'])assert.equal(assistantReportTables([record(instant)])[0].rows[0][0],'Μη καταγεγραμμένη');
});

test('export timestamp clock is independent of server machine timezone',()=>{
 const script='import {assistantReportTables} from "./server/src/services/assistant-report-table.js";console.log(JSON.stringify(assistantReportTables([{kind:"business_records",rows:[{recordedAt:"2026-10-12T21:52:13Z"}]}],{generatedAt:new Date("2026-12-12T22:02:22Z")})));';
 const results=['UTC','Europe/Athens','America/Los_Angeles','Asia/Tokyo'].map(TZ=>execFileSync(process.execPath,['--input-type=module','-e',script],{cwd:new URL('../../',import.meta.url),env:{...process.env,TZ},encoding:'utf8'}).trim());
 assert.equal(new Set(results).size,1);assert.match(results[0],/13\/10\/2026, 00:52:13/);assert.match(results[0],/13\/12\/2026, 00:02:22/);assert.doesNotMatch(results[0],/, 24:/);
});

test('all four actual rendered report files preserve midnight row and creation timestamps',async()=>{
 const {buildAssistantReportFile}=await import('../src/services/assistant-report-files.js');
 const {default:XLSX}=await import('xlsx');const {default:JSZip}=await import('jszip');
 const report=record('2026-10-12T21:52:13Z'),now=new Date('2026-10-12T21:01:02Z'),before=JSON.stringify(report);
 for(const format of ['csv','xlsx','pdf','docx']){
  const file=await buildAssistantReportFile(format,[report],{now}),bytes=Buffer.from(file.base64,'base64');
  assert.equal(file.filename,`myworkstation-report-20261013000102.${format}`);let text;
  if(format==='csv'){text=bytes.toString('utf8');assert.equal(text[0],'\uFEFF');assert.match(text,/'=FIXTURE/);assert.match(text,/-7,25/);}
  if(format==='xlsx'){
   const book=XLSX.read(bytes,{type:'buffer'}),sheet=book.Sheets[book.SheetNames[0]],rows=XLSX.utils.sheet_to_json(sheet,{header:1});
   text=JSON.stringify(rows);assert.ok(rows.some(row=>row.includes(-7.25)));assert.ok(rows.some(row=>row.includes("'=FIXTURE()")));
   for(const cell of Object.values(sheet))assert.equal(cell?.f,undefined);
  }
  if(format==='docx'){const zip=await JSZip.loadAsync(bytes);text=await zip.file('word/document.xml').async('string');}
  if(format==='pdf'){
   const {getDocument}=await import('pdfjs-dist/legacy/build/pdf.mjs');const pdf=await getDocument({data:new Uint8Array(bytes),disableFontFace:true}).promise;
   try{const pages=[];for(let i=1;i<=pdf.numPages;i++)pages.push((await(await pdf.getPage(i)).getTextContent()).items.map(x=>x.str).join(' '));text=pages.join(' ');}finally{await pdf.destroy()}
  }
  assert.match(text,/13\/10\/2026,\s*00:52:13/,format);assert.match(text,/13\/10\/2026,\s*00:01:02/,format);assert.doesNotMatch(text,/,\s*24:/,format);
 }
 assert.equal(JSON.stringify(report),before);
});
