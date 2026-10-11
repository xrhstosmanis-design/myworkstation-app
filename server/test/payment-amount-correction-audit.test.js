import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
test('existing events report admits and renders attributable payment correction economics',()=>{
 const server=fs.readFileSync(new URL('../src/routes/kiosk-reports-audit.js',import.meta.url),'utf8'),client=fs.readFileSync(new URL('../../client/src/components/commerce/installKioskReportsAuditV2.js',import.meta.url),'utf8');
 assert.match(server,/auditEventLabels\.PAYMENT_AMOUNT_CORRECTED="Διόρθωση πληρωμής"/);
 assert.match(server,/"eventType" IN \([\s\S]*?'PAYMENT_AMOUNT_CORRECTED'/);
 assert.match(server,/details\.previousAmount[\s\S]*?details\.newAmount[\s\S]*?details\.cashDelta[\s\S]*?details\.reason/);
 const fn=client.split('\n').find(line=>line.startsWith('const financialText='));
 const money=value=>Number(value).toFixed(2)+' €';
 const financialText=new Function('money','invoiceAuditFinancialText',fn+';return financialText;')(money,()=>null);
 const row={eventType:'PAYMENT_AMOUNT_CORRECTED',financialDetails:{previousAmount:3,newAmount:5,cashDelta:-2,reason:'Typing mistake'}};
 assert.equal(financialText(row),'Πληρωμή: 3.00 € → 5.00 € · Μεταβολή μετρητών: -2.00 € · Typing mistake');
 assert.match(financialText({...row,financialDetails:{...row.financialDetails,cashDelta:0}}),/Μεταβολή μετρητών: 0.00/);
});
