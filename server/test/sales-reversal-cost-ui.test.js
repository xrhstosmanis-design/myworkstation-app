import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {JSDOM} from 'jsdom';
import {greeceExportValue} from '../../shared/greece-time.mjs';

test('real sales summary/drilldown show unknown costs and CSV retains empty scalar columns',async()=>{
 const source=await readFile(new URL('../../client/src/components/commerce/installKioskReportsSalesV4.js',import.meta.url),'utf8');
 let download,clicks=0;
 const document={createElement:()=>({click(){clicks++}})};
 const url={createObjectURL(blob){download=blob;return 'blob:isolated-sales-export'},revokeObjectURL(){}};
 const {view,drillView,exportCsv}=new Function('greeceExportValue','document','URL','setTimeout',
  source.replace(/^import .*;\s*$/gm,'').replace(/^export /gm,'')+'\nreturn {view,drillView,exportCsv};'
 )(greeceExportValue,document,url,()=>{});
 const unknown={
  productId:'orphan',name:'Orphan return',salesQuantity:-1,grossSales:-10,netSales:-10,vatValue:0,
  costValue:null,profit:null,margin:null,missingOriginalCostLines:1
 };
 const normal={...unknown,productId:'normal',name:'Normal sale',salesQuantity:1,grossSales:10,netSales:10,
  costValue:2,profit:8,margin:80,missingOriginalCostLines:0};
 const data={items:[unknown,normal],totalQuantity:0,totalGross:0,totalNet:0,totalVat:0,totalCost:null,totalProfit:null,
  sourceCoverage:{complete:true,returnedGroupCount:2,totalGroupCount:2,limit:10000,totalsScope:'COMPLETE_SOURCE'}};
 const dom=new JSDOM(view(data,new URLSearchParams()));
 try{
  const rows=[...dom.window.document.querySelectorAll('[data-sales-row]')];
  assert.equal(rows.length,2);
  assert.deepEqual([...rows[0].children].slice(9,12).map(cell=>cell.textContent),['—','—','—']);
  assert.match(rows[1].children[9].textContent,/2,00/);
  assert.match(rows[1].children[10].textContent,/8,00/);
  assert.match(rows[1].children[11].textContent,/80,00/);
  assert.match(dom.window.document.querySelector('[role="status"]').textContent,/αρχική πώληση επιστροφής/);
 }finally{dom.window.close()}
 const drill=new JSDOM(drillView({product:{name:'Orphan'},items:[{
  quantity:-1,lineTotal:-10,netValue:-10,unitPrice:10,vatRate:0,costValue:null,profit:null,margin:null,missingOriginalCost:true
 }]}));
 try{
  const cells=[...drill.window.document.querySelector('.kr-sales-drill-table .kr-row:not(.kr-head)').children];
  assert.deepEqual(cells.slice(8,11).map(cell=>cell.textContent),['—','—','—']);
  assert.match(drill.window.document.querySelector('[role="status"]').textContent,/άγνωστα/);
 }finally{drill.window.close()}
 exportCsv();
 assert.equal(clicks,1);
 const lines=(await download.text()).replace(/^\ufeff/,'').split('\r\n');
 const headers=lines[0].split(';');
 for(const field of ['costValue','profit','margin']){
  const index=headers.indexOf(field);
  assert.ok(index>=0,field+' retained for unknown first row');
  assert.equal(lines[1].split(';')[index],'""');
  assert.equal(lines[2].split(';')[index],'"'+String(normal[field])+'"');
 }
 const empty=new JSDOM(view({...data,items:[],totalCost:0,totalProfit:0,
  sourceCoverage:{complete:true,returnedGroupCount:0,totalGroupCount:0,limit:10000,totalsScope:'COMPLETE_SOURCE'}
 },new URLSearchParams()));
 try{
  assert.ok([...empty.window.document.querySelectorAll('.kr-sales-cards article b')].every(cell=>/0/.test(cell.textContent)));
  assert.doesNotMatch(empty.window.document.body.textContent,/αρχική πώληση επιστροφής/);
 }finally{empty.window.close()}
});
