import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import {extractAzureColumns,combineAzureRows,inferConfirmedColumns,applyConfirmedColumns,sourceOrder} from '../src/lib/invoice-column-reading.js';
import {learnCentralInvoiceCorrection} from '../src/lib/invoice-correction-learning.js';
import {reconcileAzureInvoice} from '../src/lib/invoice-azure-reconciler.js';
import {finalizeV244ProductLines} from '../../client/src/lib/invoice-v244-safe.js';

const headers=['ΚΩΔΙΚΟΣ','ΠΕΡΙΓΡΑΦΗ','ΛΙΑΝΙΚΗ ΤΙΜΗ','Μ.Μ.','ΠΟΣΟΤΗΤΑ','ΤΙΜΗ ΜΟΝΑΔΑΣ','ΑΞΙΑ ΠΡΟ ΕΚΠΤΩΣΗΣ','ΕΚΠΤΩΣΗ %','ΕΚΠΤΩΣΗ ΠΟΣΟ','ΑΞΙΑ ΜΕΤΑ ΤΗΝ ΕΚΠΤΩΣΗ','ΦΠΑ'];
const decimal=n=>String(n).replace('.',',');
function table(labels,rows,page=1){
  return {boundingRegions:[{pageNumber:page}],cells:[
    ...labels.map((content,columnIndex)=>({kind:'columnHeader',rowIndex:0,columnIndex,content})),
    ...rows.flatMap((values,index)=>values.map((value,columnIndex)=>({rowIndex:index+1,columnIndex,content:String(value),boundingRegions:[{pageNumber:page,polygon:[0,index+1,1,index+1,1,index+2,0,index+2]}]})))
  ]};
}
const fixture=JSON.parse(await readFile(new URL('./fixtures/invoice-printed-column-economics.json',import.meta.url),'utf8'));
const fixtureRows=rows=>rows.map(([code,q,retail,cost,net])=>[code,`ΠΡΟΪΟΝ ${code}`,decimal(retail),'TEM',q,decimal(cost),decimal(net),0,0,decimal(net),0]);

test('38 printed rows keep retail, purchase precision, quantities and page order through reconciliation and POS handoff',()=>{
  const tables=fixture.map((rows,page)=>table(headers,fixtureRows(rows),page+1));
  tables[0].cells.push(...headers.map((_,columnIndex)=>({rowIndex:25,columnIndex,content:columnIndex===1?'Σε μεταφορά':columnIndex===9?'1.492,20':''})));
  const extracted=extractAzureColumns({tables}).map(line=>({...line,confidence:93}));
  const wrongItems=[...extracted].reverse().map(line=>({...line,quantity:line.retailPrice,retailPrice:0,sourceColumnsVerified:false}));
  const parsed=reconcileAzureInvoice({supplier:{},totalGross:2369.99,productLines:combineAzureRows(wrongItems,extracted)});
  const lines=finalizeV244ProductLines(parsed.productLines);
  assert.equal(lines.length,38);
  assert.deepEqual(lines.map(l=>[l.code,l.quantity,l.retailPrice,l.unitCost,l.netAmount]),fixture.flat());
  assert.equal(lines.reduce((sum,l)=>sum+l.quantity,0),608);
  assert.equal(Math.round(lines.reduce((sum,l)=>sum+l.grossAmount,0)*100)/100,2369.99);
  assert.equal(parsed.reconciliation.totalDifference,0);
});

test('unrelated supplier layout uses printed English headers, three discounts and amount-only discounts',()=>{
  const result=extractAzureColumns({tables:[table(['Description','Qty','Unit price','Discount1','Discount2','Discount3','Net amount','Retail price','VAT'],[['SAMPLE',10,2,10,5,2,16.758,3,24]])]});
  assert.equal(result[0].sourceColumnsVerified,true);
  assert.equal(result[0].quantity,10);assert.equal(result[0].retailPrice,3);
  assert.deepEqual([result[0].discount1,result[0].discount2,result[0].discount3],[10,5,2]);
  const [amount]=extractAzureColumns({tables:[table(['Description','Qty','Unit cost','Discount amount','Net value'],[['OTHER',10,2,5,15]])]});
  assert.equal(amount.discount1,25);assert.equal(amount.sourceColumnsVerified,true);
  assert.equal(finalizeV244ProductLines([amount])[0].netAmount,15);
});

test('identical supplier codes on separate physical rows remain separate',()=>{
  const rows=extractAzureColumns({tables:[table(headers,fixtureRows([fixture[0][0],fixture[0][0]])),table(headers,fixtureRows([fixture[0][0]]),2)]});
  assert.equal(finalizeV244ProductLines(rows).length,3);
});

const corrected={supplierCode:'01669',description:'MARLBORO RED',quantity:20,unitCost:4.56991,proposedSalePrice:4.8,netAmount:91.3982,invoiceUnit:'PIECE',stockUnitsPerInvoiceUnit:1,ocrRawText:'01669 MARLBORO RED 4,80000 TEM 20 4,56991 91,40 0 0 91,40 0'};
test('a correction learns offsets and reads different quantities and prices from the next invoice',()=>{
  const columns=inferConfirmedColumns(corrected.ocrRawText,corrected);
  assert.deepEqual(columns,{quantity:1,unitCost:2,retailPrice:-1});
  const next={rawText:'01669 MARLBORO RED 5,10 TEM 30 4,75 142,50 0 0 142,50 0',quantity:5.1,unitCost:1,retailPrice:0,netAmount:142.5};
  const applied=applyConfirmedColumns(next,columns);
  assert.equal(applied.quantity,30);assert.equal(applied.unitCost,4.75);assert.equal(applied.retailPrice,5.1);
  assert.equal(applied.sourceColumnsVerified,true);
  assert.equal(applyConfirmedColumns({...next,netAmount:140},columns).quantity,5.1);
  assert.equal(inferConfirmedColumns(corrected.ocrRawText,{...corrected,quantity:4.8,netAmount:4.8*corrected.unitCost}),null);
});

