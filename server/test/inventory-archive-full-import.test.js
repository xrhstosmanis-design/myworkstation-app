import test from "node:test";
import assert from "node:assert/strict";
import {importFullArchive} from "../src/routes/inventory-archive-full-import.js";

test("full archive import passes product relationships and never overwrites stock",async()=>{
  const lookups=[
    [{id:"cat",name:"ΨΙΛΙΚΑ"}],
    [{id:"sub",name:"ΤΕΧΝΟΛΟΓΙΑ",categoryName:"ΨΙΛΙΚΑ"}],
    [{id:"supplier",name:"ΤΟΛΗΣ ΟΕ"}],
    [{id:"brand",name:"TOSHIBA"}],
    [{id:"vat",description:"ΕΙΔΗ 24",vatRate:24}]
  ];
  const statements=[];let lookup=0;
  const tx={$queryRaw:async()=>lookups[lookup++],$executeRaw:async()=>1,$executeRawUnsafe:async(sql,...args)=>{statements.push({sql,args});return 1}};
  const row={row:2,action:"CREATE",productId:null,sku:"A01",barcode:"5200000000000",name:"ΜΠΑΤΑΡΙΑ",categoryName:"ΨΙΛΙΚΑ",subcategoryName:"ΤΕΧΝΟΛΟΓΙΑ",supplierName:"ΤΟΛΗΣ ΟΕ",supplierCode:"T1",brandName:"TOSHIBA",sourceDepartment:"ΕΙΔΗ 24",vatRate:24,salePrice:2,costPrice:1,staffPrice:1.5,minStock:5,discountA:2,discountB:3,discountC:0,active:true,stock:null};
  const result=await importFullArchive(tx,"company","store",[row]);
  assert.deepEqual(result,{created:1,updated:0});
  assert.equal(statements.length,5);
  const imported=JSON.parse(statements[0].args[0])[0];
  assert.equal(imported.supplierId,"supplier");assert.equal(imported.supplierCode,"T1");
  assert.equal(imported.subcategoryId,"sub");assert.equal(imported.brandId,"brand");
  assert.equal(imported.departmentId,"vat");assert.equal(imported.minStock,5);
  assert.equal(imported.staffPrice,1.5);assert.equal(imported.discountB,3);
  assert.equal(Object.hasOwn(imported,"stock"),false);
  assert.match(statements[3].sql,/"currentStock","active"/);
  assert.match(statements[3].sql,/"minStock",0,active/);
  assert.doesNotMatch(statements[3].sql,/DO UPDATE SET[^;]*"currentStock"/);
});
