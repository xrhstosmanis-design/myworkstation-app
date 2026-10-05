import {comparisonUnit} from "./supplier-price-comparison.js";

const number=value=>value==null||String(value).trim()===""?null:Number.isFinite(Number(value))?Number(value):null;
const time=value=>{if(value==null||value==="")return null;const n=new Date(value).getTime();return Number.isFinite(n)?n:null;};

// Approved financial net amounts already include recorded discounts. Never use
// current catalog cost, descriptions or inferred packs as historical evidence.
export function purchaseCost(lines,product,cutoff){
  const unit=comparisonUnit(product.unit),first=lines[0];
  if(!unit||!first||product.hasRecipe)return null;
  if(first.sourceType==="PURCHASE_ORDER"){
    if(unit.base!=="PIECE")return null;
    if(first.correctionId){
      if(time(first.correctionAt)===null||time(first.correctionAt)>cutoff)return null;
      const cost=number(first.correctedUnitCost);return cost!==null&&cost>=0?cost:null;
    }
    const quantity=number(first.orderBaseQuantity),amount=number(first.orderNetAmount);
    return Number(first.orderInvalidUnits)===0&&quantity>0&&amount!==null&&amount>=0?amount/quantity:null;
  }
  let quantity=0,amount=0;
  for(const line of lines){
    const q=number(line.quantity),net=number(line.netAmount);
    if(!(q>0)||net===null||net<0)return null;
    let conversion=comparisonUnit(line.unit);
    if(String(line.unit||"").trim().toUpperCase()==="PACKAGE"){
      const pack=number(line.unitsPerPackage);
      if(unit.base!=="PIECE"||!(pack>0))return null;
      conversion={base:"PIECE",factor:pack};
    }
    if(!conversion||conversion.base!==unit.base)return null;
    quantity+=q*conversion.factor;amount+=net;
  }
  return quantity>0?amount/quantity*unit.factor:null;
}

