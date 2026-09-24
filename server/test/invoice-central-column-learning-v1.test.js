import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import {applyMantzilasPackaging,recoverMantzilasEconomics,recoverMixedVatFromPrintedSummary,extractAzureColumns,combineAzureRows,inferConfirmedColumns,applyConfirmedColumns,sourceOrder,recoverPrintedRetailColumns,recoverStefanidisFoodLine,recoverVatFromPrintedSummary,stockConversionFromDescription,unitRelativeValues} from '../src/lib/invoice-column-reading.js';
import {learnCentralInvoiceCorrection} from '../src/lib/invoice-correction-learning.js';
import {reconcileAzureInvoice} from '../src/lib/invoice-azure-reconciler.js';
import {finalizeV244ProductLines} from '../../client/src/lib/invoice-v244-safe.js';
import {buildCompletePrintedTableCandidate} from '../src/lib/invoice-discount-verifier.js';

const headers=['ΚΩΔΙΚΟΣ','ΠΕΡΙΓΡΑΦΗ','ΛΙΑΝΙΚΗ ΤΙΜΗ','Μ.Μ.','ΠΟΣΟΤΗΤΑ','ΤΙΜΗ ΜΟΝΑΔΑΣ','ΑΞΙΑ ΠΡΟ ΕΚΠΤΩΣΗΣ','ΕΚΠΤΩΣΗ %','ΕΚΠΤΩΣΗ ΠΟΣΟ','ΑΞΙΑ ΜΕΤΑ ΤΗΝ ΕΚΠΤΩΣΗ','ΦΠΑ'];
const decimal=n=>String(n).replace('.',',');
function table(labels,rows,page=1){
  return {boundingRegions:[{pageNumber:page}],cells:[
    ...labels.map((content,columnIndex)=>({kind:'columnHeader',rowIndex:0,columnIndex,content})),
    ...rows.flatMap((values,index)=>values.map((value,columnIndex)=>({rowIndex:index+1,columnIndex,content:String(value),boundingRegions:[{pageNumber:page,polygon:[0,index+1,1,index+1,1,index+2,0,index+2]}]})))
  ]};
}
const fixture=JSON.parse(await readFile(new URL('./fixtures/invoice-printed-column-economics.json',import.meta.url),'utf8'));
const stefanidisSeed=await readFile(new URL('../src/seed-invoice-profile-dimotsios.js',import.meta.url),'utf8');
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

test('checkpoint-verified STEFANIDIS layout is seeded centrally without old invoice economics',()=>{
  assert.match(stefanidisSeed,/STEFANIDIS_PRINTED_COLUMNS/);
  assert.match(stefanidisSeed,/CHECKPOINT_VERIFIED_2612188/);
  assert.match(stefanidisSeed,/"1,2,3,4,5,6,7,-1":\{quantity:1,unitCost:2,retailPrice:-1\}/);
  assert.doesNotMatch(stefanidisSeed,/2369\.99|608/);
});

test('FRESH SNACK profile requires a current-image complete-table reread, not historical prices',async()=>{
  const seed=await readFile(new URL('../src/lib/invoice-learning-fresh-snack-seed.js',import.meta.url),'utf8');
  const route=await readFile(new URL('../src/routes/commerce-pos-ai-recheck.js',import.meta.url),'utf8');
  assert.match(seed,/supplierTaxId:'999162880'/);
  assert.doesNotMatch(seed,/supplierTaxId:'099162880'/);
  assert.match(seed,/requireCompletePrintedTableOnMismatch:true/);
  assert.match(seed,/CURRENT_IMAGE_ROWS_PLUS_VAT_FOOTER_PLUS_TOTAL/);
  assert.doesNotMatch(seed,/99\.99|68\.12|SPECIAL BOLIKO|TIME OUT/);
  assert.match(route,/supplierRequiresCompletePrintedTable/);
  assert.match(route,/reverifyAll:completePrintedTable/);
  assert.match(route,/expectedGrossTotal:completePrintedTable&&pageJobs\.length===1\?invoiceTotal:0/);
});

test('FRESH DELICACIES profile requires a current-image complete-table reread, not BB 6439 economics',async()=>{
  const seed=await readFile(new URL('../src/lib/invoice-learning-fresh-delicacies-seed.js',import.meta.url),'utf8');
  const route=await readFile(new URL('../src/routes/commerce-pos-ai-recheck.js',import.meta.url),'utf8');
  assert.match(seed,/FRESH_DELICACIES_COMPLETE_PRINTED_TABLE/);
  assert.match(seed,/requireCompletePrintedTableOnMismatch:true/);
  assert.match(seed,/CURRENT_IMAGE_ROWS_PLUS_VAT_FOOTER_PLUS_TOTAL/);
  assert.doesNotMatch(seed,/57\.86|51\.20|4\.20|G09\.00938/);
  assert.match(route,/FRESH_DELICACIES_COMPLETE_PRINTED_TABLE/);
});

test('STEFANIDIS food layout restores shifted columns only when the printed row equations balance',()=>{
  const rows=[
    ['0011291 MENTOS STORMING ΚΑΡΠΟΥΖΙ 12TMX | ΚΟΥ | 1 | 9,910 | 9,91 | 30,00 | 2,97 | | 6,94 | 13',1,9.91,6.94],
    ['0010457 MENTOS SOUR TONES ΜΑΣΟΥΡΙ | ΤΕΜ | 72 | 1,190 | 85,68 | 37,00 | 31,70 | | 53,98 | 13',72,1.19,53.98],
    ['0022544 RED BULL M.A RED EDITION 24x250ml | ΤΕΜ | 24 | 1,190 | 28,56 | 30,00 | 8,57 | | 19,99 | 13',24,1.19,19.99],
    ['0022501 OFFER RED BULL 5 ΚΙΒΩΤΙΑ 250ml +7% | ΚΙΒ | 1 | 0,010 | 0,01 | 0 | 0,01 | 13',1,.01,.01]
  ];
  for(const [rawText,quantity,unitCost,netAmount] of rows){
    const recovered=recoverStefanidisFoodLine({rawText,quantity:unitCost,unitCost:netAmount/quantity,netAmount:99,vatRate:0});
    assert.equal(recovered.quantity,quantity);assert.equal(recovered.unitCost,unitCost);assert.equal(recovered.netAmount,netAmount);assert.equal(recovered.vatRate,13);
    assert.equal(recovered.sourceColumnsVerified,true);
  }
  const carton=recoverStefanidisFoodLine({rawText:rows[0][0],description:'MENTOS STORMING ΚΑΡΠΟΥΖΙ 12TMX'});
  assert.equal(carton.invoiceUnit,'PACKAGE');assert.equal(carton.unitsPerPackage,12);assert.equal(carton.quantity*carton.unitsPerPackage,12);
  const gumCarton=recoverStefanidisFoodLine({rawText:'00414 DENTYNE FIRE ΚΑΝΕΛΑ 16,8g x14t | ΚΟΥ | 1 | 11,630 | 11,63 | 30 | 3,49 | 8,14 | 13'});
  assert.equal(gumCarton.invoiceUnit,'PACKAGE');assert.equal(gumCarton.unitsPerPackage,14);assert.equal(gumCarton.quantity*gumCarton.unitsPerPackage,14);
  const unknownCarton=recoverStefanidisFoodLine({rawText:'00924 MENTOS FRUIT ΜΑΣΟΥΡΙ | ΚΟΥ | 1 | 13,830 | 13,83 | 30 | 4,15 | 9,68 | 13'});
  assert.equal(unknownCarton.invoiceUnit,'PACKAGE');assert.equal(unknownCarton.unitsPerPackage,0);assert.equal(unknownCarton.packSizeNeedsReview,true);
  const pieces=recoverStefanidisFoodLine({rawText:'0022535 RED BULL 24x355ml | TEM | 24 | 1,580 | 37,92 | 33 | 12,51 | 25,41 | 13'});
  assert.equal(pieces.invoiceUnit,'PIECE');assert.equal(pieces.unitsPerPackage,1,'24x355ml is a size, not a carton multiplier');
  const unsafe={rawText:'0022544 PRODUCT | TEM | 24 | 1,190 | 30,00 | 30 | 8,57 | 19,99 | 13',quantity:7,unitCost:3,netAmount:21};
  assert.equal(recoverStefanidisFoodLine(unsafe),unsafe);
  assert.match(stefanidisSeed,/997763585/);assert.match(stefanidisSeed,/STEFANIDIS_FOOD_PRINTED_COLUMNS/);
});

