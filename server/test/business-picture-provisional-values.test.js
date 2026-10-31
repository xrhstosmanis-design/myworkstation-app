import test from 'node:test';
import assert from 'node:assert/strict';
import {businessPictureCell as cell,businessPictureCsv} from '../../client/src/components/cloud/business-picture-values.js';
import {businessPicturePrintHtml} from '../../client/src/components/cloud/business-picture-print.js';
const row={month:'2035-01',label:'2035-01',margin:null,grossProfit:null,netProfit:null,estimatedMargin:25,estimatedGrossProfit:50,estimatedNetProfit:40,profitEstimateBasis:'CATEGORY_KNOWN_SALES',unestimatedCostLines:0,costCoveragePercent:90,missingCostLines:1,salesLines:10};
test('only explicit finite provisional producer values may fill unknown UI cells',()=>{
 assert.deepEqual(cell(row,'margin'),{value:25,estimated:true});assert.deepEqual(cell({...row,margin:0},'margin'),{value:0,estimated:false});
 for(const override of [{profitEstimateBasis:null},{unestimatedCostLines:1},{estimatedMargin:Infinity},{estimatedMargin:'25'}])assert.deepEqual(cell({...row,...override},'margin'),{value:null,estimated:false});
});
test('CSV preserves canonical blanks and labels separate numeric estimates and coverage',()=>{
 const csv=businessPictureCsv({monthly:[row]},[['margin','Margin'],['grossProfit','Κέρδος'],['netProfit','Καθαρό']]);const lines=csv.slice(1).split('\n');
 assert.match(lines[0],/Εκτιμώμενο Margin/);assert.match(lines[0],/Κάλυψη κόστους/);assert.equal(lines[1],'"2035-01";"";"";"";"25";"50";"40";"90";"0"');
});
test('standalone print marks every displayed provisional profit explicitly',()=>{
 const columns=[['margin','Margin',String],['grossProfit','Κέρδος',String],['netProfit','Καθαρό',String]];
 const html=businessPicturePrintHtml({data:{calendarFrom:'2035-01-01',calendarTo:'2035-01-31',totals:row},storeName:'LAB',columns,rows:[row]});
 assert.ok(html.includes('≈ 25 (Εκτίμηση)'));assert.ok(html.includes('≈ 50 (Εκτίμηση)'));assert.ok(html.includes('≈ 40 (Εκτίμηση)'));assert.ok(html.includes('Κάλυψη κόστους 90.00%'));
});
