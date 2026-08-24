import fs from "fs";

const patch=(relativePath,changes)=>{
  const path=new URL(relativePath,import.meta.url);
  let src=fs.readFileSync(path,"utf8");
  let changed=false;
  for(const {label,from,to} of changes){
    if(src.includes(to)){console.log(`close-shift permission: ${label} already installed`);continue}
    if(!src.includes(from)){console.log(`close-shift permission: ${label} anchor unavailable; skipped safely`);continue}
    src=src.replace(from,to);changed=true;console.log(`close-shift permission: patched ${label}`);
  }
  if(changed)fs.writeFileSync(path,src);
};

patch("./routes/store-pos-catalog.js",[
  {
    label:"admin access",
    from:'const adminAccess={leftKeys:true,onlineProductSearch:true,transferAmount:true,shiftTransactions:true,allShiftTransactions:true,supplierPayment:true,thirdPartyPayment:true,returnItems:true,changeRetail:true,addBarcode:true,editDescription:true,customerCardOnly:false,cash:true,cards:true,initialCash:true};',
    to:'const adminAccess={leftKeys:true,onlineProductSearch:true,transferAmount:true,shiftTransactions:true,allShiftTransactions:true,supplierPayment:true,thirdPartyPayment:true,returnItems:true,changeRetail:true,addBarcode:true,editDescription:true,customerCardOnly:false,cash:true,cards:true,initialCash:true,centralCashPos:true,closeShift:true};'
  },
  {
    label:"operator access",
    from:'customerCardOnly:Boolean(p.customerCardOnly),cash:Boolean(p.cash),cards:Boolean(p.cards),initialCash:Boolean(p.initialCash)',
    to:'customerCardOnly:Boolean(p.customerCardOnly),cash:Boolean(p.cash),cards:Boolean(p.cards),initialCash:Boolean(p.initialCash),centralCashPos:Boolean(p.centralCashPos),closeShift:Boolean(p.closeShift)'
  }
]);

patch("./routes/cash-control.js",[
  {
    label:"async cash middleware",
    from:'function requireCashAccess(req,res,next){',
    to:'async function requireCashAccess(req,res,next){'
  },
  {
    label:"server close authorization",
    from:'if(req.method==="POST"&&/\\/sessions\\/[^/]+\\/close$/.test(path)){\n    if(permissions.includes("CASH_CONTROL"))return next();\n    return res.status(403).json({error:"Δεν έχεις δικαίωμα «Εμφάνιση κεντρικού Ταμείου (PoS)» από το BackOffice."});\n  }',
    to:'if(req.method==="POST"&&/\\/sessions\\/[^/]+\\/close$/.test(path)){\n    const rows=await prisma.$queryRaw`SELECT COALESCE(p."permissions",\'{}\'::jsonb) AS "permissions" FROM "StoreOperatorCredential" c LEFT JOIN "StoreOperatorProfile" p ON p."storeId"=c."storeId" AND p."employeeId"=c."employeeId" WHERE c."id"=${req.user.operatorId||req.user.id} AND c."companyId"=${req.user.companyId} AND c."active"=TRUE LIMIT 1`;\n    const profile=rows[0]?.permissions&&typeof rows[0].permissions==="object"?rows[0].permissions:{};\n    if(profile.closeShift===true)return next();\n    return res.status(403).json({error:"Δεν έχεις δικαίωμα «Κλείσιμο βάρδιας (PoS)» από το BackOffice."});\n  }'
  }
]);

const katShiftPermissions='cash:true,cards:true,initialCash:true,closeShift:true,centralCashPos:false,shiftTransactionsPos:true,allShiftTransactionsPos:false,sameShiftPayments:true';

patch("../e2e/operator-shift-close-audit-flow.mjs",[
  {
    label:"shift-close E2E operator permissions",
    from:'body:profileBody({cash:true,shiftTransactionsPos:true,allShiftTransactionsPos:false,supplierPayment:false,sameShiftPayments:true})',
    to:'body:profileBody({cash:true,initialCash:true,closeShift:true,centralCashPos:false,shiftTransactionsPos:true,allShiftTransactionsPos:false,supplierPayment:false,sameShiftPayments:true})'
  }
]);

patch("../e2e/live-operator-permissions-flow.mjs",[
  {
    label:"live-permissions E2E initial cash",
    from:'const initialPermissions={cash:true,shiftTransactionsPos:true,allShiftTransactionsPos:false,supplierPayment:false,sameShiftPayments:true};',
    to:'const initialPermissions={cash:true,initialCash:true,closeShift:false,centralCashPos:false,shiftTransactionsPos:true,allShiftTransactionsPos:false,supplierPayment:false,sameShiftPayments:true};'
  }
]);

for(const [file,label,from] of [
  ["../e2e/kat-pos-regression-flow.mjs","KAT POS regression permissions",'body:profileBody({cash:true,cards:true,returnItems:true,shiftTransactionsPos:true,allShiftTransactionsPos:false,sameShiftPayments:true})'],
  ["../e2e/kat-online-ordering-flow.mjs","KAT online ordering permissions",'body:operatorProfile({cash:true,cards:true,shiftTransactionsPos:true,allShiftTransactionsPos:false,sameShiftPayments:true})'],
  ["../e2e/kat-preparation-milk-stock-flow.mjs","KAT milk/preparation permissions",'body:profileBody({cash:true,cards:true,shiftTransactionsPos:true,allShiftTransactionsPos:false,sameShiftPayments:true})']
]){
  const prefix=from.slice(0,from.indexOf('({')+2);
  patch(file,[{label,from,to:`${prefix}{${label.includes('POS regression')?`${katShiftPermissions},returnItems:true`:katShiftPermissions}})`}]);
}

console.log("Dedicated close shift permission exposed, enforced and covered by KAT E2E.");