export function buildLowValueProducts(products,sales,purchases,{historyDays=30,slowDays=90,marginPercent=20}={}){
  if(!Number.isInteger(historyDays)||historyDays<7||historyDays>365||!Number.isInteger(slowDays)||slowDays<1||slowDays>730||!Number.isFinite(marginPercent)||marginPercent<0||marginPercent>100)throw Error("Μη έγκυρα όρια αναφοράς.");
  const documents=new Map(),saleGroups=new Map();
  for(const line of purchases){
    if(!documents.has(line.productId))documents.set(line.productId,new Map());
    const map=documents.get(line.productId);
    if(!map.has(line.documentId))map.set(line.documentId,[]);
    map.get(line.documentId).push(line);
  }
  for(const line of sales){if(!saleGroups.has(line.productId))saleGroups.set(line.productId,[]);saleGroups.get(line.productId).push(line);}
  return products.map(product=>{
    const unit=comparisonUnit(product.unit),stock=product.trackStock?number(product.currentStock):null;
    const candidates=[...(documents.get(product.productId)?.values()||[])].sort((a,b)=>time(b[0].documentDate)-time(a[0].documentDate)||time(b[0].documentCreatedAt)-time(a[0].documentCreatedAt)||String(b[0].documentId).localeCompare(String(a[0].documentId)));
    let sold=0,returned=0,netSales=0,cost=0,missingCostLines=0,invalidLines=0,lastSaleAt=null;
    const evidence=new Map();
    for(const line of saleGroups.get(product.productId)||[]){
      const quantity=number(line.quantity),gross=number(line.lineTotal),vat=number(line.vatRate);
      if(line.amountsReconciled===false||quantity===null||gross===null||vat===null||vat<0||vat>100||(quantity===0&&gross!==0)||(quantity>0&&gross<0&&line.source!=="POS_REVERSAL")||(quantity<0&&gross>0)){invalidLines++;continue;}
      const reversal=line.source==="POS_REVERSAL",signedQuantity=reversal?-Math.abs(quantity):quantity,signedGross=reversal?-Math.abs(gross):gross;
      sold+=Math.max(0,signedQuantity);returned+=Math.max(0,-signedQuantity);netSales+=signedGross/(1+vat/100);
      if(signedQuantity>0&&(!lastSaleAt||time(line.occurredAt)>time(lastSaleAt)))lastSaleAt=line.occurredAt;
      const cutoff=time(reversal?line.originalOccurredAt:line.occurredAt);
      const document=cutoff===null?null:candidates.find(rows=>time(rows[0].documentDate)!==null&&time(rows[0].documentDate)<=cutoff);
      const unitCost=document?purchaseCost(document,product,cutoff):null;
      if(unitCost===null){missingCostLines++;continue;}
      cost+=signedQuantity*unitCost;
      evidence.set(document[0].documentId,{documentId:document[0].documentId,number:document[0].documentNumber,date:document[0].documentDate});
    }
    const netQuantity=sold-returned,daysOfStock=stock!==null&&stock>=0&&netQuantity>0?stock/(netQuantity/historyDays):null;
    const salesLines=(saleGroups.get(product.productId)||[]).length;
    const costComplete=salesLines>0&&missingCostLines===0&&invalidLines===0;
    const profit=costComplete?netSales-cost:null,margin=costComplete&&netSales>0?profit/netSales*100:null;
    const flags=[],warnings=[];
    if(!invalidLines){
      if(stock!==null&&stock>0&&sold===0)flags.push("NO_SALES");
      else if(stock!==null&&stock>0&&netQuantity<=0)flags.push("NO_NET_MOVEMENT");
      else if(daysOfStock!==null&&daysOfStock>slowDays)flags.push("SLOW_MOVEMENT");
    }
    if(profit!==null&&netSales>0){if(profit<0)flags.push("LOSS");else if(margin<marginPercent)flags.push("LOW_MARGIN");}
    if(missingCostLines||invalidLines||(product.trackStock&&stock===null))flags.push("REVIEW");
    if(product.trackStock&&stock===null)warnings.push("Λείπει έγκυρο απόθεμα — χρειάζεται έλεγχος ποσότητας.");
    if(stock!==null&&stock<0)warnings.push("Αρνητικό απόθεμα — χρειάζεται έλεγχος ποσότητας.");
    if(!unit)warnings.push("Άγνωστη μονάδα: δεν υπολογίζεται τεκμηριωμένο περιθώριο.");
    if(product.hasRecipe)warnings.push("Προϊόν συνταγής: κόστος υλικών δεν υπολογίζεται εδώ.");
    if(returned>sold)warnings.push("Οι επιστροφές υπερβαίνουν τις πωλήσεις της περιόδου.");
    if(netSales<=0&&salesLines)warnings.push("Μη θετικές καθαρές πωλήσεις: δεν αξιολογείται περιθώριο.");
    if(missingCostLines)warnings.push(`${missingCostLines} γραμμές χωρίς έγκυρο ιστορικό κόστος.`);
    if(invalidLines)warnings.push(`${invalidLines} γραμμές με ασυνεπή στοιχεία — έλεγχος ποσών/ποσοτήτων.`);
    if((saleGroups.get(product.productId)||[]).some(line=>line.amountsReconciled===false))warnings.push("Το σύνολο πώλησης δεν συμφωνεί με τις γραμμές: μη επιμερισμένη έκπτωση ή ασυνεπές ποσό. Τα ποσά παραμένουν άγνωστα.");
    return {...product,currentStock:stock,unitLabel:unit?(unit.factor===1?unit.label:product.unit):product.unit||"—",soldQuantity:invalidLines?null:sold,returnedQuantity:invalidLines?null:returned,netQuantity:invalidLines?null:netQuantity,salesNet:invalidLines?null:netSales,
      costValue:costComplete?cost:null,profit,margin,costComplete,missingCostLines,invalidLines,salesLines,daysOfStock:invalidLines?null:daysOfStock,lastSaleAt,flags,warnings,costEvidence:[...evidence.values()]};
  }).sort((a,b)=>b.flags.length-a.flags.length||String(a.name).localeCompare(String(b.name),"el")||String(a.productId).localeCompare(String(b.productId)));
}