test('explicit product descriptions convert coffee and chocolate to grams and cups to pieces',()=>{
  assert.deepEqual(stockConversionFromDescription('MRS ROSE ESPRESSO 3KGR. CLASSIC TIN'),{multiplier:3000,stockMeasure:'GRAM',inferred:true});
  assert.deepEqual(stockConversionFromDescription('IL MODO ESPRESSO DECAF. ΑΚΟΠΟΣ 1kg'),{multiplier:1000,stockMeasure:'GRAM',inferred:true});
  assert.deepEqual(stockConversionFromDescription('DELIZ PREMIUM Ρόφημα Σοκολάτας 1Kgr'),{multiplier:1000,stockMeasure:'GRAM',inferred:true});
  assert.deepEqual(stockConversionFromDescription('MRS ROSE ΠΟΤΗΡΙ ΠΛΑΣΤΙΚΟ 12OZ (100 TEM.)'),{multiplier:100,stockMeasure:'PIECE',inferred:true});
  assert.deepEqual(stockConversionFromDescription('MRS ROSE ΠΟΤΗΡΙ ΠΛΑΣΤΙΚΟ 12OZ (100 ΤΕΜ.)'),{multiplier:100,stockMeasure:'PIECE',inferred:true});
  assert.equal(stockConversionFromDescription('RED BULL 24x355ml').multiplier,0);
  assert.deepEqual(stockConversionFromDescription('MRS ROSE ESPRESSO 3KGR. CLASSIC TIN',3000,'ΚΙΛΑ'),{multiplier:1000,stockMeasure:'GRAM',inferred:true});
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
  tx.profileRow.profile.mappings['01669'].invoiceUnit='PACKAGE';
  tx.profileRow.profile.mappings['01669'].unitsPerPackage=20;
  const pieces=await context.apply({supplier:{taxId:'998878583'},productLines:[{code:'01669',unit:'TEM',quantity:30,unitCost:4.75,netAmount:142.5}]});
  assert.equal(pieces.productLines[0].unit,'TEM');
  assert.equal(pieces.productLines[0].unitsPerPackage,undefined);
});


test('manual supplier map accepts an inline printed unit with a safe piece fallback',async()=>{
  const runtime=await readFile(new URL('../src/lib/invoice-supplier-profile-runtime.js',import.meta.url),'utf8');
  const profile={supplierKey:'fresh-milk',supplierTaxId:'803151400',supplierName:'FRESH MILK LOGISTICS',profileVersion:1,ruleKey:'DECLARED_COLUMNS',readingRule:{layoutMode:'DECLARED_COLUMNS',defaultUnit:'ΤΜΧ',columns:{1:'SUPPLIER_CODE',2:'DESCRIPTION',3:'QUANTITY',4:'UNIT_PRICE',5:'DISCOUNT_1',6:'VAT_RATE',7:'AMOUNT_AFTER_DISCOUNT'}}};
  const context=vm.createContext({applyConfirmedColumns,unitRelativeValues,console,prisma:{$queryRawUnsafe:async()=>[{...profile,profile:{readingRule:profile.readingRule}}]}});
  vm.runInContext(runtime.replace(/^import .*;\n/gm,'').replaceAll('export async function','async function')+'\nthis.apply=applyCentralSupplierProfile;',context);
  const result=await context.apply({supplier:{taxId:'803151400'},productLines:[{rawText:'051 ΓΑΛΑ 3,7% ΕΠΙΛΕΓΜΕΝΟ ΟΛΥΜΠΟΥ 1LT ΤΕΜ 1 1,620 5 13 1,54',quantity:9,unitCost:9,netAmount:1.54}]});
  assert.equal(result.productLines[0].quantity,1);
  assert.equal(result.productLines[0].unitPrice,1.62);
  assert.equal(result.productLines[0].invoiceUnit,'ΤΕΜ');
  assert.equal(result.productLines[0].supplierProfileRule,'DECLARED_COLUMNS');
});

test('TALOS manual map overrides a shifted provider map without changing learned mappings',async()=>{
  const runtime=await readFile(new URL('../src/lib/invoice-supplier-profile-runtime.js',import.meta.url),'utf8');
  const mappings={3759850:{barcode:'5200000000000',verified:true}};
  const profile={supplierKey:'800802293',supplierTaxId:'800802293',supplierName:'ΤΑΛΩΣ ΑΕ',profileVersion:4,ruleKey:'DECLARED_COLUMNS',mappings,readingRule:{layoutMode:'DECLARED_COLUMNS',quantityMode:'LINE_TOTAL_MATCH',columns:{1:'SUPPLIER_CODE',2:'DESCRIPTION',3:'UNIT',4:'QUANTITY',5:'UNIT_PRICE',6:'AMOUNT_BEFORE_DISCOUNT',7:'RETAIL_PRICE',8:'DISCOUNT_1',9:'IGNORE',10:'AMOUNT_AFTER_DISCOUNT',11:'VAT_RATE',12:'IGNORE'}}};
  const context=vm.createContext({applyConfirmedColumns,unitRelativeValues,console,prisma:{$queryRawUnsafe:async()=>[{...profile,profile:{readingRule:profile.readingRule,mappings}}]}});
  vm.runInContext(runtime.replace(/^import .*;\n/gm,'').replaceAll('export async function','async function')+'\nthis.apply=applyCentralSupplierProfile;',context);
  const result=await context.apply({supplier:{taxId:'800802293'},productLines:[{code:'3759850',azureRawRow:'3759850 MI OREO COOKIES 66GX20CA TEM 6 0.78 4.68 11.50 18.00 1.28 3.40 13',quantity:.78,unitPrice:4.68,unitCost:4.68,netAmount:11.5,sourceColumnMap:true}]});
  const line=result.productLines[0];
  assert.equal(line.quantity,6);assert.equal(line.unitPrice,.78);assert.equal(line.netAmount,3.4);assert.equal(line.discount1,18);assert.equal(line.vatRate,13);assert.equal(line.invoiceUnit,'TEM');assert.equal(line.supplierProfileRule,'DECLARED_COLUMNS_VERIFIED_SUFFIX');
  assert.equal(line.barcode,'5200000000000');assert.deepEqual(mappings,{3759850:{barcode:'5200000000000',verified:true}});
});


test('manual no-unit map repairs only a source-proven lost decimal separator',async()=>{
  const runtime=await readFile(new URL('../src/lib/invoice-supplier-profile-runtime.js',import.meta.url),'utf8');
  const profile={supplierTaxId:'803151400',readingRule:{layoutMode:'DECLARED_COLUMNS',defaultUnit:'ΤΜΧ',columns:{1:'SUPPLIER_CODE',2:'DESCRIPTION',3:'QUANTITY',4:'UNIT_PRICE',5:'DISCOUNT_1',6:'VAT_RATE',7:'AMOUNT_AFTER_DISCOUNT'}}};
  const context=vm.createContext({applyConfirmedColumns,unitRelativeValues,console,prisma:{$queryRawUnsafe:async()=>[{...profile,profile:{readingRule:profile.readingRule}}]}});
  vm.runInContext(runtime.replace(/^import .*;\n/gm,'').replaceAll('export async function','async function')+'\nthis.apply=applyCentralSupplierProfile;',context);
  const result=await context.apply({supplier:{taxId:'803151400'},productLines:[{rawText:'051 ΓΑΛΑ 3,7% ΕΠΙΛΕΓΜΕΝΟ ΟΛΥΜΠΟΥ 1LT 1 1620 5 13 1,54',quantity:1,unitCost:1620,netAmount:1.54}]});
  assert.equal(result.productLines[0].quantity,1);
  assert.equal(result.productLines[0].unitPrice,1.62);
  assert.equal(result.productLines[0].netAmount,1.54);
  assert.equal(result.productLines[0].vatRate,13);
  assert.equal(result.productLines[0].supplierProfileRule,'DECLARED_COLUMNS_TAIL_RECONCILED');
});

test('TALOS declared suffix preserves printed net and reconstructs one omitted quantity',async()=>{
  const runtime=await readFile(new URL('../src/lib/invoice-supplier-profile-runtime.js',import.meta.url),'utf8');
  const columns={1:'SUPPLIER_CODE',2:'DESCRIPTION',3:'UNIT',4:'QUANTITY',5:'UNIT_PRICE',6:'AMOUNT_BEFORE_DISCOUNT',7:'RETAIL_PRICE',8:'DISCOUNT_1',9:'IGNORE',10:'AMOUNT_AFTER_DISCOUNT',11:'VAT_RATE',12:'IGNORE'};
  const profile={supplierTaxId:'800802293',readingRule:{layoutMode:'DECLARED_COLUMNS',columns}};
  const context=vm.createContext({applyConfirmedColumns,unitRelativeValues,console,prisma:{$queryRawUnsafe:async()=>[{...profile,profile:{readingRule:profile.readingRule}}]}});
  vm.runInContext(runtime.replace(/^import .*;\n/gm,'').replaceAll('export async function','async function')+'\nthis.apply=applyCentralSupplierProfile;',context);
  const result=await context.apply({supplier:{taxId:'800802293'},productLines:[
    {azureRawRow:'4322626 ΣΟΚ. LACTA ΟΛΟΚΛ ΦΟΥΝΤ BAR 45G X30 TEM 6 1.06 6.36 15.00 18.00 1.93 4.43 13',quantity:6,unitPrice:1.06,netAmount:5.22,vatRate:13},
    {azureRawRow:'4286951 FIN MIN.STIC ΦΟΥ 100GX10 TEM 1.68 16.80 17.80 18.00 5.48 11.32 13',quantity:0,unitPrice:10,netAmount:0,vatRate:0}
  ]});
  const [complete,omitted]=result.productLines;
  assert.deepEqual([complete.quantity,complete.unitPrice,complete.netAmount,complete.netUnitCost,complete.vatRate],[6,1.06,4.43,.7383,13]);
  assert.equal(complete.supplierProfileRule,'DECLARED_COLUMNS_VERIFIED_SUFFIX');
  assert.deepEqual([omitted.quantity,omitted.unitPrice,omitted.netAmount,omitted.netUnitCost,omitted.vatRate],[10,1.68,11.32,1.132,13]);
  assert.equal(omitted.supplierProfileEvidence.quantityInferred,true);
});

