import test from 'node:test';
import assert from 'node:assert/strict';
import {ALFA19_PROFILE,parseAlfa19PrintedLineEconomics as parse} from '../src/lib/mydata-printed-line-economics-alfa19.js';
import {printedEconomicsProfileForUrl,parseMyDataPrintedLineEconomics} from '../src/lib/mydata-printed-line-economics.js';
const HEADERS=['ΚΩΔΙΚΟΣ','ΠΕΡΙΓΡΑΦΗ','Μ.Μ','ΠΟΣΟΤ.','ΚΥΤΙΟ','Μ.Μ','ΠΟΣΟΤ.','ΤΕΜ.','ΤΙΜΗ','ΜΟΝΑΔΑΣ','ΑΞΙΑ(ΠΡΟ','ΕΚΠΤΩΣΗΣ)','ΕΚΠΤΩΣΗ 1','%','ΠΟΣΟ','ΕΚΠΤΩΣΗ 2','%','ΠΟΣΟ','ΕΚΠΤΩΣΗ 3','%','ΠΟΣΟ','ΕΠΙΒΑΡ','ΑΞΙΑ ΜΕΤΑ','ΤΗΝ','ΕΚΠΤ.','ΦΠΑ','ΦΟΡΟΥ','%'];
const greek=n=>Number(n).toFixed(2).replace('.',',');
test('ALFA dispatcher requires the exact supported provider PDF URL and closed profile',()=>{
  const url='https://epsilondigital19.epsilonnet.gr/fd/'+ 'a'.repeat(32)+':177/pdf';
  assert.equal(printedEconomicsProfileForUrl(url),ALFA19_PROFILE);
  for(const changed of [url.replace('19.','18.'),url.replace(':177',':159'),url.replace('https:','http:'),url+'?download=1',url+'#pdf',url.replace('/pdf',''),url.replace('/fd/','/FD/'),url.replace('https://','https://user@')])assert.equal(printedEconomicsProfileForUrl(changed),null);
  assert.deepEqual(parseMyDataPrintedLineEconomics(fixture()),parse(fixture()));
  assert.equal(parseMyDataPrintedLineEconomics({...fixture(),profile:'UNSUPPORTED'}),null);
});
// Public synthetic economics only: no real invoice IDs, source URLs, product
// codes/descriptions or customer identity. XML order intentionally differs.
function fixture(){
  const rows=Array.from({length:23},(_,i)=>({code:'DL'+String(9000001+i),q:5,price:1.4,initial:7,amount1:1,amount2:1,net:5,vat:.65}));
  Object.assign(rows[0],{q:10,price:1.49,initial:14.9,amount1:2.46,amount2:1.49,net:10.95,vat:1.43});
  Object.assign(rows[1],{q:10,price:1.49,initial:14.9,amount1:2.46,amount2:1.49,net:10.95,vat:1.42});
  Object.assign(rows[2],{q:5,price:2.43,initial:12.15,amount1:1.77,amount2:1.56,amount3:.69,net:8.13,vat:1.06,unit:'DIS',firstQ:.36});
  Object.assign(rows[21],{q:10,price:2,initial:20,amount1:2,amount2:3,net:15,vat:1.95});
  Object.assign(rows[22],{q:10,price:2.462,initial:24.62,amount1:5,amount2:5.81,net:13.81,vat:1.79});
  const xmlOrder=[...rows.slice(-4),...rows.slice(0,-4)];
  const xmlLines=xmlOrder.map((r,i)=>({lineNumber:i+1,itemCode:r.code,description:'SYNTHETIC PRODUCT '+(i+1),quantity:r.q,measurementUnit:1,netValue:r.net,vatCategory:2,vatAmount:r.vat}));
  const rowTokens=r=>['0,00','0,00','0,00',greek(r.amount1),...(r.amount3===undefined?[]:[greek(r.amount3)]),greek(r.net),'13',greek(r.amount2),r.code,r.unit||'ΤΕΜ',r.price.toFixed(4).replace('.',','),greek(r.initial),greek(r.firstQ??r.q),String(r.q),'ΤΕΜ','SYNTHETIC PRODUCT'];
  const tokens=['SYNTHETIC DOCUMENT',...HEADERS,'SYNTHETIC TABLE',...rows.flatMap(rowTokens),'148,84','ΣΕ ΜΕΤΑΦΟΡΑ',':',...HEADERS,'148,84','ΑΠΟ','ΜΕΤΑΦΟΡΑ :','.',String(rows.reduce((n,r)=>n+r.q,0)),'148,84`','`','0,00','0,00','ΣΥΝ.ΠΟΣΟΤΗΤΑ:','ΠΡΟΗΓ.ΥΠΟΛΟΙΠΟ:','ΝΕΟ ΥΠΟΛΟΙΠΟ:','ΚΑΘΑΡΗ ΑΞΙΑ','% ΦΠΑ','ΑΞΙΑ','ΦΠΑ','ΑΝΑΛΥΣΗ Φ.Π.Α.','13,00`','19,35`','0,00`','0,00`','ΕΚΠΤΩΣΕΙΣ','212,57','148,84','19,35','168,19','168,19','63,73','Α Ξ Ι Α','ΕΠΙΒΑΡΥΝΣΕΙΣ','ΦΟΡΟΛ. ΑΞΙΑ','ΕΚΔΟΤΗΣ','ΠΑΡΑΛΗΠΤΗΣ','ΦΠΑ','ΣΥΝΟΛΟ','ΛΗΦΘ.ΕΓΓΥΗΣΗ','ΓΕΝ.ΣΥΝΟΛΟ','ΤΕΛΙΚΗ ΑΞΙΑ','168,19'];
  return {text:tokens.join('\n'),xmlLines,totalNet:'148.84',totalVat:'19.35',totalGross:'168.19',pageCount:2,profile:ALFA19_PROFILE};
}

