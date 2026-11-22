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

test('automatic mode honors explicit ALWAYS and HIDE, never product name or stock tracking shortcuts',()=>{
 const coffee={name:'FREDDO ESPRESSO',trackStock:false,currentStock:0};
 assert.equal(onlineProductAvailable(coffee,{stockCheckEnabled:true}),true);
 assert.equal(onlineProductAvailable(coffee,{autoStockCatalogEnabled:true}),false);
 assert.equal(onlineProductAvailable({...coffee,availabilityMode:'ALWAYS'},{autoStockCatalogEnabled:true},100),true);
 assert.equal(onlineProductAvailable({...coffee,availabilityMode:'ALWAYS',visibilityOverride:false},{autoStockCatalogEnabled:true}),false);
 assert.equal(onlineProductAvailable({...coffee,availabilityMode:'BAKED_SAME',visibilityOverride:true},{autoStockCatalogEnabled:true}),false);
 assert.equal(onlineProductAvailable({...coffee,currentStock:2},{autoStockCatalogEnabled:true},2),true);
 assert.equal(onlineProductAvailable({...coffee,currentStock:1},{autoStockCatalogEnabled:true},2),false);
 for(const q of [0,-1,Infinity,NaN])assert.equal(onlineProductAvailable({...coffee,availabilityMode:'ALWAYS'},{autoStockCatalogEnabled:true},q),false);
});
