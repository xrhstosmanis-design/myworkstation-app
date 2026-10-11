import test from 'node:test';
import assert from 'node:assert/strict';
import {createPosScanCatalog,exactScanBarcode,barcodeCartProduct} from '../../client/src/utils/pos-scanner.js';
import {matchesGreekSearch} from '../../client/src/utils/greek-search.js';

test('indexed scanner matches established barcode semantics, including duplicate rows and manual fallback',()=>{
  const products=[
    {id:'csv',name:'ΤΕΡΕΑ',sku:'12237',sourceCode:'12237',barcodes:['5201222305620,5201222304692,5201222302988']},
    {id:'padded',sku:'SKU-A',barcodes:[' 05200000001234~5200000001234 '],barcodeOptions:[{barcode:' 05200000001234 ',salePrice:4.2}]},
    {id:'long',barcodes:['520000000123499']},
    {id:'master',masterCode:'5200000007777',barcodes:[]},
    {id:'sku',sku:'5200000008888',sourceCode:'5200000008888',barcodes:[]},
    {id:'option',barcodes:[],barcodeOptions:[{barcode:'5200000007777',salePrice:8}]},
    {id:'source',sourceCode:'5200000006666',barcodes:[]},
    {id:'short',barcodes:['000001']}
  ];
  for(const rows of [products,products.filter(row=>row.id!=='option'),[products[0],products[0]]]){
    const index=createPosScanCatalog(rows);
    for(const value of ['5201222304692','5201222305620','5201222302988','5200000001234','05200000001234','520000000123499','5200000007777','5200000008888','5200000006666','520000000','SKU-A','12237','ΤΕΡΕΑ','csv','000001','1','','99999999']){
      for(const options of [{},{complete:true},{complete:true,manual:true},{manual:true}])assert.equal(index.exact(value,options),exactScanBarcode(rows,value,options),JSON.stringify({value,options}));
    }
  }
  const product=createPosScanCatalog(products).exact('05200000001234',{complete:true});
  const cart=barcodeCartProduct(product,'05200000001234');
  assert.equal(cart.salePrice,4.2);assert.equal(cart.cartKey,'padded:: 05200000001234 ');
});

test('indexed suggestions preserve Greek accents, final sigma, token matching and first48 catalog order',()=>{
  const products=[{id:'greek',name:'Καφές Ελληνικός',sku:'00042',sourceCode:'Πηγή',barcodes:['5201222305620,5201222304692'],masterCode:'MASTER'},...Array.from({length:100},(_,i)=>({id:String(i),name:'ΝΕΡΟ '+i,sku:'SKU-'+i,barcodes:[String(5200000000000+i)]}))];
  const index=createPosScanCatalog(products);
  for(const query of ['καφες ελληνικοσ','ΠΗΓΗ','MASTER','00042','5201222304692','νερό','νερο 9','SKU-','unknown',' ','','\u0300']){
    const expected=query.trim()?products.filter(row=>matchesGreekSearch(query,[row.name,row.sku,row.sourceCode,row.masterCode,...(row.barcodes||[])])).slice(0,48):[];
    assert.deepEqual(index.search(query),expected,query);
  }
});

test('5000-row steady scans and searches never re-read product identifiers, while fresh store/catalog indexes invalidate',()=>{
  let reads=0;
  const products=Array.from({length:5000},(_,i)=>({id:String(i),get name(){reads++;return 'ΕΙΔΟΣ '+i},get sku(){reads++;return 'SKU-'+i},get barcodes(){reads++;return [String(5200000000000+i)]}}));
  const index=createPosScanCatalog(products),baseline=reads;
  for(let i=0;i<100;i++){
    assert.equal(index.exact('5200000004999'),products[4999]);
    assert.equal(index.exact('5200000004999',{complete:true,manual:true}),products[4999]);
    assert.deepEqual(index.search('5200000004999'),[products[4999]]);
  }
  assert.equal(reads,baseline,'normalization work must not recur per scan/character');
  const fresh={id:'fresh',name:'Νέο προϊόν',barcodes:['5200000004999'],salePrice:6};
  const refreshed=createPosScanCatalog([fresh]);assert.equal(refreshed.exact('5200000004999'),fresh);
  assert.equal(createPosScanCatalog([]).exact('5200000004999'),null,'another store must not use this catalog');
  assert.equal(index.exact('5200000004999'),products[4999],'old immutable index is independent');
});
