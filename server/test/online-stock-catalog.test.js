import test from 'node:test';
import assert from 'node:assert/strict';
import {automaticStockCatalog,enoughOnlineStock} from '../src/online-stock-catalog.js';
import {onlineProductAvailable} from '../src/routes/kat-online-ordering-modifiers.js';

test('automatic stock is opt-in and rejects nonfinite, empty and insufficient quantities',()=>{
 assert.equal(automaticStockCatalog({}),false);
 assert.equal(automaticStockCatalog({autoStockCatalogEnabled:'true'}),false);
 assert.equal(automaticStockCatalog({autoStockCatalogEnabled:true}),true);
 for(const stock of [undefined,null,0,-1,NaN,Infinity,'bad'])assert.equal(enoughOnlineStock({currentStock:stock}),false);
 assert.equal(enoughOnlineStock({currentStock:'2'},2),true);
 assert.equal(enoughOnlineStock({currentStock:1},2),false);
 for(const q of [0,-1,Infinity,NaN])assert.equal(enoughOnlineStock({currentStock:2},q),false);
});

test('automatic mode overrides prepared, untracked and ALWAYS stock bypasses without changing manual mode',()=>{
 const coffee={name:'FREDDO ESPRESSO',trackStock:false,availabilityMode:'ALWAYS',currentStock:0};
 assert.equal(onlineProductAvailable(coffee,{stockCheckEnabled:true}),true);
 assert.equal(onlineProductAvailable(coffee,{autoStockCatalogEnabled:true,stockCheckEnabled:false}),false);
 assert.equal(onlineProductAvailable({...coffee,currentStock:2},{autoStockCatalogEnabled:true},2),true);
 assert.equal(onlineProductAvailable({...coffee,currentStock:1},{autoStockCatalogEnabled:true},2),false);
});
