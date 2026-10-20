import test from 'node:test';
import assert from 'node:assert/strict';
import {assistantReportTables} from '../src/services/assistant-report-table.js';
import {buildAssistantReportFile} from '../src/services/assistant-report-files.js';

const catalog=domain=>({kind:'business_records',domain,currentSnapshot:true,title:domain==='SUPPLIERS'?'Προμηθευτές καταστήματος':'Προσωπικό καταστήματος',source:'Synthetic catalog',storeName:'Fixture store',from:null,to:null,rows:[{recordedAt:'2026-10-12T21:52:13Z',label:'Fixture',amount:null,status:'ACTIVE'}]});
for(const domain of ['SUPPLIERS','STAFF'])test(`${domain} current catalog has an accurate period note without changing source rows`,()=>{
 const report=catalog(domain),before=JSON.stringify(report),table=assistantReportTables([report])[0];
 assert.ok(table.notes.includes('Περίοδος: Τρέχων κατάλογος · ώρα Ελλάδας'));
 assert.ok(table.notes.includes('Τρέχων κατάλογος, όχι ιστορική εικόνα.'));
 assert.equal(table.rows[0][0],'13/10/2026, 00:52:13');
 assert.equal(table.rows[0][3],null);assert.equal(JSON.stringify(report),before);
});

test('stock and explicit date periods retain their existing wording',()=>{
 const stock={kind:'product_stock',rows:[]};
 assert.ok(assistantReportTables([stock])[0].notes.includes('Περίοδος: Τρέχον καταγεγραμμένο απόθεμα · ώρα Ελλάδας'));
 const dated={...catalog('SUPPLIERS'),from:'2026-10-13',to:'2026-10-14'};
 assert.ok(assistantReportTables([dated])[0].notes.includes('Περίοδος: 2026-10-13 έως 2026-10-14 · ώρα Ελλάδας'));
 const day={kind:'product_sales',date:'2026-10-13',rows:[]};
 assert.ok(assistantReportTables([day])[0].notes.includes('Περίοδος: 2026-10-13 · ώρα Ελλάδας'));
});

for(const format of ['csv','xlsx','pdf','docx'])test(`actual ${format} catalog export uses catalog period and preserves midnight`,async()=>{
 const report=catalog('SUPPLIERS'),before=JSON.stringify(report);
 const file=await buildAssistantReportFile(format,[report],{now:new Date('2026-10-12T21:01:02Z')}),bytes=Buffer.from(file.base64,'base64');let text;
 if(format==='csv')text=bytes.toString('utf8');
 if(format==='xlsx'){const {default:XLSX}=await import('xlsx');const book=XLSX.read(bytes,{type:'buffer'});text=JSON.stringify(XLSX.utils.sheet_to_json(book.Sheets[book.SheetNames[0]],{header:1}));}
 if(format==='docx'){const {default:JSZip}=await import('jszip');text=await(await JSZip.loadAsync(bytes)).file('word/document.xml').async('string');}
 if(format==='pdf'){
  const {getDocument}=await import('pdfjs-dist/legacy/build/pdf.mjs');const pdf=await getDocument({data:new Uint8Array(bytes),disableFontFace:true}).promise;
  try{const pages=[];for(let i=1;i<=pdf.numPages;i++)pages.push((await(await pdf.getPage(i)).getTextContent()).items.map(x=>x.str).join(' '));text=pages.join(' ');}finally{await pdf.destroy();}
 }
 assert.match(text,/Περίοδος: Τρέχων κατάλογος/);assert.doesNotMatch(text,/Τρέχον καταγεγραμμένο απόθεμα/);
 assert.match(text,/13\/10\/2026,\s*00:52:13/);assert.equal(JSON.stringify(report),before);
});
