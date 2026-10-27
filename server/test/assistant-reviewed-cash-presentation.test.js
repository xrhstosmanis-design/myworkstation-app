import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {mkdir,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {build} from 'esbuild';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import JSZip from 'jszip';
import XLSX from 'xlsx';
import {presentAssistantAnswer} from '../../client/src/components/voice/presentAssistantAnswer.js';
import {assistantReportTables} from '../src/services/assistant-report-table.js';
import {buildAssistantReportFile} from '../src/services/assistant-report-files.js';
import {reviewedCashEvidence} from '../src/services/assistant-reviewed-cash.js';
import {reconciliationText} from '../src/services/cash-reconciliation-report.js';
const period={from:'2026-10-21',to:'2026-10-21'};
function evidence(count=1){const r={storeId:'store',storeName:'Δοκιμαστικό κατάστημα',generation:'0',period,head:'b'.repeat(64),reportHash:'a'.repeat(64),coverage:'BOUNDED_CLOSED_SHIFTS',financialFinality:'REVIEWED_CASH_ROWS_ONLY',originalFinancialLedgerChanged:false,rows:[{sessionId:'a',day:period.from,shiftLabel:'Πρωινή',operatorName:'Χρυσάνθη',initialCents:-8700,remainingCents:-700,offsetCents:8000,cardCents:20000,reviewed:true,reviewedBy:'Χρήστος Μάνης',status:'REVIEWED'}],totals:{shortageCents:700,surplusCents:0,pending:0},employees:[{name:'Χρυσάνθη',shortageCents:700,surplusCents:0,identityRequiresReview:false}],checkpoint:{resumeFrom:'2026-10-22',period,pendingNotes:['Αναμονή ενημέρωσης για ακύρωση Vodafone 20 €.'],current:true}};if(count>1){r.rows=Array.from({length:count},(_,i)=>({...r.rows[0],sessionId:'session-'+i,shiftLabel:'Βάρδια '+String(i+1).padStart(3,'0')}));r.totals.shortageCents=700*count;r.employees[0].shortageCents=700*count;r.checkpoint.pendingNotes.push('ΤΕΛΟΣ ΕΛΕΓΧΟΥ: οι διαφορές καρτών παρέμειναν χωριστές.');}r.text=reconciliationText(r);return reviewedCashEvidence(r,{companyId:'co',companyName:'Εικονική εταιρεία',storeId:'store'},period);}
test('actual shared presenter keeps exact server prose and pending notes without model amounts or raw cash evidence tables',async()=>{
 const e=evidence(),r=presentAssistantAnswer({answer:'FAKE LIABILITY 999',highlights:['FAKE 999'],limitations:'FAKE',evidence:[e]});assert.equal(r.answer,e.text);assert.deepEqual(r.highlights,[]);assert.doesNotMatch(JSON.stringify(r),/FAKE|999/);
 const built=await build({entryPoints:[fileURLToPath(new URL('../../client/src/components/voice/AssistantReportEvidence.jsx',import.meta.url))],bundle:true,write:false,format:'cjs',platform:'node',external:['react','react/jsx-runtime']});const m={exports:{}};new Function('require','module','exports',built.outputFiles[0].text)(createRequire(import.meta.url),m,m.exports);const html=renderToStaticMarkup(React.createElement(m.exports.default,{result:{evidence:[e]}}));assert.doesNotMatch(html,/<table|999|87,00/);
 const table=assistantReportTables([e])[0];assert.equal(table.prose,true);assert.deepEqual(table.columns,['Κείμενο αναφοράς']);assert.equal(table.rows.map(r=>r[0]).join('\n'),e.text);
 assert.throws(()=>assistantReportTables([{...e,financialFinality:'FAKE'}]),error=>error.status===422);
});
test('actual PDF and Word cash exports contain all prose as paragraphs, while CSV and Excel preserve exact text without fresh arithmetic',async()=>{
 const e=evidence(),files={};for(const format of ['xlsx','csv','docx','pdf']){const a=await buildAssistantReportFile(format,[e],{now:new Date('2026-10-26T12:00:00Z')});files[format]=Buffer.from(a.base64,'base64');assert.equal(a.size,files[format].length);assert.equal(a.readOnly,true);if(process.env.CASH_REVIEW_QA_DIR){await mkdir(process.env.CASH_REVIEW_QA_DIR,{recursive:true});await writeFile(join(process.env.CASH_REVIEW_QA_DIR,'reviewed-cash-synthetic.'+format),files[format]);}}
 const csv=files.csv.toString('utf8');assert.match(csv,/Χρυσάνθη: Έλλειμμα 7,00/);assert.match(csv,/POS–EFTPOS: διαφορά \+200,00/);assert.match(csv,/Vodafone 20/);assert.doesNotMatch(csv,/999/);
 const book=XLSX.read(files.xlsx,{type:'buffer'}),rows=XLSX.utils.sheet_to_json(book.Sheets[book.SheetNames[0]],{header:1});assert(rows.some(row=>row[0]===e.text.split('\n').find(l=>l.includes('Χρυσάνθη: Έλλειμμα'))));assert(rows.some(row=>String(row[0]).includes('Vodafone 20')));
 const xml=await(await JSZip.loadAsync(files.docx)).file('word/document.xml').async('string');assert.doesNotMatch(xml,/<w:tbl\b|w:hyperlink|999/);assert.match(xml,/Χρυσάνθη: Έλλειμμα 7,00/);assert.match(xml,/Vodafone 20/);
 const {getDocument}=await import('pdfjs-dist/legacy/build/pdf.mjs'),pdf=await getDocument({data:new Uint8Array(files.pdf),disableFontFace:true}).promise;
 try{let text='';for(let p=1;p<=pdf.numPages;p++)text+=(await(await pdf.getPage(p)).getTextContent()).items.map(i=>i.str).join(' ')+'\n';assert.match(text,/Χρυσάνθη: Έλλειμμα 7,00/);assert.match(text,/POS–EFTPOS: διαφορά \+200,00/);assert.match(text,/Vodafone 20/);assert.match(text,/ΜΑΝΗΣ ΧΡΗΣΤΟΣ/);assert.doesNotMatch(text,/999/);}finally{await pdf.destroy();}
});

test('multi-page cash PDF retains every shift marker and the last pending note without clipping',async()=>{
 const e=evidence(60),artifact=await buildAssistantReportFile('pdf',[e],{now:new Date('2026-10-26T12:00:00Z')}),bytes=Buffer.from(artifact.base64,'base64');
 if(process.env.CASH_REVIEW_QA_DIR)await writeFile(join(process.env.CASH_REVIEW_QA_DIR,'reviewed-cash-synthetic.pdf'),bytes);
 const {getDocument}=await import('pdfjs-dist/legacy/build/pdf.mjs'),pdf=await getDocument({data:new Uint8Array(bytes),disableFontFace:true}).promise;
 try{assert(pdf.numPages>1);let text='';for(let p=1;p<=pdf.numPages;p++)text+=(await(await pdf.getPage(p)).getTextContent()).items.map(i=>i.str).join(' ')+'\n';for(let i=1;i<=60;i++)assert(text.includes('Βάρδια '+String(i).padStart(3,'0')));assert.match(text,/ΤΕΛΟΣ ΕΛΕΓΧΟΥ/);assert.match(text,/420,00/);assert.match(text,/POS–EFTPOS: διαφορά \+200,00/);}finally{await pdf.destroy();}
});
