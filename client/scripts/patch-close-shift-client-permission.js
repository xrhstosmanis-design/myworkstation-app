import fs from "node:fs";

const path=new URL("../src/components/store/StoreOperatorApp.jsx",import.meta.url);
let src=fs.readFileSync(path,"utf8");
const from='const canTransactions=Boolean(runtimeAccess?.shiftTransactions),canInitialCash=Boolean(runtimeAccess?.initialCash),canCloseShift=Boolean(runtimeAccess?.centralCashPos),allowAllTransactions=Boolean(runtimeAccess?.allShiftTransactions),canMyPayments=Boolean(runtimeAccess?.supplierPayment||runtimeAccess?.thirdPartyPayment);';
const to='const canTransactions=Boolean(runtimeAccess?.shiftTransactions),canInitialCash=Boolean(runtimeAccess?.initialCash),canCloseShift=Boolean(runtimeAccess?.closeShift),allowAllTransactions=Boolean(runtimeAccess?.allShiftTransactions),canMyPayments=Boolean(runtimeAccess?.supplierPayment||runtimeAccess?.thirdPartyPayment);';
if(src.includes(to)||/canCloseShift\s*=\s*Boolean\(runtimeAccess\?\.closeShift\)/.test(src)){
  console.log("close-shift client permission already compiled");
  process.exit(0);
}
if(!src.includes(from)){
  console.error("close-shift client permission anchor missing");
  process.exit(1);
}
src=src.replace(from,to);
fs.writeFileSync(path,src);
console.log("close-shift client permission compiled from dedicated BackOffice permission");
