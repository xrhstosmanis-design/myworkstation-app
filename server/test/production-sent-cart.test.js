import test from 'node:test';
import assert from 'node:assert/strict';
import {addSetCartProduct,setCartProductQuantity,removeSetCartProduct} from '../../client/src/components/store/pos-set-cart.js';

test('sent coffee cannot silently absorb another scan, quantity change or removal',()=>{
 const coffee={id:'coffee',quantity:2,salePrice:2,productionSent:true,preparationId:'batch-1',priceReason:'PREPARATION:batch-1',preparation:{modifiers:[{id:'milk'}]}};
 const rows=[coffee,{id:'water',quantity:1,salePrice:1}],before=JSON.stringify(rows);
 for(const change of [()=>addSetCartProduct(rows,{id:'coffee'}),()=>setCartProductQuantity(rows,'coffee',3),()=>setCartProductQuantity(rows,'coffee',1),()=>removeSetCartProduct(rows,'coffee')])assert.throws(change,/ήδη σταλεί/);
 assert.equal(JSON.stringify(rows),before);
 const next=addSetCartProduct(rows,{id:'water',salePrice:1});
 assert.equal(next[0],coffee);assert.equal(next[1].quantity,2);
 assert.equal(setCartProductQuantity(rows,'coffee',2)[0].preparationId,'batch-1');
});

test('linked SET changes cannot mutate an already dispatched companion',()=>{
 const fee={id:'fee',salePrice:.05,quantity:1};
 const parent={id:'coffee',isSet:true,setItems:[fee],quantity:1,salePrice:2};
 const rows=[parent,{...fee,productionSent:true}],before=JSON.stringify(rows);
 for(const change of [()=>addSetCartProduct(rows,parent),()=>setCartProductQuantity(rows,'coffee',2),()=>removeSetCartProduct(rows,'coffee')])assert.throws(change,/ήδη σταλεί/);
 assert.equal(JSON.stringify(rows),before);
});

test('unsent prepared coffee remains editable before first dispatch',()=>{
 const coffee={id:'coffee',salePrice:2,quantity:1,preparation:{note:'χωρίς ζάχαρη'}};
 const rows=addSetCartProduct([coffee],coffee);
 assert.equal(rows[0].quantity,2);assert.equal(rows[0].preparation,coffee.preparation);
 assert.equal(setCartProductQuantity(rows,'coffee',3)[0].quantity,3);
 assert.deepEqual(removeSetCartProduct(rows,'coffee'),[]);
});
