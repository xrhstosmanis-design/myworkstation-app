import fs from "fs";

const path=new URL("./routes/platform-invoice-learning-ai.js",import.meta.url);
let src=fs.readFileSync(path,"utf8");
const marker="IFANTIS_PRICE_SCALE_REPAIR_V2";
if(src.includes(marker)){
  console.log("IFANTIS price-scale repair already installed.");
  process.exit(0);
}

// The current Azure-only supplier parser already owns IFANTIS price recovery.
// If that parser is present, this legacy OpenAI-response patch must not run or
// require stale response anchors during startup.
if(src.includes('ifantisBrokenPrice')||src.includes('IFANTIS wrapped-row arithmetic recovery')||src.includes('supplierAzureProfile(')){
  console.log("IFANTIS V2 legacy patch skipped: handled by Azure-only supplier parser.");
  process.exit(0);
}

const responseNeedles=[
  '  res.json({ok:true,provider:"OPENAI",model:process.env.OPENAI_INVOICE_MODEL||"gpt-5",supplierProfile:activeSupplierProfile?.key||null,...result});',
  '  res.json({ok:true,provider:"OPENAI",model:process.env.OPENAI_INVOICE_MODEL||"gpt-5",...result});'
];
const responseNeedle=responseNeedles.find(x=>src.includes(x));
if(!responseNeedle){
  console.log("IFANTIS V2 legacy patch skipped: compatible OpenAI response anchor not present.");
  process.exit(0);
}

const code=`  // ${marker}\n  if(activeSupplierProfile?.key==="IFANTIS_FOOD_GROUP"&&result&&Array.isArray(result.productLines)){\n    result.productLines=result.productLines.map(line=>{\n      const q=Math.max(0,Number(line?.quantity||0));\n      const net=Math.max(0,Number(line?.netAmount||0));\n      const rawPrice=Math.max(0,Number(line?.unitPrice||0));\n      if(!(q>0&&net>0&&rawPrice>100))return line;\n      const discounts=[line?.discount1,line?.discount2,line?.discount3].map(Number).filter(v=>Number.isFinite(v)&&v>0&&v<100);\n      let factor=1;for(const d of discounts)factor*=1-d/100;\n      const inferred=factor>0?money4((net/q)/factor):money4(net/q);\n      if(!(inferred>0&&inferred<100))return line;\n      const vat=Math.max(0,Number(line?.vatRate||0));\n      return {...line,unitPrice:inferred,netUnitCost:money4(net/q),grossAmount:money4(net+(vat>0?net*vat/100:0)),confidence:Math.min(100,Math.max(Number(line?.confidence||0),95)),priceScaleRepaired:true};\n    });\n  }\n`;

src=src.replace(responseNeedle,`${code}${responseNeedle}`);
fs.writeFileSync(path,src);
console.log("IFANTIS supplier-only price-scale repair V2 installed.");
