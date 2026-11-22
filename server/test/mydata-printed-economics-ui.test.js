import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import {myDataPrintedEconomicsNotice,installMyDataPrintedEconomicsNotice} from '../../client/src/lib/mydata-printed-economics-notice.mjs';

const context={orderId:'order-a',storeId:'store-a'};
const dto={version:'MYDATA_PRINTED_ECONOMICS_V1',...context,state:'VERIFIED',lineCount:10,reason:'PRINTED_LINE_AMOUNT_CONFIRMED',discountAmountTotal:'124.95'};

test('printed amount is explained without presenting derived storage percentages as printed',()=>{
  const notice=myDataPrintedEconomicsNotice(dto,context);
  assert.equal(notice.state,'VERIFIED');
  assert.match(notice.text,/124,95/);
  assert.match(notice.text,/όχι τυπωμένα ποσοστά/);
  assert.equal(myDataPrintedEconomicsNotice({...dto,storeId:'other'},context),null);
  assert.equal(myDataPrintedEconomicsNotice({...dto,orderId:'other'},context),null);
  for(const malformed of [{version:'old'},{lineCount:0},{lineCount:251},{discountAmountTotal:'NaN'},{discountAmountTotal:'0<script>'},{discountAmountTotal:-1},{discountAmountTotal:'1.001'}])assert.equal(myDataPrintedEconomicsNotice({...dto,...malformed},context),null);
});

test('unknown discounts never turn default zero into supplier evidence; stale proof is explicit',()=>{
  const unknown=myDataPrintedEconomicsNotice({...dto,state:'UNKNOWN',discountAmountTotal:'0.00'},context);
  assert.match(unknown.text,/0.*δεν αποδεικνύει/);
  assert.doesNotMatch(unknown.text,/Συνολικό ποσό/);
  assert.match(myDataPrintedEconomicsNotice({...dto,state:'UNKNOWN',reason:'STALE_ROWS'},context).text,/Οι γραμμές άλλαξαν/);
  assert.match(myDataPrintedEconomicsNotice({...dto,state:'UNKNOWN',reason:'STALE_SOURCE'},context).text,/στοιχεία της πηγής άλλαξαν/);
  assert.equal(myDataPrintedEconomicsNotice({...dto,state:'PAID'},context),null);
  assert.match(myDataPrintedEconomicsNotice({...dto,discountAmountTotal:'0.00'},context).text,/0,00/);
});

test('mounted notice only adds text and preserves draft fields and disabled controls',async()=>{
  const {JSDOM}=await import('jsdom');
  const dom=new JSDOM('<section><div class="po-order-meta"><input value="renamed"><button disabled>Save</button></div><table><tbody><tr><td><input value="3.10"></td></tr></tbody></table></section>');
  const root=dom.window.document.querySelector('section'),meta=root.querySelector('.po-order-meta'),table=root.querySelector('table');
  const node=installMyDataPrintedEconomicsNotice(root,dto,context);
  assert.equal(meta.nextElementSibling,node);
  assert.equal(node.getAttribute('role'),'status');
  assert.equal(node.children.length,0);
  assert.equal(root.querySelector('table'),table);
  assert.equal(table.querySelector('input').value,'3.10');
  assert.equal(meta.querySelector('input').value,'renamed');
  assert.equal(meta.querySelector('button').disabled,true);
  installMyDataPrintedEconomicsNotice(root,{...dto,state:'UNKNOWN',reason:'STALE_ROWS'},context);
  assert.equal(root.querySelectorAll('[data-mydata-printed-economics]').length,1);
  assert.match(root.querySelector('[role=status]').textContent,/Οι γραμμές άλλαξαν/);
  installMyDataPrintedEconomicsNotice(root,dto,{...context,storeId:'other'});
  assert.equal(root.querySelectorAll('[data-mydata-printed-economics]').length,0);
  assert.equal(root.querySelectorAll('button').length,1);
  dom.window.close();
});

test('actual detail-reader body retains marker summary after description rename or clearing',async()=>{
  const source=await readFile(new URL('../src/routes/purchase-orders.js',import.meta.url),'utf8');
  const start=source.indexOf('async function readOrderDetail('),end=source.indexOf('\nexport async function readPurchaseOrderInspection',start);
  assert.ok(start>=0&&end>start);
  const calls=[];
  const readDetail=vm.runInNewContext(`(${source.slice(start,end).trim()})`,{
    n:Number,money2:n=>Math.round(n*100)/100,
    readMyDataPrintedEconomicsReview:async(db,scope)=>{calls.push(scope);return dto;}
  });
  const db={$queryRaw:async()=>[]};
  for(const description of ['myDATA • MARK 123','user renamed','']){
    const found={id:context.orderId,storeId:context.storeId,status:'NEW',sourceType:'POS_OCR_DRAFT',supplierId:'supplier-a',description};
    const result=await readDetail(db,found,'company-a',{user:{}});
    assert.equal(result.mydataPrintedEconomics,dto);
    assert.equal(result.order.description,description);
  }
  assert.equal(calls.length,3);
  assert.deepEqual(JSON.parse(JSON.stringify(calls[2])),{companyId:'company-a',...context});
  const final=await readDetail(db,{id:context.orderId,storeId:context.storeId,status:'FINAL',sourceType:'POS_OCR_DRAFT',supplierId:'supplier-a'},'company-a',{user:{}});
  assert.equal('mydataPrintedEconomics' in final,false);
  assert.equal(calls.length,3);
});
