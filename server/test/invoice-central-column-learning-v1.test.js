import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import {extractAzureColumns,combineAzureRows,inferConfirmedColumns,applyConfirmedColumns,sourceOrder,recoverPrintedRetailColumns,recoverStefanidisFoodLine,stockConversionFromDescription,unitRelativeValues} from '../src/lib/invoice-column-reading.js';
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
  assert.equal(result.productLines[0].supplierProfileRule,'DECLARED_COLUMNS_LINE_TOTAL_RECOVERY');
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

test('both column-map editors allow a missing unit and persist the piece fallback',async()=>{
  for(const file of ['../../client/src/invoice-learning-lab-bootstrap.js','../../client/src/invoice-learning-catalog-publication.js']){
    const source=await readFile(new URL(file,import.meta.url),'utf8');
    assert.ok(source.includes("['SUPPLIER_CODE','DESCRIPTION','QUANTITY','UNIT_PRICE']"));
    assert.ok(source.includes("defaultUnit:Object.values(columns).includes('UNIT')?null:'ΤΜΧ'"));
    assert.doesNotMatch(source,/κωδικό, περιγραφή, μονάδα, ποσότητα/);
  }
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
  assert.equal(exactGap.restored,true);
  assert.equal(exactGap.totalGapRecovered,true);
  const noCodeText=context.restore([cup,other],1236.38,'cups row without extracted supplier code');
  assert.equal(noCodeText.restored,true);
  assert.equal(noCodeText.totalGapRecovered,true);
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


test('POS recheck anchors reconciliation to the linked draft total before restoring an omitted row',async()=>{
  const source=await readFile(new URL('../src/routes/commerce-pos-ai-recheck.js',import.meta.url),'utf8');
  assert.match(source,/j\."purchaseDocumentId"/);
  assert.match(source,/SELECT "totalGross" FROM "PurchaseDocument"/);
  assert.match(source,/linkedDraft\[0\]\?\.totalGross\|\|posHandoff\?\.totalGross/);
  assert.match(source,/posConfirmedTotalSource=linkedDraft\[0\]\?"LINKED_DRAFT":"POS_HANDOFF"/);
});