test('23 unique physical rows bind by exact code to XML order and retain typed sequential amount slots',()=>{
  const result=parse(fixture());assert.ok(result);assert.equal(result.rows.length,23);
  const first=result.rows.find(r=>r.physicalLineNumber===1);assert.equal(first.lineNumber,5);
  assert.equal(first.unitCost,'1.490000');assert.equal(first.initialUnitCost,'1.490000');
  assert.equal(first.discount1,'16.51006711');assert.equal(first.discount2,'11.97749196');assert.equal(first.discount3,'0.00000000');
  assert.deepEqual(first.printedDiscountSteps,[{kind:'LINE_AMOUNT',amount:'2.46',slot:1},{kind:'LINE_AMOUNT',amount:'1.49',slot:2}]);
  const third=result.rows.find(r=>r.physicalLineNumber===3);
  assert.deepEqual(third.printedDiscountSteps,[{kind:'LINE_AMOUNT',amount:'1.77',slot:1},{kind:'LINE_AMOUNT',amount:'1.56',slot:2},{kind:'LINE_AMOUNT',amount:'0.69',slot:3}]);
  assert.equal(third.discount3,'7.82312925');assert.equal(third.quantity,'5.000000');
  assert.deepEqual(result.totals,{initial:'212.57',discount:'63.73',net:'148.84',vat:'19.35',gross:'168.19'});
});

test('XML VAT allocation is preserved within exact floor/ceil and complete printed group agreement',()=>{
  const input=fixture(),result=parse(input);assert.ok(result);
  assert.deepEqual(result.rows.filter(r=>r.netValue==='10.95').map(r=>r.vatAmount).sort(),['1.42','1.43']);
  const a=input.xmlLines.find(r=>r.itemCode==='DL9000001'),b=input.xmlLines.find(r=>r.itemCode==='DL9000002');
  a.vatAmount=1.44;b.vatAmount=1.41;assert.equal(parse(input),null,'preserved total cannot legitimize out-of-bound cent allocations');
  const allHalfUp=fixture();allHalfUp.xmlLines.find(r=>r.itemCode==='DL9000001').vatAmount=1.42;
  assert.equal(parse(allHalfUp),null,'independent rounding must not replace source allocation or printed group');
});

