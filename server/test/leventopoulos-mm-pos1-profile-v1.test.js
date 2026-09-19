import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {combineAzureRows,extractAzureColumns,recoverLeventopoulosMmPos1Columns} from "../src/lib/invoice-column-reading.js";

test("Λεβεντόπουλος reads the unique balanced ΜΜ | ΠΟΣ1 | ΠΟΣ2 | ΤΙΜΗ chain",()=>{
  const input={
    code:"e48266",rawText:"e48266 ΣΥΛ MAGIC DBL GOLD CAR 10 20.00 1.00 2.800 0.0 56.00 13",
    quantity:10,unitCost:20,netAmount:56,vatRate:13
  };
  const line=recoverLeventopoulosMmPos1Columns(input);
  assert.equal(line.quantity,20);
  assert.equal(line.unitCost,2.8);
  assert.equal(line.netAmount,56);
  assert.equal(line.sourceColumnsVerified,true);
});

test("Λεβεντόπουλος leaves an unbalanced physical row for review",()=>{
  const input={rawText:"e48266 ΣΥΛ MAGIC DBL GOLD CAR 10 20.00 1.00 2.800 0.0 55.90 13",quantity:10,unitCost:20,netAmount:55.9};
  assert.equal(recoverLeventopoulosMmPos1Columns(input),input);
});

test("Λεβεντόπουλος never uses a product-name number as ΠΟΣ1",()=>{
  const line=recoverLeventopoulosMmPos1Columns({rawText:"e80549 ΚΥΠ B&J STRAWDOUGH 4 10 10.00 0.13 0.802 0.0 8.02 13",quantity:10,unitCost:.802,netAmount:8.02});
  assert.equal(line.quantity,10);
  assert.equal(line.unitCost,.802);
  assert.equal(line.netAmount,8.02);
});

test("Azure removes an item whose split code is already represented by a table row",()=>{
  const table=[{code:"e67977ΑΓ",description:"ΣΑΝΤΟΥΙΤΣ MAGIC ALMOND",sourcePage:1,sourceColumnsVerified:true}];
  const items=[{code:"e67977",description:"",sourcePage:1},{code:"e48266",description:"OTHER",sourcePage:1}];
  assert.deepEqual(combineAzureRows(items,table).map(line=>line.code),["e67977ΑΓ","e48266"]);
});

test("Λεβεντόπουλος reads ΠΟΣ1 and ΤΙΜΗ from their exact Azure table cells",()=>{
  const cells=[
    ["ΚΩΔΙΚΟΣ","code"],["ΕΙΔΟΣ","description"],["ΜΜ","unit"],["ΠΟΣ1","pos1"],["ΠΟΣ2","pos2"],["ΤΙΜΗ","price"],["ΕΚΠ%","discount"],["Κ. ΑΞΙΑ","net"],["ΦΠΑ","vat"]
  ].map(([content],columnIndex)=>({kind:"columnHeader",rowIndex:0,columnIndex,content}));
  const row=["e80549","ΚΥΠ B&J STRAWDOUGH 4","10","10.00","0.13","0.802","0.0","8.02","13"];
  cells.push(...row.map((content,columnIndex)=>({rowIndex:1,columnIndex,content,boundingRegions:[{pageNumber:1,polygon:[0,0,1,0,1,1,0,1]}]})));
  const [line]=extractAzureColumns({tables:[{cells,boundingRegions:[{pageNumber:1,polygon:[0,0,1,0,1,1,0,1]}]}]});
  assert.equal(line.quantity,10);
  assert.equal(line.unitCost,.802);
  assert.equal(line.netAmount,8.02);
  assert.equal(line.sourceColumnsVerified,true);
  assert.equal(recoverLeventopoulosMmPos1Columns(line),line);
});

test("the supplier rule is central, scoped by ΑΦΜ and does not preserve old invoice economics",async()=>{
  const [seed,runtime]=await Promise.all([
    readFile(new URL("../src/seed-invoice-profile-dimotsios.js",import.meta.url),"utf8"),
    readFile(new URL("../src/lib/invoice-supplier-profile-runtime.js",import.meta.url),"utf8")
  ]);
  assert.match(seed,/LEVENTOPOULOS_MM_POS1_COLUMNS/);
  assert.match(seed,/800503361/);
  assert.match(runtime,/productLines=productLines\.map\(recoverLeventopoulosMmPos1Columns\)/);
  assert.doesNotMatch(seed,/172\.18|194\.55|194\.77/);
});
