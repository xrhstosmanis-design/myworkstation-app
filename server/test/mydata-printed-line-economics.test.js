import test from 'node:test';
import assert from 'node:assert/strict';
import { parseMyDataPrintedLineEconomics as parse, printedEconomicsProfileForUrl as profileFor } from '../src/lib/mydata-printed-line-economics.js';
const profile = 'E_INVOICING_DETAILED_LINE_AMOUNT_V1';
const headers = 'ΚΩΔΙΚΟΣ\nΠΕΡΙΓΡΑΦΗ\nΜΜ\nΠΟΣΟΤΗΤΑ\nΤΙΜΗ ΜΟΝ.\nΑΞΙΑ ΠΡΟ ΕΚΠΤ.\nΕΚΠΤ.\nΚΑΘΑΡΗ ΑΞΙΑ\nΦΠΑ%';
const footer = 'Αξία προ έκπτωσης\n37,20EUR\nΈκπτωση\n14,43EUR\nΕπιβάρυνση\n0,00EUR\nΚαθαρή Αξία\n22,77EUR\nΦ.Π.Α\n2,96EUR\nΤΕΛΙΚΗ ΑΞΙΑ\n25,73EUR';
const text = `Synthetic layout test, no real invoice identity\n${headers}\nTEST001\nSYNTHETIC PRODUCT\nΤΕΜ\n12,00\n3,10\n37,20\n14,43\n22,77\n13%\n${footer}`;
const xmlLines = [{lineNumber:1,itemCode:'TEST001',description:'SYNTHETIC PRODUCT',quantity:12,measurementUnit:1,netValue:22.77,vatCategory:2,vatAmount:2.96}];
const input = () => ({text,xmlLines:structuredClone(xmlLines),totalNet:22.77,totalVat:2.96,totalGross:25.73,pageCount:1,profile});
test('strict provider URL profile rejects credentials, ports, query, lookalikes and ambiguous paths', () => {
  const url = 'https://e-invoicing.gr/edocuments/ViewInvoice/-1/00000000-0000-0000-0000-000000000000_ABC123/pdf';
  assert.equal(profileFor(url),profile);
  for (const bad of [url+'?x=1',url+'#a',url.replace('https:','http:'),url.replace('.gr/','.gr.evil/'),url.replace('.gr/','.gr:443/'),url.replace('https://','https://u@'),url.replace('_ABC123','_ABC12'),url.replace('/pdf','/html')]) assert.equal(profileFor(bad),null);
});
test('explicit amount retained as amount while both original unit costs and derived storage percentage reconcile', () => {
  const result = parse(input()); assert.ok(result);
  assert.equal(result.rows[0].unitCost,'3.100000'); assert.equal(result.rows[0].initialUnitCost,'3.100000');
  assert.equal(result.rows[0].discount1,'38.79032258');
  assert.deepEqual(result.rows[0].printedDiscountSteps,[{kind:'LINE_AMOUNT',amount:'14.43'}]);
  assert.equal(result.totals.discount,'14.43');
});
test('fail closed on ambiguous columns, missing/extra/duplicate rows, footer or XML mismatches', () => {
  const variants = [x=>x.text=x.text.replace('ΕΚΠΤ.\nΚΑΘΑΡΗ','ΕΚΠΤ.%\nΚΑΘΑΡΗ'),x=>x.text=x.text.replace('14,43\n22,77','14,42\n22,77'),x=>x.text=x.text.replace('0,00EUR','1,00EUR'),x=>x.text=x.text.replace('37,20EUR','37,21EUR'),x=>x.text=x.text.replace('ΤΕΜ','ΚΙΒ'),x=>x.text=x.text.replace('3,10','3,1000001'),x=>x.text=x.text.replace('13%','24%'),x=>x.text=x.text.replace('ΤΕΛΙΚΗ ΑΞΙΑ','SUM'),x=>x.text=x.text.replace('TEST001','WRONG'),x=>x.xmlLines.push({...x.xmlLines[0],lineNumber:2}),x=>x.xmlLines[0].quantity=1,x=>x.xmlLines[0].vatAmount=2.95,x=>x.xmlLines[0].lineNumber=2,x=>x.totalGross=25.74,x=>x.pageCount=2,x=>x.profile='UNSUPPORTED',x=>x.text=headers+'\n'+x.text];
  for (const change of variants) { const value=input(); change(value); assert.equal(parse(value),null); }
});
test('untrusted, unbounded and malformed decimals never produce verified economics', () => {
  for (const value of [null,{}, {...input(),text:'x'.repeat(200001)}, {...input(),xmlLines:Array(251).fill(xmlLines[0])}]) assert.equal(parse(value),null);
  for (const bad of [NaN,Infinity,-1,'1e3','22.77001']) {const value=input();value.xmlLines[0].netValue=bad;assert.equal(parse(value),null);}
});

test('explicit printed zero is retained without inventing a discount', () => {
  const value=input();
  value.text=value.text.replaceAll('14,43','0,00').replaceAll('22,77','37,20').replaceAll('2,96','4,84').replaceAll('25,73','42,04');
  value.xmlLines[0].netValue=37.2;value.xmlLines[0].vatAmount=4.84;
  value.totalNet=37.2;value.totalVat=4.84;value.totalGross=42.04;
  const result=parse(value);assert.ok(result);assert.equal(result.rows[0].discount1,'0.00000000');
  assert.deepEqual(result.rows[0].printedDiscountSteps,[{kind:'LINE_AMOUNT',amount:'0.00'}]);
  value.text+='\nΈκπτωση\n0,00EUR';assert.equal(parse(value),null);
});
