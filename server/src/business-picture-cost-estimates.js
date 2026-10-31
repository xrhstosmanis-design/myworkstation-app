// Estimates never replace the report's canonical actual-cost fields.
const fields=['knownSalesNet','knownSalesCost','knownQuantity','knownUnitCostValue','missingSalesNet','missingZeroSalesQuantity','missingPricedLines','missingZeroPriceLines','unsafeMissingLines','missingCostLines'];
const key=(...values)=>JSON.stringify(values);
const n=value=>Number(value||0);
function groupsFor(row){
 if(!Array.isArray(row.costGroups))return null;
 const groups=row.costGroups.map(g=>({...g,...Object.fromEntries(fields.map(f=>[f,Number(g[f])]))}));
 if(groups.some(g=>!g.storeId||fields.some(f=>!Number.isFinite(g[f]))||['missingPricedLines','missingZeroPriceLines','unsafeMissingLines','missingCostLines'].some(f=>(!Number.isInteger(g[f])||g[f]<0))||g.missingPricedLines+g.missingZeroPriceLines+g.unsafeMissingLines!==g.missingCostLines))return null;
 return groups.reduce((sum,g)=>sum+g.missingCostLines,0)===n(row.missingCostLines)?groups:null;
}
const blank=()=>({knownSalesNet:0,knownSalesCost:0,knownQuantity:0,knownUnitCostValue:0});
function add(map,id,g){const b=map.get(id)||blank();for(const f of Object.keys(b))b[f]+=g[f];map.set(id,b)}
const ratio=b=>b&&b.knownSalesNet>0&&b.knownSalesCost>=0?b.knownSalesCost/b.knownSalesNet:null;
const unit=b=>b&&b.knownQuantity>0&&b.knownUnitCostValue>=0?b.knownUnitCostValue/b.knownQuantity:null;
export function applyBusinessPictureCostEstimates(rows){
 const category=new Map(),storeUnit=new Map(),store=new Map(),parsed=rows.map(groupsFor);
 for(const groups of parsed)for(const g of groups||[]){add(category,key(g.storeId,g.categoryId,g.costUnit),g);add(storeUnit,key(g.storeId,g.costUnit),g);add(store,key(g.storeId),g)}
 return rows.map((row,i)=>{
  const missing=n(row.missingCostLines),groups=parsed[i];
  const knownCost=Number(row.estimateKnownCostValue??(missing===0?row.costValue:NaN));
  if(!groups||!Number.isFinite(knownCost))return {...row,estimatedCostValue:null,unestimatedCostLines:missing,categoryEstimatedCostLines:0,storeEstimatedCostLines:0};
  let cost=knownCost,unestimated=0,categoryLines=0,storeLines=0;
  for(const g of groups){
   const cb=category.get(key(g.storeId,g.categoryId,g.costUnit)),ub=storeUnit.get(key(g.storeId,g.costUnit)),sb=store.get(key(g.storeId));
   unestimated+=g.unsafeMissingLines;
   if(g.missingPricedLines){const own=ratio(cb),rate=own??ratio(ub)??ratio(sb);if(rate==null||!Number.isFinite(rate))unestimated+=g.missingPricedLines;else{cost+=g.missingSalesNet*rate;if(own!=null)categoryLines+=g.missingPricedLines;else storeLines+=g.missingPricedLines}}
   if(g.missingZeroPriceLines){const own=unit(cb),rate=own??unit(ub);if(rate==null||!Number.isFinite(rate))unestimated+=g.missingZeroPriceLines;else{cost+=g.missingZeroSalesQuantity*rate;if(own!=null)categoryLines+=g.missingZeroPriceLines;else storeLines+=g.missingZeroPriceLines}}
  }
  return {...row,estimatedCostValue:unestimated||!Number.isFinite(cost)?null:cost,unestimatedCostLines:unestimated,categoryEstimatedCostLines:categoryLines,storeEstimatedCostLines:storeLines};
 });
}

export function collectBusinessPictureMissingCosts(rows){
 const products=new Map();
 for(const row of rows)for(const item of row.missingCostDetails||[]){
  const id=key(item.storeId,item.productId,item.productId?null:item.name,item.reason,row.day);
  const current=products.get(id)||{id,storeId:item.storeId,productId:item.productId,name:item.name||'Μη διαθέσιμο είδος',sku:item.sku||'',reason:item.reason,lines:0,quantity:0,salesGross:0,salesNet:0,day:row.day,month:row.month};
  current.lines++;current.quantity+=n(item.quantity);current.salesGross+=n(item.salesGross);current.salesNet+=n(item.salesNet);products.set(id,current);
 }
 return [...products.values()].sort((a,b)=>b.salesGross-a.salesGross||a.id.localeCompare(b.id));
}
