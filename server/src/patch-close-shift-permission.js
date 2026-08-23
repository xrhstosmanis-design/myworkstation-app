import fs from "fs";

const path=new URL("./routes/store-pos-catalog.js",import.meta.url);
let src=fs.readFileSync(path,"utf8");

if(!src.includes('closeShift:true')){
  const needle='const adminAccess={leftKeys:true,onlineProductSearch:true,transferAmount:true,shiftTransactions:true,allShiftTransactions:true,supplierPayment:true,thirdPartyPayment:true,returnItems:true,changeRetail:true,addBarcode:true,editDescription:true,customerCardOnly:false,cash:true,cards:true,initialCash:true};';
  if(!src.includes(needle))throw new Error("close-shift permission: admin access anchor not found");
  src=src.replace(needle,'const adminAccess={leftKeys:true,onlineProductSearch:true,transferAmount:true,shiftTransactions:true,allShiftTransactions:true,supplierPayment:true,thirdPartyPayment:true,returnItems:true,changeRetail:true,addBarcode:true,editDescription:true,customerCardOnly:false,cash:true,cards:true,initialCash:true,closeShift:true};');
}

if(!src.includes('closeShift:Boolean(p.closeShift)')){
  const needle='customerCardOnly:Boolean(p.customerCardOnly),cash:Boolean(p.cash),cards:Boolean(p.cards),initialCash:Boolean(p.initialCash)';
  if(!src.includes(needle))throw new Error("close-shift permission: operator access anchor not found");
  src=src.replace(needle,'customerCardOnly:Boolean(p.customerCardOnly),cash:Boolean(p.cash),cards:Boolean(p.cards),initialCash:Boolean(p.initialCash),closeShift:Boolean(p.closeShift)');
}

fs.writeFileSync(path,src);
console.log("Dedicated close shift permission exposed in store POS access.");