function database(){
  let profileRow=null;const writes=[];
  return {writes,get profileRow(){return profileRow},
    async $queryRaw(strings,...values){const sql=strings.join('?');if(sql.includes('FROM "Supplier"'))return [{id:values[0],name:'SHARED SUPPLIER',taxId:'998878583'}];if(sql.includes('FROM "InvoiceSupplierReadingProfile"'))return profileRow?[profileRow]:[];throw new Error(sql)},
    async $executeRaw(strings,...values){const sql=strings.join('?');writes.push(sql);if(sql.includes('INSERT INTO "InvoiceSupplierReadingProfile"'))profileRow={supplierKey:values[0],profileVersion:values[4],profile:JSON.parse(values[5])};return 1}
  };
}
test('confirmed central knowledge works across companies without storing their product IDs or invoice economics',async()=>{
  const tx=database(),actor={id:'owner',role:'SUPER_ADMIN'};
  const first=await learnCentralInvoiceCorrection(tx,{actor,companyId:'company-a',supplierId:'supplier-a',line:{...corrected,productId:'private-product-a'}});
  assert.equal(first.columnsLearned,true);
  const second=await learnCentralInvoiceCorrection(tx,{actor,companyId:'company-b',supplierId:'supplier-b',line:{...corrected,stockUnitsPerInvoiceUnit:12,invoiceUnit:'PACKAGE',productId:'private-product-b'}});
  assert.equal(second.profileVersion,2);
  assert.equal(tx.profileRow.profile.mappings['01669'].unitsPerPackage,12);
  await learnCentralInvoiceCorrection(tx,{actor,companyId:'company-a',supplierId:'supplier-a',line:corrected});
  assert.equal(tx.profileRow.profile.mappings['01669'].unitsPerPackage,1);
  const stored=JSON.stringify(tx.profileRow.profile);
  assert.doesNotMatch(stored,/private-product|company-a|company-b|4\.56991|91\.3982|ocrRawText|proposedSalePrice/);
  assert.ok(tx.writes.every(sql=>!sql.includes('UPDATE "Product"')&&!sql.includes('PurchaseOrder')));
});
test('ordinary users do not publish global knowledge and missing identifiers do not create profiles',async()=>{
  const tx=database();
  assert.equal((await learnCentralInvoiceCorrection(tx,{actor:{role:'ADMIN'},companyId:'a',supplierId:'b',line:corrected})).learned,false);
  assert.equal(tx.writes.length,0);
  assert.equal((await learnCentralInvoiceCorrection(tx,{actor:{role:'SUPER_ADMIN'},companyId:'a',supplierId:'b',line:{...corrected,supplierCode:''}})).learned,false);
  assert.equal(tx.writes.length,0);
});

test('every reading entry point can consume the same supplier profile, including confirmed one-piece resets',async()=>{
  const tx=database();
  await learnCentralInvoiceCorrection(tx,{actor:{role:'SUPER_ADMIN'},companyId:'a',supplierId:'a',line:corrected});
  const source=await readFile(new URL('../src/lib/invoice-supplier-profile-runtime.js',import.meta.url),'utf8');
  const queries=[];
  const context=vm.createContext({applyConfirmedColumns,unitRelativeValues:(await import('../src/lib/invoice-column-reading.js')).unitRelativeValues,console,
    prisma:{$queryRawUnsafe:async(sql,tax)=>{queries.push(tax);return tax==='998878583'?[{...tx.profileRow,supplierTaxId:tax}]:[]}}});
  vm.runInContext(source.replace(/^import .*;\n/gm,'').replaceAll('export async function','async function')+'\nthis.apply=applyCentralSupplierProfile;',context);
  for(const companyId of ['a','b']){
    const result=await context.apply({companyId,supplier:{taxId:'998878583'},productLines:[{code:'01669',rawText:corrected.ocrRawText,quantity:4.8,unitCost:4.56991,netAmount:91.4,unitsPerPackage:20}]});
    assert.equal(result.productLines[0].quantity,20);
    assert.equal(result.productLines[0].unitsPerPackage,1);
    assert.equal(result.productLines[0].confirmedPackMapping,true);
  }
  const missing=await context.apply({supplier:{taxId:'999999999',name:'SHARED SUPPLIER'},productLines:[]});
  assert.equal(missing.supplierReadingProfile,null);
  assert.deepEqual(queries,['998878583','998878583','999999999']);
});

test('actual multipage recovery consumes repeated occurrences once and retains their printed order',async()=>{
  const source=await readFile(new URL('../src/routes/commerce-pos-ai-recheck.js',import.meta.url),'utf8');
  const context=vm.createContext({sourceOrder});
  vm.runInContext("const norm=v=>String(v||'').replace(/[^A-Z0-9]/gi,'');\n"+source.slice(source.indexOf('const normalizeProductLine='),source.indexOf('function mergeAzureInvoicePages'))+'\nthis.merge=mergeRecoveredLines;',context);
  const [a,b]=extractAzureColumns({tables:[table(headers,fixtureRows([fixture[0][0],['01669',10,4.8,4.56991,45.70]]))]});
  const actual=context.merge([{code:a.code,description:a.description,quantity:4.8},{code:a.code,description:a.description,quantity:4.8}],[a,b]);
  assert.equal(actual.length,2);assert.deepEqual(Array.from(actual,l=>l.quantity),[20,10]);
  assert.equal(actual[0].retailPrice,4.8);
});
