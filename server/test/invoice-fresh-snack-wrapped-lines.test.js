import test from "node:test";
import assert from "node:assert/strict";
import {recoverFreshSnackWrappedLines} from "../src/lib/invoice-fresh-snack-wrapped-lines.js";

const products=[
  ["101","SPECIAL BOLIKO",6,2.10,5.5,11.91],
  ["102","TIME OUT",6,1.85,5.5,10.49],
  ["100103","ΓΑΛΟΠΟΥΛΑ ΣΑΝΤΟΥΙΤΣ 230gr",4,2.10,5.5,7.94],
  ["105","DOUBLE BURGER",3,2.22,5.5,6.29],
  ["108","ΑΡΑΒ. ΚΟΤΟΠΟΥΛΟ",1,2.22,5.5,2.10],
  ["171","ΑΡΑΒ. ΚΟΤΟΓΥΡΟΣ",8,2.33,5.5,17.61],
  ["175","ΤΕΤΡΑΓΩΝΟ ΠΟΛΥΣΠΟΡΟ ΓΑΛΟΠΟΥΛΑ",5,1.16,0,5.80],
  ["230","ΣΑΝΤ. TEXAS BURGER",5,2.20,5.5,10.39],
  ["400112","Croissant CHOCO BIG 250gr (2E)",12,1.33,0,15.96]
];

function wrappedLines(){
  return products.flatMap(([code,description,quantity,price,discount,net],index)=>[
    {supplierItemCode:code,description,quantity:0,unitPrice:0,netAmount:0,vatRate:0,azureRawRow:`${code} ${description} TEM`},
    {supplierItemCode:`2609${String(index+8).padStart(2,"0")}`,description:"",quantity:0,unitPrice:price,netAmount:0,vatRate:13,azureRawRow:`2609${String(index+8).padStart(2,"0")} ${quantity.toFixed(2)} ${price.toFixed(2)} 0.00 ${discount.toFixed(2)} 0.00 0.00 ${net.toFixed(2)} 13`}
  ]);
}

test("Fresh Snack joins each wrapped description/economics pair and proves the footer",()=>{
  const parsed={productLines:wrappedLines(),totalNet:88.49,totalVat:11.50,totalGross:99.99};
  const result=recoverFreshSnackWrappedLines(parsed);
  assert.equal(result.productLines.length,9);
  assert.equal(result.freshSnackWrappedTableRecovered,true);
  assert.deepEqual(result.freshSnackRecoveredTotals,{net:88.49,vat:11.5,gross:99.99});
  assert.deepEqual(
    result.productLines.map(line=>[line.supplierItemCode,line.quantity,line.unitPrice,line.discount1,line.netAmount,line.vatRate]),
    products.map(([code,,quantity,price,discount,net])=>[code,quantity,price,discount,net,13])
  );
});

test("Fresh Snack fails closed when a continuation is ambiguous",()=>{
  const productLines=wrappedLines();
  productLines[3]={...productLines[3],azureRawRow:"260909 unreadable continuation"};
  const parsed={productLines,totalNet:88.49,totalVat:11.50,totalGross:99.99};
  assert.equal(recoverFreshSnackWrappedLines(parsed),parsed);
});

test("Fresh Snack fails closed when reconstructed rows do not match the printed footer",()=>{
  const parsed={productLines:wrappedLines(),totalNet:88.49,totalVat:11.50,totalGross:100.99};
  assert.equal(recoverFreshSnackWrappedLines(parsed),parsed);
});
