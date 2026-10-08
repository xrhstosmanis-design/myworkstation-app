import test from 'node:test';
import assert from 'node:assert/strict';
import {createPosCatalogResolver,matchingStoredCodes,productMatchesCodes} from '../../client/src/utils/pos-catalog-resolver.js';
const rows=[
 {id:'a',name:'ΝΕΡΟ 500ML',sku:'00012',sourceCode:'12~520111',masterCode:'M-1',barcodes:['520111'],categoryName:'ΝΕΡΑ'},
 {id:'b',name:'ΑΛΦΑ',sku:'31',sourceCode:'31~520222',barcodes:['520222'],categoryName:'ΜΠΥΡΕΣ'},
 {id:'c',name:'ΝΕΡΟ 1.5LT',sku:'00120',barcodes:['520333'],categoryName:'ΝΕΡΑ'}
];
test('company category uses exact IDs in published order, excludes SKU aliases and deduplicates repeated IDs',()=>{
 const resolver=createPosCatalogResolver(rows,true);
 assert.deepEqual(resolver.categoryProducts({productCodes:['c','a','c','00012','missing']}).map(p=>p.id),['c','a']);
});
test('duplicate catalog IDs keep last row with original code-order position',()=>{
 const last={...rows[0],name:'UPDATED'};
 assert.deepEqual(createPosCatalogResolver([...rows,last],true).categoryProducts({productCodes:['a','b','a']}),[last,rows[1]]);
});
test('legacy codes preserve zero padding, source parts, punctuation variants, barcode and catalog ordering',()=>{
 const resolver=createPosCatalogResolver(rows,false);
 assert.deepEqual(resolver.categoryProducts({productCodes:['520333','000012','m1']}).map(p=>p.id),['a','c']);
 assert.equal(productMatchesCodes(rows[0],['12']),true);
 assert.deepEqual(matchingStoredCodes(rows[0],['520111','0012','foreign']),['520111','0012']);
});
test('encoded legacy metadata and category-name fallback remain compatible',()=>{
 const resolver=createPosCatalogResolver(rows,false);
 assert.deepEqual(resolver.categoryProducts({categoryName:'ignored::MWSMETA::520333,0012'}).map(p=>p.id),['a','c']);
 assert.deepEqual(resolver.categoryProducts({label:'νερα'}).map(p=>p.id),['a','c']);
});
test('parent count is unique product IDs across children, including encoded child metadata',()=>{
 const resolver=createPosCatalogResolver(rows,true),children=[{productCodes:['a','b']},{productCodes:['b','c']}];
 assert.equal(resolver.categoryCount({children}),3);
 assert.equal(resolver.categoryCount({categoryName:'parent::MWSCHILD::'+encodeURIComponent(JSON.stringify(children))}),3);
});
test('quick buttons preserve earliest catalog match including name-before-ID precedence and missing/blank behavior',()=>{
 const special=[{...rows[0],name:'Contains target'}, {...rows[1],id:'target'}];
 const resolver=createPosCatalogResolver(special,true);
 assert.equal(resolver.quickProduct({productQuery:'target'}),special[0]);
 assert.equal(resolver.quickProduct({productQuery:'absent',label:'Other'}),undefined);
 assert.equal(resolver.quickProduct({productQuery:'',label:''}),special[0]);
 assert.equal(createPosCatalogResolver(rows,true).quickProduct({productQuery:'520222'}),rows[1]);
});
test('unchanged 5000-product button renders reuse results without reading product identifiers/names again',()=>{
 let reads=0;
 const products=Array.from({length:5000},(_,i)=>({id:'p'+i,get name(){reads++;return 'Product '+i},get sku(){reads++;return String(i)},barcodes:[]}));
 const resolver=createPosCatalogResolver(products,true),category={productCodes:['p4999','p1']},quick={productQuery:'missing',label:'Empty'};
 const found=resolver.categoryProducts(category);assert.deepEqual(found.map(p=>p.id),['p4999','p1']);
 assert.equal(resolver.quickProduct(quick),undefined);const baseline=reads;
 for(let i=0;i<20;i++){assert.equal(resolver.categoryProducts(category),found);assert.equal(resolver.categoryCount(category),2);assert.equal(resolver.quickProduct(quick),undefined)}
 assert.equal(reads,baseline);
});
test('new catalog/layout resolver invalidates cached names, membership and company mode; caches do not cross stores',()=>{
 const category={productCodes:['12']},quick={productQuery:'a'};
 const first=createPosCatalogResolver(rows,false);assert.equal(first.categoryProducts(category).length,1);assert.equal(first.quickProduct(quick).name,'ΝΕΡΟ 500ML');
 const updated=rows.map(p=>p.id==='a'?{...p,name:'NEW NAME'}:p),second=createPosCatalogResolver(updated,true);
 assert.equal(second.categoryProducts(category).length,0);assert.equal(second.quickProduct(quick).name,'NEW NAME');
 assert.equal(createPosCatalogResolver([{id:'foreign',name:'Foreign',barcodes:[]}],true).quickProduct(quick),undefined);
});
