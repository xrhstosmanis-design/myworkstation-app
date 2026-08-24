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

console.log("Dedicated close shift permission exposed and enforced.");