test('TALOS unordered Azure cells recover one uniquely balanced physical row',async()=>{
  const runtime=await readFile(new URL('../src/lib/invoice-supplier-profile-runtime.js',import.meta.url),'utf8');
  const columns={1:'SUPPLIER_CODE',2:'DESCRIPTION',3:'UNIT',4:'QUANTITY',5:'UNIT_PRICE',6:'AMOUNT_BEFORE_DISCOUNT',7:'RETAIL_PRICE',8:'DISCOUNT_1',9:'IGNORE',10:'AMOUNT_AFTER_DISCOUNT',11:'VAT_RATE',12:'IGNORE'};
  const profile={supplierTaxId:'800802293',readingRule:{layoutMode:'DECLARED_COLUMNS',columns}};
  const context=vm.createContext({applyConfirmedColumns,unitRelativeValues,console,prisma:{$queryRawUnsafe:async()=>[{...profile,profile:{readingRule:profile.readingRule}}]}});
  vm.runInContext(runtime.replace(/^import .*;\n/gm,'').replaceAll('export async function','async function')+'\nthis.apply=applyCentralSupplierProfile;',context);
  const result=await context.apply({supplier:{taxId:'800802293'},productLines:[{azureRawRow:'4327325 EXTRA ΤΥΡΟΓΑΡ. ΤΥΡΙ 80GX20 TEM 1.67 4.28 13 0.85 5.95 18.30 12.00',quantity:0,unitPrice:1.67,netAmount:0,vatRate:0}]});
  const line=result.productLines[0];
  assert.deepEqual([line.quantity,line.unitPrice,line.netAmount,line.discount1,line.vatRate],[7,.85,4.28,12,13]);
  assert.equal(line.supplierProfileRule,'DECLARED_COLUMNS_UNORDERED_VERIFIED_SUFFIX');
});

