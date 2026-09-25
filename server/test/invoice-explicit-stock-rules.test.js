import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import {validateExplicitStockRules,applyExplicitStockRules} from '../src/lib/invoice-explicit-stock-rules.js';

const rules=()=>validateExplicitStockRules([{supplierItemCode:'DEL005',invoiceUnit:'ΚΙΛΟ',stockUnit:'ΓΡ',factor:1000,quantity:999,unitPrice:999,discount1:99}]);

test('an explicit stock edit replaces legacy piece units while retaining other learning and current economics',()=>{
  const previous={readingRule:{columns:{4:'QUANTITY'}},mappings:{DEL005:{invoiceUnit:'PACKAGE',stockUnit:'ΤΜΧ',source:'SUPER_ADMIN_LINE_CORRECTION',discount1:25,barcode:'1234567890123'},OTHER:{stockUnit:'PCS'}}};
  const result=applyExplicitStockRules(previous,rules());
  assert.equal(result.mappings.DEL005.stockUnit,'ΓΡ');
  assert.deepEqual(result.mappings.DEL005.stockConversion,{from:'ΚΙΛΟ',to:'ΓΡ',factor:1000});
  assert.equal(result.mappings.DEL005.discount1,25);
  assert.equal(result.mappings.DEL005.quantity,undefined);
  assert.equal(result.mappings.DEL005.unitPrice,undefined);
  assert.equal(result.mappings.DEL005.barcode,'1234567890123');
  assert.deepEqual(result.readingRule,previous.readingRule);
  assert.deepEqual(result.mappings.OTHER,previous.mappings.OTHER);
  assert.equal(previous.mappings.DEL005.stockUnit,'ΤΜΧ');
});

test('invalid or duplicate rules fail before any profile can be changed',()=>{
  for(const input of [[],[{supplierItemCode:'X',invoiceUnit:'KG',stockUnit:'GR',factor:0}],[{supplierItemCode:'X',invoiceUnit:'',stockUnit:'GR',factor:1000}],[...rules(),...rules()]])assert.throws(()=>validateExplicitStockRules(input));
});

test('generic POS correction retains an explicit gram rule',async()=>{
  const profile=applyExplicitStockRules({},rules());
  const source=await readFile(new URL('../src/lib/invoice-correction-learning.js',import.meta.url),'utf8');
  let saved;
  const tx={
    $executeRaw:async(strings,...values)=>{if(strings[0].startsWith('INSERT'))saved=JSON.parse(values.find(v=>typeof v==='string'&&v.startsWith('{')));},
    $queryRaw:async strings=>strings[0].includes('FROM "Supplier"')?[{id:'s',name:'Coffee',taxId:'803142360'}]:[{supplierKey:'803142360',profile,profileVersion:1}],
  };
  const context=vm.createContext({columnKey:x=>x,inferConfirmedColumns:()=>null,unitRelativeValues:()=>null});
  vm.runInContext(source.replace(/^import .*;\n/gm,'').replace('export async function','async function')+'\nthis.learn=learnCentralInvoiceCorrection;',context);
  await context.learn(tx,{actor:{role:'SUPER_ADMIN'},companyId:'lab',supplierId:'s',line:{supplierCode:'DEL005',description:'Chocolate',invoiceUnit:'PACKAGE',stockUnitsPerInvoiceUnit:1000}});
  assert.equal(saved.mappings.DEL005.stockUnit,'ΓΡ');
  assert.equal(saved.mappings.DEL005.invoiceUnit,'ΚΙΛΟ');
  assert.equal(saved.mappings.DEL005.source,'SUPER_ADMIN_STOCK_RULE');
});

test('explicit saving is behind the Super Admin gate and workspace sync protects it',async()=>{
  const source=await readFile(new URL('../src/routes/platform-invoice-learning-workspace.js',import.meta.url),'utf8');
  const gate=source.indexOf('router.use((req,res,next)=>{if(!isSuper(req))');
  assert.ok(gate>=0&&gate<source.indexOf('router.put("/invoice-learning/supplier-profile/stock-rules"'));
  assert.match(source,/\["SUPER_ADMIN_LINE_CORRECTION","SUPER_ADMIN_STOCK_RULE"\]\.includes\(mapping.source\)/);
});