test('two quantity columns never imply a packaging factor or a price basis conversion',()=>{
  const input=fixture(),value=parse(input);assert.ok(value);
  assert.equal(value.rows.find(r=>r.itemCode==='DL9000003').quantity,'5.000000');
  input.xmlLines.find(r=>r.itemCode==='DL9000003').quantity=.36;assert.equal(parse(input),null);
  for(const replacement of ['ΚΙΒ','PACKAGE']){const x=fixture();x.text=x.text.replace('\nDIS\n','\n'+replacement+'\n');assert.equal(parse(x),null);}
  const inconsistent=fixture();inconsistent.text=inconsistent.text.replace('0,36\n5\nΤΕΜ','0,36\n6\nΤΕΜ');assert.equal(parse(inconsistent),null);
  const wrongBasis=fixture();wrongBasis.text=wrongBasis.text.replace('\nDIS\n','\nΤΕΜ\n');assert.equal(parse(wrongBasis),null);
});

test('row set, unique code, description, type and arithmetic ambiguities fail closed',()=>{
  const mutations=[
    x=>x.xmlLines.pop(),x=>x.xmlLines.push({...x.xmlLines[0],lineNumber:24}),x=>x.xmlLines[0].itemCode=x.xmlLines[1].itemCode,
    x=>x.xmlLines[0].lineNumber=2,x=>x.xmlLines[0].measurementUnit=7,x=>x.xmlLines[0].vatCategory=1,
    x=>x.xmlLines[0].netValue+=.01,x=>x.xmlLines[0].description='',x=>x.xmlLines[0].quantity=NaN,
    x=>x.text=x.text.replace('DL9000001','ZZ9000001'),x=>x.text=x.text.replace('DL9000002','DL9000001'),
    x=>x.text=x.text.replace('2,46\n10,95','2,45\n10,95'),x=>x.text=x.text.replace('0,00\n0,00\n0,00','1,00\n0,00\n0,00'),
    x=>x.text=x.text.replace('1,4900','1,4900001'),x=>x.text=x.text.replace('1,4900','14900'),
    x=>x.text=x.text.replace('SYNTHETIC PRODUCT','99,99'),x=>x.text=x.text.replace('SYNTHETIC PRODUCT','x'.repeat(251)),
  ];
  for(const mutate of mutations){const x=fixture();mutate(x);assert.equal(parse(x),null);}
});

test('both pages, carry, tax group and document footer must be complete and unambiguous',()=>{
  const mutations=[x=>x.pageCount=1,x=>x.pageCount=3,x=>x.profile='E_INVOICING_DETAILED_LINE_AMOUNT_V1',
    x=>x.text=x.text.replace('ΣΕ ΜΕΤΑΦΟΡΑ','CARRY'),x=>x.text=x.text.replace('ΜΕΤΑΦΟΡΑ :','CARRY'),
    x=>x.text=x.text.replace('148,84\nΣΕ ΜΕΤΑΦΟΡΑ','148,85\nΣΕ ΜΕΤΑΦΟΡΑ'),
    x=>x.text=x.text.replace('135\n148,84`','136\n148,84`'),x=>x.text=x.text.replace('148,84`','148,85`'),
    x=>x.text=x.text.replace('13,00`','24,00`'),x=>x.text=x.text.replace('19,35`','19,34`'),
    x=>x.text=x.text.replace('63,73','63,72'),x=>x.text=x.text.replace('ΦΟΡΟΛ. ΑΞΙΑ','TAXABLE'),
    x=>x.text+='\nΤΕΛΙΚΗ ΑΞΙΑ\n168,19',x=>x.text+='\n'+HEADERS.join('\n'),
    x=>x.text=x.text.replace('ΕΚΠΤΩΣΕΙΣ','DISCOUNT'),x=>x.totalGross='168.20',
  ];
  for(const mutate of mutations){const x=fixture();mutate(x);assert.equal(parse(x),null);}
});

test('bounded malformed inputs and unsupported layouts never throw or become confirmed',()=>{
  for(const x of [null,{}, {...fixture(),text:'x'.repeat(200001)},{...fixture(),xmlLines:Array(251).fill(fixture().xmlLines[0])},
    {...fixture(),totalNet:'1e3'},{...fixture(),totalVat:-1},{...fixture(),totalGross:Infinity}])assert.equal(parse(x),null);
});