test('Invoice Learning totals retain a source-proven printed line net',async()=>{
  const lab=await readFile(new URL('../../client/src/invoice-learning-lab-bootstrap.js',import.meta.url),'utf8');
  assert.match(lab,/printedNet=money\(line\.netValue\?\?line\.netAmount\)/);
  assert.match(lab,/printedNet\/quantity/);
  assert.match(lab,/\['quantity','unitPrice','discount1','discount2','discount3'\]\.includes\(changedKey\)/);
  assert.match(lab,/line\.supplierProfileRecovered\?rawQ/);
  assert.match(lab,/function verifiedTalosPrintedQuantity/);
  assert.match(lab,/!=='800802293'/);
  assert.match(lab,/const quantity=printedQ\?\?/);
  assert.match(lab,/invoiceQuantity:printedQ\?\?/);
  assert.match(lab,/const printed=verifiedTalosPrintedEconomics\(source,result\?\.supplierTaxId,result\?\.supplierName\)/);
  assert.match(lab,/if\(printed\)\{\s*applyVerifiedTalosPrintedEconomics\(draft,printed\);/);
  assert.match(lab,/metadataChecks\+\+<50/);
  assert.match(lab,/setTimeout\(applyAfterSupplierMetadata,100\)/);
  assert.match(lab,/verifiedTalosPrintedEconomics\(draft,taxId,supplierName\)/);
});

test('Invoice Learning accepts only mathematically proven TALOS printed quantities',async()=>{
  const lab=await readFile(new URL('../../client/src/invoice-learning-lab-bootstrap.js',import.meta.url),'utf8');
  const source=lab.match(/  function verifiedTalosPrintedQuantity[^\n]+/)?.[0];
  assert.ok(source);
  const context=vm.createContext({});
  vm.runInContext(`${source}\nthis.recover=verifiedTalosPrintedQuantity;`,context);
  assert.equal(context.recover({azureRawRow:'4266583 KAP HLS ΜΕΛΙ ΛΕΜΟΝΙ X/Z 32GX20 TEM 20.00 1.05 21.00 21.00 30.00 9.39 11.61 13'},'800802293'),20);
  assert.equal(context.recover({azureRawRow:'4266583 KAP HLS ΜΕΛΙ ΛΕΜΟΝΙ X/Z 32GX20 TEM 1.05 21.00 21.00 30.00 9.39 11.61 13'},'', 'ΤΑΛΩΣ ΑΕ'),20);
  assert.equal(context.recover({azureRawRow:'4323717 CHIPITA CHIPS ΑΛΑΤΙ 80GX20 TEM 6.12 18.40 12.00 1.73 4.39 13 1.02'},'', 'ΤΑΛΩΣ ΑΕ'),6);
  assert.equal(context.recover({azureRawRow:'4327325 EXTRA ΤΥΡΟΓΑΡ. ΤΥΡΙ 80GX20 TEM 1.67 4.28 13 0.85 5.95 18.30 12.00'},'800802293'),7);
  assert.equal(context.recover({azureRawRow:'4266583 KAP HLS TEM 20 1.05 99 21 30 9.39 11.61 13'},'800802293'),null);
  assert.equal(context.recover({azureRawRow:'4266583 KAP HLS TEM 20 1.05 21 21 30 9.39 11.61 13'},'999999999'),null);
});

test('Invoice Learning preserves the full verified TALOS printed economics',async()=>{
  const lab=await readFile(new URL('../../client/src/invoice-learning-lab-bootstrap.js',import.meta.url),'utf8');
  const source=lab.match(/  function verifiedTalosPrintedEconomics[^\n]+/)?.[0];
  assert.ok(source);
  const context=vm.createContext({});
  vm.runInContext(`${source}\nthis.recover=verifiedTalosPrintedEconomics;`,context);
  const line=context.recover({azureRawRow:'4323717 CHIPITA CHIPS ΑΛΑΤΙ 80GX20 TEM 6.12 18.40 12.00 1.73 4.39 13 1.02'},'', 'ΤΑΛΩΣ ΑΕ');
  assert.deepEqual({...line},{quantity:6,unitPrice:1.02,before:6.12,retail:18.4,discount1:12,discountAmount:1.73,netAmount:4.39,vatRate:13});
  assert.equal(context.recover({azureRawRow:'4323717 CHIPITA TEM 6.12 18.40 12.00 9.99 4.39 13 1.02'},'800802293'),null);
});

test('both column-map editors allow a missing unit and persist the piece fallback',async()=>{
  for(const file of ['../../client/src/invoice-learning-lab-bootstrap.js','../../client/src/invoice-learning-catalog-publication.js']){
    const source=await readFile(new URL(file,import.meta.url),'utf8');
    assert.ok(source.includes("['SUPPLIER_CODE','DESCRIPTION','QUANTITY','UNIT_PRICE']"));
    assert.ok(source.includes("defaultUnit:Object.values(columns).includes('UNIT')?null:'ΤΜΧ'"));
    assert.ok(source.includes('/api/platform/invoice-learning/supplier-profile/column-map'));
    assert.doesNotMatch(source,/κωδικό, περιγραφή, μονάδα, ποσότητα/);
  }
});

test('column-map save is target-only and cached rereads apply the latest central profile',async()=>{
  const workspace=await readFile(new URL('../src/routes/platform-invoice-learning-workspace.js',import.meta.url),'utf8');
  const ai=await readFile(new URL('../src/routes/platform-invoice-learning-ai.js',import.meta.url),'utf8');
  assert.match(workspace,/onlyTargetSupplierUpdated:true,existingLearningPreserved:true/);
  assert.match(workspace,/const profile=\{\.\.\.previous/);
  assert.match(ai,/cachedRead\?\.stableRead[\s\S]*applyCentralSupplierProfile\(structuredClone\(cachedRead\.winner\)\)/);
  assert.match(ai,/profileReapplied:true/);
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

test('POS recovery keeps printed occurrences separate and accepts explicit zero VAT',async()=>{
  const source=await readFile(new URL('../src/routes/commerce-pos-ai-recheck.js',import.meta.url),'utf8');
  const context=vm.createContext({sourceOrder});
  vm.runInContext("const norm=v=>String(v||'').replace(/[^A-Z0-9]/gi,'');\n"+source.slice(source.indexOf('const normalizeProductLine='),source.indexOf('function mergeAzureInvoicePages'))+'\nthis.merge=mergeRecoveredLines;',context);
  const original=[
    {code:'1140',description:'KARELIA S SLIMS',quantity:10,unitCost:3.862,netAmount:38.62,grossAmount:47.89,vatRate:24,sourceTable:0,sourceRow:1,sourcePage:1},
    {code:'1140',description:'KARELIA S SLIMS',quantity:10,unitCost:3.862,netAmount:38.62,grossAmount:47.89,vatRate:24,sourceTable:0,sourceRow:2,sourcePage:1}
  ];
  const recovered=[
    {code:'114O',description:'KARELIA S SLIMS',quantity:10,unitCost:3.862,netAmount:38.62,grossAmount:38.62,vatRate:0,sourceTable:0,sourceRow:1,sourcePage:1,sourceColumnsVerified:true},
    {code:'1140',description:'KARELIA S SLIMS',quantity:10,unitCost:3.862,netAmount:38.62,grossAmount:38.62,vatRate:0,sourceTable:0,sourceRow:2,sourcePage:1,sourceColumnsVerified:true}
  ];
  const result=context.merge(original,recovered);
  assert.equal(result.length,2);
  assert.deepEqual(Array.from(result,line=>line.sourceRow),[1,2]);
  assert.deepEqual(Array.from(result,line=>line.vatRate),[0,0]);
  assert.deepEqual(Array.from(result,line=>line.grossAmount),[38.62,38.62]);
  const unverified=context.merge([original[0]],[{...recovered[0],sourceColumnsVerified:false}]);
  assert.equal(unverified[0].vatRate,24,'an unverified provider default of zero cannot override printed VAT');
  assert.equal(unverified[0].grossAmount,47.89,'an unverified zero-VAT gross cannot be paired with 24%');
});

test('single-page adjacent OCR replay is collapsed only when the printed total corroborates one copy',async()=>{
  const source=await readFile(new URL('../src/routes/commerce-pos-ai-recheck.js',import.meta.url),'utf8');
  const context=vm.createContext({});
  vm.runInContext("const norm=v=>String(v||'').replace(/[^A-Z0-9]/gi,'');\nconst money2=v=>Math.round((Number(v||0)+Number.EPSILON)*100)/100;\nconst TOTAL_TOLERANCE=.05;\n"+source.slice(source.indexOf('const lineGrossTotal='),source.indexOf('const descriptionsClose='))+'\nthis.collapse=collapseAdjacentTableReplay;',context);
  const a={code:'340058891',description:'RUFFLES SALT',quantity:3,unitCost:1.42,netAmount:3.62,vatRate:13,grossAmount:4.09,discount1:15};
  const b={code:'34005661',description:"LAY'S BAKED SALT",quantity:3,unitCost:1.42,netAmount:3.62,vatRate:13,grossAmount:4.09,discount1:15};
  const replay=context.collapse([a,{...a},b,{...b}],8.18);
  assert.equal(replay.collapsed,true);assert.equal(replay.lines.length,2);assert.equal(replay.removed,2);
  const legitimate=context.collapse([a,{...a},b,{...b}],16.36);
  assert.equal(legitimate.collapsed,false);assert.equal(legitimate.lines.length,4);
  const coffee={code:'ES01000',description:'COFFEE 3KGR',quantity:36,unitCost:36.2,netAmount:856.85,vatRate:13,grossAmount:968.24};
  const cups={code:'FR1500',description:'CUPS 12OZ 100TEM',quantity:24,unitCost:5.3,netAmount:108.12,vatRate:24,grossAmount:134.07};
  const mixed=context.collapse([coffee,{...coffee},cups,{...cups}],1236.38);
  assert.equal(mixed.collapsed,true);assert.equal(mixed.genuineRepeatedRowPreserved,true);
  assert.deepEqual(Array.from(mixed.lines,line=>line.code),['ES01000','FR1500','FR1500']);
});

test('a reconciled Fresh Snack table drops only an unverified trailing replay of its own rows',async()=>{
  const source=await readFile(new URL('../src/routes/commerce-pos-ai-recheck.js',import.meta.url),'utf8');
  const context=vm.createContext({});
  vm.runInContext("const norm=v=>String(v||'').replace(/[^A-Z0-9]/gi,'');\nconst money2=v=>Math.round((Number(v||0)+Number.EPSILON)*100)/100;\nconst TOTAL_TOLERANCE=.05;\n"+source.slice(source.indexOf('const lineGrossTotal='),source.indexOf('function mergeRecoveredLines'))+'\nthis.discard=discardUnverifiedTrailingReplay;',context);
  const rows=[
    {description:'SPECIAL BOLIKO',grossAmount:6.19},{description:'TIME OUT',grossAmount:5.46},{description:'ARAB KOTOYROS',grossAmount:6.87},{description:'SANT TEXAS BURGER',grossAmount:2.16},{description:'CROISSANT CHOCO BIG',grossAmount:33.19},
    {description:'SPECIAL BOLIKO',grossAmount:14.69},{description:'TIME OUT',grossAmount:14.69},{description:'ARAB KOTOYROS',grossAmount:6.87},{description:'SANT TEXAS BURGER',grossAmount:2.16}
  ];
  const repaired=context.discard(rows,53.87);
  assert.equal(repaired.discarded,true);assert.equal(repaired.lines.length,5);assert.equal(repaired.removed,4);
  const verified=context.discard([...rows.slice(0,5),{...rows[5],sourceColumnsVerified:true}],53.87);
  assert.equal(verified.discarded,false,'a verified row is never silently removed');
});

test('one isolated duplicate row is removed only when its exact gross is the unique total overage',async()=>{
  const source=await readFile(new URL('../src/routes/commerce-pos-ai-recheck.js',import.meta.url),'utf8');
  const context=vm.createContext({});
  vm.runInContext("const norm=v=>String(v||'').replace(/[^A-Z0-9]/gi,'');\nconst money2=v=>Math.round((Number(v||0)+Number.EPSILON)*100)/100;\nconst TOTAL_TOLERANCE=.05;\n"+source.slice(source.indexOf('const lineGrossTotal='),source.indexOf('const descriptionsClose='))+'\nthis.collapse=collapseExactDuplicateOverage;',context);
  const first={code:'A',description:'FIRST',quantity:1,unitCost:200,netAmount:200,vatRate:0,grossAmount:200};
  const second={code:'B',description:'SECOND',quantity:1,unitCost:160.31,netAmount:160.31,vatRate:0,grossAmount:160.31};
  const duplicate={code:'C',description:'DUPLICATE',quantity:1,unitCost:6.16,netAmount:6.16,vatRate:0,grossAmount:6.16};
  const collapsed=context.collapse([first,duplicate,second,{...duplicate}],366.47);
  assert.equal(collapsed.collapsed,true);assert.equal(collapsed.removed,1);assert.equal(collapsed.lines.length,3);
  assert.equal(collapsed.lines.reduce((sum,line)=>sum+line.grossAmount,0),366.47);
  const legitimate=context.collapse([first,duplicate,second,{...duplicate}],372.63);
  assert.equal(legitimate.collapsed,false);assert.equal(legitimate.lines.length,4);
  const another={...duplicate,code:'D',description:'ANOTHER'};
  const ambiguous=context.collapse([first,duplicate,{...duplicate},another,{...another}],218.48);
  assert.equal(ambiguous.collapsed,false);assert.equal(ambiguous.lines.length,5);
});

test('a genuinely repeated printed row is restored when its second charge exactly closes the invoice total',async()=>{
  const source=await readFile(new URL('../src/routes/commerce-pos-ai-recheck.js',import.meta.url),'utf8');
  assert.match(source,/restorePrintedRepeatedLine\(parsed\.productLines,invoiceTotal,printedDocumentText\)/);
  const context=vm.createContext({});
  vm.runInContext("const norm=v=>String(v||'').replace(/[^A-Z0-9]/gi,'');\nconst money2=v=>Math.round((Number(v||0)+Number.EPSILON)*100)/100;\nconst TOTAL_TOLERANCE=.05;\n"+source.slice(source.indexOf('const lineGrossTotal='),source.indexOf('function mergeAzureInvoicePages'))+'\nthis.restore=restorePrintedRepeatedLine;',context);
  const cup={code:'FR1500',description:'MRS ROSE ΠΟΤΗΡΙ ΠΛΑΣΤΙΚΟ 12OZ (100TEM)',quantity:24,unitCost:5.3,netAmount:108.12,vatRate:24,grossAmount:134.07};
  const other={code:'ES01000',description:'COFFEE',quantity:36,unitCost:36.2,netAmount:856.85,vatRate:13,grossAmount:968.24};
  const restored=context.restore([cup,other],1236.38,'FR1500 cups row one\nFR1500 cups row two\nES01000 coffee');
  assert.equal(restored.restored,true);assert.equal(restored.lines.filter(line=>line.code==='FR1500').length,2);
  const exactGap=context.restore([cup,other],1236.38,'FR1500 once\nES01000 coffee');
  assert.equal(exactGap.restored,false);
  assert.equal(exactGap.lines.length,2);
  const noCodeText=context.restore([cup,other],1236.38,'cups row without extracted supplier code');
  assert.equal(noCodeText.restored,false);
  assert.equal(noCodeText.lines.length,2);
});


test('current printed headers recover all 38 rows when Azure omits tables and confuses retail with quantity',()=>{
  const header="ΚΩΔΙΚΟΣ ΠΕΡΙΓΡΑΦΗ ΛΙΑΝΙΚΗ ΤΙΜΗ Μ.Μ. ΠΟΣΟΤΗΤΑ ΤΙΜΗ ΜΟΝΑΔΑΣ ΑΞΙΑ ΠΡΟ ΕΚΠΤΩΣΗΣ ΕΚΠΤΩΣΗ ΑΞΙΑ ΜΕΤΑ ΤΗΝ ΕΚΠΤΩΣΗ ΦΠΑ";
  const lines=fixture.flat().map(([code,quantity,retail,cost,net])=>{
    const rawText=`${code} MARLBORO RED 3.5 KS BOX 20 STD ${decimal(retail)} TEM ${quantity} ${decimal(cost)} ${decimal(net)} 0 0 ${decimal(net)} 0`;
    return recoverPrintedRetailColumns({code,description:"MARLBORO RED 3.5 KS BOX 20 STD",rawText,quantity:retail,unitCost:net/retail,retailPrice:0,netAmount:net+6.71,vatRate:0},header);
  });
  assert.deepEqual(lines.map(l=>[l.code,l.quantity,l.retailPrice,l.unitCost,l.netAmount]),fixture.flat());
  assert.equal(lines.reduce((sum,l)=>sum+l.quantity,0),608);
  assert.equal(Math.round(lines.reduce((sum,l)=>sum+l.grossAmount,0)*100),236999);
  assert.ok(lines.every(l=>l.sourceColumnsVerified));
  const changed={rawText:"01669 MARLBORO 20 STD 5,20 TEM 30 4,9 147,00 0 0 147,00 0",quantity:5.2,unitCost:1,netAmount:20};
  assert.equal(recoverPrintedRetailColumns(changed,header).quantity,30,"Next invoice must use its new quantities");
  assert.equal(recoverPrintedRetailColumns(changed,header).retailPrice,5.2);
  assert.equal(recoverPrintedRetailColumns({...changed,quantity:7},"UNRELATED SUPPLIER HEADERS").quantity,7);
  const omittedHeader={...changed,retailPrice:0,quantity:5.2,unitCost:4.9};
  assert.equal(recoverPrintedRetailColumns(omittedHeader,"UNRELATED SUPPLIER HEADERS").quantity,30,"A missing OCR header still recovers only the verified shifted-retail signature");
  const mismatch={...changed,rawText:changed.rawText.replace("147,00 0 0 147,00","148,00 0 0 148,00")};
  assert.equal(recoverPrintedRetailColumns(mismatch,header),mismatch,"Unbalanced source row must remain for review");
});

test('late recovered STEFANIDIS rows receive the central column rule before final totals',async()=>{
  const source=await readFile(new URL('../src/routes/commerce-pos-ai-recheck.js',import.meta.url),'utf8');
  const mergeAt=source.indexOf('parsed.productLines=mergeRecoveredLines(parsed.productLines,azureRecovered)');
  const finalRecoveryAt=source.indexOf('if(isStefanidisInvoice(parsed))',mergeAt);
  const totalsAt=source.indexOf('parsed.productLinesGrossAfterRecovery=',finalRecoveryAt);
  assert.ok(mergeAt>=0&&finalRecoveryAt>mergeAt&&totalsAt>finalRecoveryAt);
  assert.match(source.slice(finalRecoveryAt,totalsAt),/recoverPrintedRetailColumns\(line,printedDocumentText\)/);
  assert.match(source,/STEFANIDIS_TAX_ID="998878583"/);

  const header="ΚΩΔΙΚΟΣ ΠΕΡΙΓΡΑΦΗ ΛΙΑΝΙΚΗ ΤΙΜΗ Μ.Μ. ΠΟΣΟΤΗΤΑ ΤΙΜΗ ΜΟΝΑΔΑΣ ΑΞΙΑ ΠΡΟ ΕΚΠΤΩΣΗΣ ΕΚΠΤΩΣΗ ΑΞΙΑ ΜΕΤΑ ΤΗΝ ΕΚΠΤΩΣΗ ΦΠΑ";
  const lateRows=fixture.flat().map(([code,quantity,retail,cost,net])=>recoverPrintedRetailColumns({
    code,description:`ΠΡΟΪΟΝ ${code}`,rawText:`${code} ΠΡΟΪΟΝ ${code} ${decimal(retail)} TEM ${quantity} ${decimal(cost)} ${decimal(net)} 0 0 ${decimal(net)} 0`,
    quantity:retail,unitCost:net/retail,retailPrice:0,netAmount:net+6.71,vatRate:0
  },header));
  assert.equal(lateRows.reduce((sum,line)=>sum+line.quantity,0),608);
  assert.equal(Math.round(lateRows.reduce((sum,line)=>sum+line.grossAmount,0)*100)/100,2369.99);
});

test('printed VAT footer repairs gross-as-net rows only when every total reconciles',()=>{
  const gross=[5.31,1.93,5.47,3.41,2.28,5.64,1.88,5.60,5.46,5.15,5.30,4.81,4.02,7.59,4.75,5.65];
  const lines=gross.map((amount,index)=>({description:`LINE ${index+1}`,quantity:1,unitCost:amount,netAmount:amount,vatRate:0,grossAmount:amount}));
  const recovered=recoverVatFromPrintedSummary(lines,'ΑΝΑΛΥΣΗ ΦΠΑ\n13% 65,72 8,53',74.25);
  assert.equal(recovered.recovered,true);
  assert.equal(recovered.rate,13);
  assert.equal(Math.round(recovered.lines.reduce((sum,line)=>sum+line.netAmount,0)*100)/100,65.72);
  assert.equal(Math.round(recovered.lines.reduce((sum,line)=>sum+line.azureTax,0)*100)/100,8.53);
  assert.ok(recovered.lines.every(line=>line.vatRate===13&&line.vatRecoveredFromPrintedSummary));

  assert.equal(recoverVatFromPrintedSummary(lines,'13% 65,72 8,53',75).recovered,false,'invoice total must agree');
  assert.equal(recoverVatFromPrintedSummary(lines,'13% 64,72 9,53',74.25).recovered,false,'footer VAT equation must agree');
  assert.equal(recoverVatFromPrintedSummary([{...lines[0],vatRate:24},...lines.slice(1)],'13% 65,72 8,53',74.25).recovered,false,'mixed existing VAT must remain untouched');
});

test('MANTZILAS learned packs convert stock quantity and piece price without changing invoice economics',()=>{
  const cases=[
    [{description:'PILS 0,5LT 4PACK',unit:'4PK',quantity:3,unitCost:3.2,netAmount:9.6},4,12,.8,'MANTZILAS_4PACK'],
    [{description:'FANTA 0,33LT 6PACK',unit:'6PK',quantity:2,unitCost:4.2,netAmount:5.8},6,12,.7,'MANTZILAS_6PACK'],
    [{description:'ΝΕΡΟ ΒΙΚΟΣ 0,5LT',unit:'ΚΙΒ',quantity:15,unitCost:2.16,netAmount:32.4},24,360,.09,'MANTZILAS_WATER_500ML'],
    [{description:'ΝΕΡΟ 750ML',unit:'ΚΙΒ',quantity:2,unitCost:5,netAmount:10},12,24,5/12,'MANTZILAS_WATER_750ML'],
    [{description:'ΝΕΡΟ 1LT',unit:'ΚΙΒ',quantity:2,unitCost:6,netAmount:12},6,12,1,'MANTZILAS_WATER_1000ML'],
    [{description:'ΝΕΡΟ ΒΙΚΟΣ 6X1,5LT',unit:'ΚΙΒ',quantity:10,unitCost:1.1,netAmount:11},6,60,1.1/6,'MANTZILAS_WATER_1500ML'],
    [{description:'ΜΠΥΡΑ ΦΙΑΛΗ 500ML',unit:'ΚΙΒ',quantity:1,unitCost:20,netAmount:20},20,20,1,'MANTZILAS_BOTTLE_500ML'],
    [{description:'ΑΝΑΨΥΚΤΙΚΟ ΚΟΥΤΙ 500ML',unit:'ΚΙΒ',quantity:2,unitCost:24,netAmount:48},24,48,1,'MANTZILAS_CASE_500ML'],
    [{description:'ΑΝΑΨΥΚΤΙΚΟ 330ML',unit:'ΚΙΒ',quantity:2,unitCost:24,netAmount:48},24,48,1,'MANTZILAS_CASE_330ML']
  ];
  for(const [input,factor,stockQuantity,piecePrice,rule] of cases){
    const line=applyMantzilasPackaging(input);
    assert.equal(line.stockUnitsPerInvoiceUnit,factor);assert.equal(line.quantity,input.quantity);assert.equal(line.unitCost,input.unitCost);
    assert.equal(line.supplierProfileEvidence.stockQuantity,stockQuantity);assert.ok(Math.abs(line.supplierProfileEvidence.pieceUnitPrice-piecePrice)<.0001);assert.equal(line.packRule,rule);
    assert.equal(line.netAmount,input.netAmount,'pack conversion must not change invoice totals');
  }
  const lipton12={code:'01880',description:'LIPTON ΤΣΑΪ ΡΟΔΑΚΙΝΟ Χ.ΖΑΧ 500ml',rawText:'01880 | LIPTON ΤΣΑΪ ΡΟΔΑΚΙΝΟ Χ.ΖΑΧ 500ml | 12TMX | 1 | 9,370000 | 9,37 | 13 | 10,59',quantity:1,invoiceQuantity:1,unitCost:9.37,netAmount:9.37,vatRate:13,grossAmount:10.59,invoiceUnit:'12TMX',quantitySource:'AI_PRINTED_ROW_FULL_MATH_VERIFIED'};
  const convertedLipton=applyMantzilasPackaging(lipton12);
  assert.deepEqual({quantity:convertedLipton.quantity,invoiceQuantity:convertedLipton.invoiceQuantity,invoiceUnit:convertedLipton.invoiceUnit,pack:convertedLipton.stockUnitsPerInvoiceUnit,stock:convertedLipton.supplierProfileEvidence.stockQuantity,piecePrice:convertedLipton.supplierProfileEvidence.pieceUnitPrice,net:convertedLipton.netAmount,gross:convertedLipton.grossAmount},{quantity:1,invoiceQuantity:1,invoiceUnit:'PACKAGE',pack:12,stock:12,piecePrice:.7808,net:9.37,gross:10.59});
  assert.equal(convertedLipton.packRule,'MANTZILAS_PRINTED_12TMX');
  const louxBlue=applyMantzilasPackaging({code:'12798',description:'ΛΟΥΞ Π/Α Λ ΜΠΛΕ 0,33LT PET (10+2)',rawText:'12798 | ΛΟΥΞ Π/Α Λ ΜΠΛΕ 0,33LT PET (10+2) | KIB | 1 | 6,82 | 19 | 1,30 | 5,52',quantity:1,invoiceQuantity:1,unitCost:6.82,packageUnitPrice:6.82,initialAmount:6.82,discount1:19,discount1Amount:1.30,netAmount:5.52,vatRate:13,grossAmount:6.24,invoiceUnit:'KIB',quantitySource:'AI_PRINTED_ROW_FULL_MATH_VERIFIED'});
  assert.deepEqual({quantity:louxBlue.quantity,pack:louxBlue.stockUnitsPerInvoiceUnit,stock:louxBlue.supplierProfileEvidence.stockQuantity,piecePrice:louxBlue.supplierProfileEvidence.pieceUnitPrice,discount:louxBlue.discount1,net:louxBlue.netAmount,gross:louxBlue.grossAmount},{quantity:1,pack:12,stock:12,piecePrice:.5683,discount:19,net:5.52,gross:6.24});
  assert.equal(louxBlue.packRule,'MANTZILAS_12798_VERIFIED_PACK12');
  const louxOrange=applyMantzilasPackaging({code:'12718',description:'ΛΟΥΞ Λ/Ν 0,33LT',rawText:'12718 | ΛΟΥΞ Λ/Ν 0,33LT | KIB | 1 | 6,66 | 19 | 1,27 | 5,39',quantity:1,invoiceQuantity:1,unitCost:6.66,packageUnitPrice:6.66,initialAmount:6.66,discount1:19,discount1Amount:1.27,netAmount:5.39,vatRate:13,grossAmount:6.09,invoiceUnit:'KIB',quantitySource:'AI_PRINTED_ROW_FULL_MATH_VERIFIED'});
  assert.deepEqual({quantity:louxOrange.quantity,pack:louxOrange.stockUnitsPerInvoiceUnit,stock:louxOrange.supplierProfileEvidence.stockQuantity,piecePrice:louxOrange.supplierProfileEvidence.pieceUnitPrice,discount:louxOrange.discount1,net:louxOrange.netAmount,gross:louxOrange.grossAmount},{quantity:1,pack:12,stock:12,piecePrice:.555,discount:19,net:5.39,gross:6.09});
  assert.equal(louxOrange.packRule,'MANTZILAS_12718_VERIFIED_PACK12');
  const unrelatedLoux=applyMantzilasPackaging({code:'99999',description:'ΛΟΥΞ Λ/Ν 0,33LT',rawText:'99999 | ΛΟΥΞ Λ/Ν 0,33LT | KIB | 1 | 6,66',quantity:1,unitCost:6.66,netAmount:6.66});
  assert.equal(unrelatedLoux.stockUnitsPerInvoiceUnit,24,'the confirmed factor must not change another supplier code');
  const sizeOnlyLipton=applyMantzilasPackaging({...lipton12,rawText:'01880 | LIPTON ΤΣΑΪ ΡΟΔΑΚΙΝΟ 500ml | TMX | 1 | 9,37',invoiceUnit:'TMX'});
  assert.equal(sizeOnlyLipton.stockUnitsPerInvoiceUnit,undefined,'500 ml alone must not invent a 12-piece package');
  const alreadyPieces={description:'RED BULL 0,25LT',unit:'TEM',quantity:48,unitCost:.95,netAmount:45.6};
  assert.equal(applyMantzilasPackaging(alreadyPieces),alreadyPieces,'printed pieces must never be converted twice');
  const verifiedBottle={description:'CORONA ΦΙΑΛΗ 0,33ML',rawText:'02410 | CORONA ΦΙΑΛΗ 0,33ML | KIB | 24 | 0,98',quantity:24,invoiceQuantity:24,unitCost:.98,netAmount:23.52,invoiceUnit:'ΦΙΑ',quantitySource:'AI_PRINTED_ROW_FULL_MATH_VERIFIED',stockUnitsPerInvoiceUnit:24,packageConversionApplied:true};
  const repairedBottle=applyMantzilasPackaging(verifiedBottle);
  assert.equal(repairedBottle.quantity,24);assert.equal(repairedBottle.invoiceUnit,'PIECE');assert.equal(repairedBottle.stockUnitsPerInvoiceUnit,1);assert.equal(repairedBottle.packageConversionApplied,false);
  const labCorona={code:'02410',description:'CORONA ΦΙΑΛΗ 0,33ML',rawText:'02410 | CORONA ΦΙΑΛΗ 0,33ML | KIB | 24 | 0,98 | 23,52',quantity:24,invoiceQuantity:24,unitCost:.98,packageUnitPrice:.98,initialAmount:23.52,netAmount:23.52,exciseTotal:5.28,taxableAmount:28.8,vatRate:24,vatAmount:6.91,grossAmount:35.71,invoiceUnit:'KIB',quantitySource:'AI_PRINTED_ROW_FULL_MATH_VERIFIED',stockUnitsPerInvoiceUnit:24,unitsPerPackage:24,packageConversionApplied:true};
  const repairedLabCorona=applyMantzilasPackaging(labCorona);
  assert.equal(repairedLabCorona.quantity,24);assert.equal(repairedLabCorona.invoiceQuantity,24);assert.equal(repairedLabCorona.invoiceUnit,'PIECE');assert.equal(repairedLabCorona.stockUnitsPerInvoiceUnit,1);assert.equal(repairedLabCorona.unitCost,.98);assert.equal(repairedLabCorona.supplierProfileEvidence.stockQuantity,24);assert.equal(repairedLabCorona.packRule,'MANTZILAS_02410_CORONA_VERIFIED_PIECE');assert.equal(repairedLabCorona.netAmount,23.52);
  assert.deepEqual({excise:repairedLabCorona.exciseTotal,taxable:repairedLabCorona.taxableAmount,vatRate:repairedLabCorona.vatRate,vat:repairedLabCorona.vatAmount,gross:repairedLabCorona.grossAmount},{excise:5.28,taxable:28.8,vatRate:24,vat:6.91,gross:35.71});
  const otherCoronaCarton={...labCorona,code:'77777',quantity:1,invoiceQuantity:1,unitCost:23.52,packageUnitPrice:23.52,initialAmount:23.52};
  assert.equal(applyMantzilasPackaging(otherCoronaCarton).stockUnitsPerInvoiceUnit,24,'other verified 330 ml cartons keep the generic package rule');
  const verifiedSixPack={description:'COCA COLA ZERO 0,33LT 6P',rawText:'13192 | COCA COLA ZERO | KIB | 2 | 4,94',quantity:2,invoiceQuantity:2,unitCost:4.94,netAmount:6.82,invoiceUnit:'6PK',quantitySource:'AI_PRINTED_ROW_FULL_MATH_VERIFIED'};
  const repairedSixPack=applyMantzilasPackaging(verifiedSixPack);
  assert.equal(repairedSixPack.quantity,2);assert.equal(repairedSixPack.stockUnitsPerInvoiceUnit,6);assert.equal(repairedSixPack.supplierProfileEvidence.stockQuantity,12);
  const poisonedPiece={description:'RED BULL 0,25LT ΚΟΥΤΙ',rawText:'11 | RED BULL 0,25LT ΚΟΥΤΙ | TEM | 48 | 0,95 | 45,60',quantity:48,invoiceQuantity:48,unitCost:.95,netAmount:45.6,invoiceUnit:'PACKAGE',stockUnitsPerInvoiceUnit:48,unitsPerPackage:48,packageConversionApplied:true};
  const repairedPiece=applyMantzilasPackaging(poisonedPiece);
  assert.equal(repairedPiece.quantity,48);assert.equal(repairedPiece.invoiceUnit,'PIECE');assert.equal(repairedPiece.stockUnitsPerInvoiceUnit,1);assert.equal(repairedPiece.packageConversionApplied,false);
  const carton={description:'ΝΕΡΟ ΒΙΚΟΣ 0,5LT',rawText:'046 | ΝΕΡΟ ΒΙΚΟΣ 0,5LT | KIB | 15 | 2,16 | 32,40',quantity:15,unitCost:2.16,netAmount:32.4};
  const once=applyMantzilasPackaging(carton),twice=applyMantzilasPackaging(once);
  assert.equal(twice.quantity,15);assert.equal(twice.invoiceQuantity,15);assert.equal(twice.stockUnitsPerInvoiceUnit,24);assert.equal(twice.supplierProfileEvidence.stockQuantity,360);
  const currentImageRow={description:'COCA COLA ZERO 0,33LT x24pack ΚΟΥΤΙ',rawText:'00009 | COCA COLA ZERO 0,33LT x24pack ΚΟΥΤΙ | KIB | 2 | 2 | 19,55 | 39,10 | 65,5 | 25,61 | 13,49',quantity:1,invoiceQuantity:1,unitCost:19.55,initialAmount:19.55,discount1:31,discount1Amount:6.06,netAmount:13.49,invoiceUnit:'KIB',quantitySource:'AI_PRINTED_ROW_FULL_MATH_VERIFIED'};
  const preserved=applyMantzilasPackaging(currentImageRow);
  assert.equal(preserved.quantity,1);assert.equal(preserved.stockUnitsPerInvoiceUnit,24);assert.equal(preserved.supplierProfileEvidence.stockQuantity,24);assert.equal(preserved.discount1,31);assert.equal(preserved.netAmount,13.49);
  const regressedCoca={code:'00009',description:'COCA COLA ZERO 0,33LTx24pack',rawText:'00009 | COCA COLA ZERO 0,33LTx24pack | TEM | 48 | 0,814583 | 39,10 | 65,5 | 25,61 | 13,49',quantity:48,invoiceQuantity:48,unitCost:.814583,packageUnitPrice:.814583,initialAmount:39.1,discount1:65.5,discount1Amount:25.61,netAmount:13.49,vatRate:13,grossAmount:15.24,invoiceUnit:'TEM',quantitySource:'AI_PRINTED_ROW_FULL_MATH_VERIFIED'};
  const fixedCoca=applyMantzilasPackaging(regressedCoca);
  assert.deepEqual({quantity:fixedCoca.quantity,invoiceQuantity:fixedCoca.invoiceQuantity,unitCost:fixedCoca.unitCost,discount:fixedCoca.discount1,net:fixedCoca.netAmount,gross:fixedCoca.grossAmount,stock:fixedCoca.supplierProfileEvidence.stockQuantity},{quantity:24,invoiceQuantity:24,unitCost:.814583,discount:31,net:13.49,gross:15.24,stock:24});
  const alreadyCorrectCoca=applyMantzilasPackaging({...regressedCoca,quantity:24,invoiceQuantity:24,initialAmount:19.55,discount1:31,discount1Amount:6.06});
  assert.equal(alreadyCorrectCoca.quantity,24);assert.equal(alreadyCorrectCoca.stockUnitsPerInvoiceUnit,1);assert.equal(alreadyCorrectCoca.discount1,31);
  const cartonScaleCoca=applyMantzilasPackaging({...regressedCoca,quantity:2,invoiceQuantity:2,unitCost:19.55,packageUnitPrice:19.55,initialAmount:39.1,invoiceUnit:'KIB'});
  assert.equal(cartonScaleCoca.quantity,1);assert.equal(cartonScaleCoca.stockUnitsPerInvoiceUnit,24);assert.equal(cartonScaleCoca.supplierProfileEvidence.stockQuantity,24);assert.equal(cartonScaleCoca.discount1,31);assert.equal(cartonScaleCoca.netAmount,13.49);
  const unrelatedEquivalent={...regressedCoca,code:'12345'};
  assert.equal(applyMantzilasPackaging(unrelatedEquivalent).quantity,48,'the exact arithmetic must not change another supplier code');
  const simultaneous=[regressedCoca,labCorona].map(applyMantzilasPackaging);
  assert.equal(simultaneous[0].supplierProfileEvidence.stockQuantity,24);assert.equal(simultaneous[0].discount1,31);assert.equal(simultaneous[1].supplierProfileEvidence.stockQuantity,24);assert.equal(simultaneous[1].unitCost,.98);
});

test('MANTZILAS printed economics recover discounts, excise, taxable value and VAT only from balanced rows',()=>{
  const pils=recoverMantzilasEconomics({description:'PILS 0,5LT 4PACK',rawText:'0168 | PILS 0,5LT 4PACK | 4PK | 3 | 3,20 | 9,60 | 0 | 0,00 | 9,60 | 0,00 | 9,60 | 24 | 2,30'});
  assert.deepEqual({quantity:pils.quantity,unitCost:pils.unitCost,discount:pils.discount1,net:pils.netAmount,excise:pils.exciseTotal,taxable:pils.taxableAmount,vat:pils.vatRate,vatAmount:pils.vatAmount,gross:pils.grossAmount},
    {quantity:3,unitCost:3.2,discount:0,net:9.6,excise:0,taxable:9.6,vat:24,vatAmount:2.3,gross:11.9});
  const mythos=recoverMantzilasEconomics({description:'MYTHOS ICE BEER ΦΙΑΛΗ 24/330 ML',rawText:'1142 | MYTHOS ICE BEER ΦΙΑΛΗ 24/330 ML | KIB | 1 | 1 | 22,85 | 22,85 | 17 | 3,88 | 18,97 | 4,12 | 23,09 | 24 | 5,55'});
  assert.deepEqual({quantity:mythos.quantity,unitCost:mythos.unitCost,discount:mythos.discount1,discountAmount:mythos.discount1Amount,net:mythos.netAmount,excise:mythos.exciseTotal,taxable:mythos.taxableAmount,vatAmount:mythos.vatAmount,gross:mythos.grossAmount},
    {quantity:1,unitCost:22.85,discount:17,discountAmount:3.88,net:18.97,excise:4.12,taxable:23.09,vatAmount:5.55,gross:28.64});
  const invalid={description:'BAD',rawText:'14 | BAD | KIB | 1 | 1 | 21,75 | 21,75 | 17 | 8,49 | 18,05 | 6,86 | 24,91 | 24 | 5,98'};
  assert.equal(recoverMantzilasEconomics(invalid),invalid,'a shifted discount that breaks the printed equation must be rejected');
});

test('MANTZILAS 11998 rebuilds all 14 physical rows when the first OCR guide omitted one',()=>{
  const source=[
    ['00009','COCA COLA ZERO 0,33LTx24pack ΚΟΥΤΙ','KIB',1,19.55,19.55,31,6.06,13.49,0,13.49,13,1.75,15.24],
    ['046','ΝΕΡΟ ΒΙΚΟΣ 0,5LT','KIB',20,2.16,43.20,0,0,43.20,0,43.20,13,5.62,48.82],
    ['043','ΝΕΡΟ ΒΙΚΟΣ 6X1,5LT','KIB',10,1.10,11,0,0,11,0,11,13,1.43,12.43],
    ['10503','AMSTEL RADLER 0,33LT ΚΟΥΤΙ','KIB',1,16.80,16.80,17,2.86,13.94,4.12,18.06,24,4.34,22.40],
    ['1056','FURSTENBRAU ΚΟΥΤΙ 4PACK 0,5ML','4PK',3,2.08,6.24,17,1.06,5.18,2.19,7.37,24,1.77,9.14],
    ['10195','MYTHOS 0,5LTx4Pack ΚΟΥΤΙ (3+1Δ)','4PK',3,2.40,7.20,17,1.22,5.98,4.35,10.33,24,2.48,12.81],
    ['621312','FIX ANEY 0,33LTx6Pack ΚΟΥΤΙ (5+1)','6PK',2,3.64,7.28,17,1.24,6.04,0,6.04,24,1.45,7.49],
    ['62211','FIX ANEY ΣΑΓΚΟΥΙΝΙ 0,33 ML 4PACK','4PK',3,2.37,7.11,17,1.21,5.90,0,5.90,24,1.42,7.32],
    ['14','ΑΛΦΑ 0,5LT ΚΟΥΤΙ','KIB',2,21.75,43.50,17,7.40,36.10,13.72,49.82,24,11.95,61.77],
    ['614','ΑΛΦΑ 0,33LT ΚΟΥΤΙ (5+1Δ)','KIB',1,12.79,12.79,17,2.17,10.62,4.53,15.15,24,3.64,18.79],
    ['617','ΑΛΦΑ 0,5LT ΚΟΥΤΙ STRONG','KIB',1,23.01,23.01,17,3.91,19.10,9.36,28.46,24,6.83,35.29],
    ['1085','AMSTEL 0,5LT ΚΟΥΤΙ (3+1)','KIB',1,13.19,13.19,0,0,13.19,7.49,20.68,24,4.97,25.65],
    ['01210','HEINEKEN 0,5LT ΚΟΥΤΙ (3+1)','KIB',1,16.50,16.50,0,0,16.50,7.49,23.99,24,5.75,29.74],
    ['009','HEINEKEN 0,33LT ΚΟΥΤΙ (5+1ΔΩΡΟ)','KIB',1,14,14,0,0,14,4.94,18.94,24,4.55,23.49]
  ];
  const candidates=source.map(([supplierCode,description,printedUnit,printedQuantity,originalUnitPrice,initialAmount,discountPercent1,discountAmount1,netAmount,exciseTotal,taxableAmount,vatRate,vatAmount,grossAmount],index)=>({index:index+1,supplierCode,description,printedUnit,printedQuantity,originalUnitPrice,initialAmount,discountPercent1,discountAmount1,discountPercent2:0,discountAmount2:0,discountPercent3:0,discountAmount3:0,netAmount,exciseTotal,taxableAmount,vatRate,vatAmount,grossAmount,confidence:99,evidence:'printed physical row'}));
  const vatSummary=[{rate:24,taxable:204.74,vat:49.14,gross:253.88},{rate:13,taxable:67.69,vat:8.80,gross:76.49}];
  const rebuilt=buildCompletePrintedTableCandidate(candidates,330.37,vatSummary);
  assert.equal(rebuilt.length,14);assert.equal(rebuilt[0].code,'00009');assert.equal(rebuilt.at(-1).code,'009');
  assert.equal(roundForTest(rebuilt.reduce((sum,line)=>sum+line.taxableAmount,0)),272.43);
  assert.equal(roundForTest(rebuilt.reduce((sum,line)=>sum+line.grossAmount,0)),330.38,'printed row rounding may differ one cent from the authoritative VAT footer');
  assert.equal(buildCompletePrintedTableCandidate(candidates.slice(0,-1),330.37,vatSummary),null,'an incomplete table cannot be accepted merely because its rows balance');
  const packaged=rebuilt.map(applyMantzilasPackaging);
  assert.equal(packaged[0].supplierProfileEvidence.stockQuantity,24);assert.equal(packaged[1].supplierProfileEvidence.stockQuantity,480);assert.equal(packaged[2].supplierProfileEvidence.stockQuantity,60);
});

test('a complete thermal table with VAT only in its footer derives tax per row after full reconciliation',()=>{
  const rows=[
    {supplierCode:'340061153',description:'TASTY SNACKS',printedQuantity:2,originalUnitPrice:1.42,initialAmount:2.84,discountPercent1:15,discountAmount1:.43,netAmount:2.41,vatRate:13},
    {supplierCode:'340061155',description:'POPPERS',printedQuantity:4,originalUnitPrice:1.06,initialAmount:4.24,discountPercent1:15,discountAmount1:.64,netAmount:3.60,vatRate:13}
  ].map((row,index)=>({index:index+1,printedUnit:'TEM',discountPercent2:0,discountAmount2:0,discountPercent3:0,discountAmount3:0,exciseTotal:0,taxableAmount:0,vatAmount:0,grossAmount:0,confidence:99,...row}));
  const footer=[{rate:13,taxable:6.01,vat:.78,gross:6.79}];
  const result=buildCompletePrintedTableCandidate(rows,6.79,footer);
  assert.deepEqual(result.map(line=>line.vatAmount),[.31,.47]);
  assert.equal(roundForTest(result.reduce((sum,line)=>sum+line.grossAmount,0)),6.79);
  assert.equal(buildCompletePrintedTableCandidate(rows,7.00,footer),null);
  assert.equal(buildCompletePrintedTableCandidate(rows,6.79,[{...footer[0],vat:.90}]),null);
  assert.equal(buildCompletePrintedTableCandidate(rows.slice(0,1),6.79,footer),null);
});

test('MANTZILAS mixed VAT footer uniquely repairs the three shifted rates and exact invoice total',()=>{
  const bases=[24.91,19.38,9.60,16.29,26.98,13.49,34.51,45.60,26.40,6.82,5.80,17.55,32.40,11.00,23.09,28.80,11.13,12.00];
  const correct=[24,24,24,24,13,13,13,13,13,13,13,13,13,13,24,24,24,24];
  const shifted=[...correct];shifted[7]=24;shifted[8]=24;shifted[11]=0;
  const lines=bases.map((base,index)=>({description:`ROW ${index+1}`,netAmount:base,exciseTotal:0,vatRate:shifted[index],grossAmount:roundForTest(base*(1+shifted[index]/100))}));
  const footer='24 145,20 34,85 180,05\n13 220,55 28,67 249,22';
  const result=recoverMixedVatFromPrintedSummary(lines,footer,429.27);
  assert.equal(result.recovered,true);assert.deepEqual(result.lines.map(line=>line.vatRate),correct);
  assert.equal(roundForTest(result.lines.reduce((sum,line)=>sum+line.grossAmount,0)),429.27);
  assert.equal(recoverMixedVatFromPrintedSummary(lines,'24 145,20 34,00 179,20',429.27).recovered,false,'invalid footer math must not alter rows');
});

const roundForTest=value=>Math.round((Number(value)+Number.EPSILON)*100)/100;


test('POS recheck anchors reconciliation to the linked draft total before restoring an omitted row',async()=>{
  const source=await readFile(new URL('../src/routes/commerce-pos-ai-recheck.js',import.meta.url),'utf8');
  assert.match(source,/j\."purchaseDocumentId"/);
  assert.match(source,/SELECT "totalGross" FROM "PurchaseDocument"/);
  assert.match(source,/linkedDraft\[0\]\?\.totalGross\|\|posHandoff\?\.totalGross/);
  assert.match(source,/posConfirmedTotalSource=linkedDraft\[0\]\?"LINKED_DRAFT":"POS_HANDOFF"/);
});

test('complete-table verification is driven by any confirmed central profile, not a supplier allow-list',async()=>{
  const route=await readFile(new URL('../src/routes/commerce-pos-ai-recheck.js',import.meta.url),'utf8');
  const declaration=route.match(/const supplierRequiresCompletePrintedTable=[^;]+;/)?.[0]||'';
  assert.match(declaration,/supplierReadingProfile\?\.requireCompletePrintedTableOnMismatch===true/);
  assert.doesNotMatch(declaration,/FRESH_SNACK|FRESH_DELICACIES|LEVENTOPOULOS|\.includes\(/);
  assert.match(route,/requiresCompleteReverification=\(mantzilasInvoice\|\|supplierRequiresCompletePrintedTable\)/);
});

test('Confirm and Learn publishes the generic verifier contract without learning invoice prices or discounts',async()=>{
  const lab=await readFile(new URL('../../client/src/invoice-learning-lab-bootstrap.js',import.meta.url),'utf8');
  const handler=lab.slice(lab.indexOf("$('#learn').onclick="),lab.indexOf("$('#profiles').onclick="));
  assert.match(handler,/ruleStatus='VERIFIED'/);
  assert.match(handler,/requireCompletePrintedTableOnMismatch:true/);
  assert.match(handler,/CURRENT_IMAGE_ROWS_PLUS_VAT_FOOTER_PLUS_TOTAL/);
  assert.doesNotMatch(handler,/lastNetUnitCost|discount1:|discount2:|discount3:|unitPrice:|netAmount:/);
});
