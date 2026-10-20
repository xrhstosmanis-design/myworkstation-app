import test from 'node:test';
import assert from 'node:assert/strict';
import {addSetCartProduct,setCartProductQuantity,removeSetCartProduct} from '../../client/src/components/store/pos-set-cart.js';
const fee={id:'fee',name:'ΕΙΣΦΟΡΑ',salePrice:.05,quantity:1};
const coffee={id:'coffee',name:'ΚΑΦΕΣ',salePrice:1.65,isSet:true,setItems:[fee]};
const total=rows=>Math.round(rows.reduce((sum,r)=>sum+r.quantity*r.salePrice,0)*100)/100;
test('one coffee keeps base price and adds one separate real fee product',()=>{
 const input=[];const rows=addSetCartProduct(input,coffee);
 assert.equal(input.length,0);assert.equal(rows.length,2);assert.equal(rows[0].salePrice,1.65);assert.equal(rows[1].productId,'fee');assert.equal(rows[1].quantity,1);assert.equal(total(rows),1.70);
});
test('repeat scan, quantity increase and decrease keep exactly one fee per coffee',()=>{
 let rows=addSetCartProduct([],coffee);rows=addSetCartProduct(rows,coffee);assert.equal(rows.length,2);assert.equal(total(rows),3.40);
 rows=setCartProductQuantity(rows,'coffee',3);assert.equal(rows[1].quantity,3);assert.equal(total(rows),5.10);
 rows=setCartProductQuantity(rows,'coffee',1);assert.equal(rows[1].quantity,1);assert.equal(total(rows),1.70);
});
test('two different coffees sharing fee never steal each other linked quantities',()=>{
 let rows=addSetCartProduct([],coffee);rows=addSetCartProduct(rows,{...coffee,id:'decaf',salePrice:2});
 assert.equal(rows.length,3);assert.equal(rows.filter(r=>r.productId==='fee').reduce((s,r)=>s+r.quantity,0),2);
 rows=removeSetCartProduct(rows,'coffee');assert.equal(rows.length,2);assert.equal(rows.find(r=>r.productId==='decaf').productId,'decaf');assert.equal(total(rows),2.05);
});
test('barcode price variants retain distinct parents and actual checkout product IDs',()=>{
 let rows=addSetCartProduct([],{...coffee,cartKey:'coffee::barcode::A',salePrice:1.65});rows=addSetCartProduct(rows,{...coffee,cartKey:'coffee::barcode::B',salePrice:2});
 assert.equal(rows[0].productId,'coffee');assert.equal(rows[2].productId,'coffee');assert.equal(rows[1].id,'fee');
 rows=setCartProductQuantity(rows,'coffee::barcode::A',2);assert.equal(rows[1].quantity,3);
 rows=removeSetCartProduct(rows,'coffee::barcode::B');assert.equal(rows.length,2);assert.equal(total(rows),3.40);
});
test('manual standalone fee remains separate and survives parent deletion',()=>{
 let rows=addSetCartProduct([],{...fee,quantity:undefined});rows=addSetCartProduct(rows,coffee);assert.equal(rows.length,2);
 rows=removeSetCartProduct(rows,'coffee');assert.equal(rows.length,1);assert.equal(rows[0].id,'fee');assert.equal(rows[0].quantity,1);
});
test('linked quantity/removal cannot leave an undercharged parent',()=>{
 const rows=addSetCartProduct([],coffee),id=rows[1].id;
 assert.equal(setCartProductQuantity(rows,id,0),rows);assert.equal(removeSetCartProduct(rows,id),rows);
 assert.deepEqual(removeSetCartProduct(rows,'coffee'),[]);
});
test('fractional composition multiplier and multiple components scale without mutation',()=>{
 const rows=addSetCartProduct([],{...coffee,setItems:[{...fee,quantity:2},{id:'extra',salePrice:.2,quantity:.5}]});
 const next=setCartProductQuantity(rows,'coffee',3);assert.equal(next[1].quantity,6);assert.equal(next[2].quantity,1.5);assert.equal(rows[1].quantity,2);
});
test('ordinary cart changes and unrelated control line retain original values',()=>{
 const rows=addSetCartProduct([{id:'control',productId:'control',quantity:2,salePrice:9,preparation:{note:'preserved'}}],{id:'plain',name:'WATER',salePrice:1});
 const next=setCartProductQuantity(rows,'plain',4);assert.equal(next[0],rows[0]);assert.equal(next[1].quantity,4);assert.deepEqual(removeSetCartProduct(next,'plain'),[rows[0]]);
});
test('serialized managed cart recovery preserves identities, quantities and selected modifiers',()=>{
 let rows=addSetCartProduct([],coffee);rows[0]={...rows[0],preparation:{modifiers:[{id:'milk'}]},salePrice:1.85,manualPrice:true};
 rows=JSON.parse(JSON.stringify(rows));rows=addSetCartProduct(rows,coffee);assert.equal(rows[0].salePrice,1.85);assert.deepEqual(rows[0].preparation.modifiers,[{id:'milk'}]);assert.equal(rows[1].quantity,2);
});
test('already open legacy cart is protected from silent repricing or guessed linkage',()=>{
 const legacy=[{...coffee,quantity:2}];assert.throws(()=>addSetCartProduct(legacy,coffee),/υπάρχον καλάθι/);assert.equal(legacy[0].quantity,2);
});
test('invalid linked multipliers fail before returning a modified cart',()=>{
 for(const quantity of [0,-1,NaN,Infinity])assert.throws(()=>addSetCartProduct([],{...coffee,setItems:[{...fee,quantity}]}),/ποσότητα/);
});

test('restored hold using actual product IDs remains linked without extra metadata',()=>{let rows=[{...coffee,quantity:2},{...fee,productId:'fee',quantity:2}];rows=setCartProductQuantity(rows,'coffee',3);assert.equal(rows[1].quantity,3);assert.deepEqual(removeSetCartProduct(rows,'coffee'),[])});
