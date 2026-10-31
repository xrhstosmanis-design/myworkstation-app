const estimates={margin:'estimatedMargin',grossProfit:'estimatedGrossProfit',netProfit:'estimatedNetProfit'};
export function businessPictureCell(row,key){
 const value=row[key];if(value!=null)return {value,estimated:false};
 const field=estimates[key],estimate=field?row[field]:null;
 return field&&row.profitEstimateBasis==='CATEGORY_KNOWN_SALES'&&Number(row.unestimatedCostLines||0)===0&&typeof estimate==='number'&&Number.isFinite(estimate)?{value:estimate,estimated:true}:{value,estimated:false};
}
const estimateColumns=[['estimatedMargin','Εκτιμώμενο Margin (%)'],['estimatedGrossProfit','Εκτιμώμενο ακαθάριστο κέρδος (€)'],['estimatedNetProfit','Εκτιμώμενο καθαρό κέρδος (€)'],['costCoveragePercent','Κάλυψη κόστους πωλήσεων (%)'],['unestimatedCostLines','Γραμμές χωρίς βάση εκτίμησης']];
export function businessPictureCsv(data,columns){
 const rows=[['Περίοδος',...columns.map(([,label])=>label),...estimateColumns.map(([,label])=>label)]];
 for(const row of data?.monthly||[])rows.push([row.month,...columns.map(([key])=>row[key]??''),...estimateColumns.map(([key])=>typeof row[key]==='number'&&Number.isFinite(row[key])?Number(row[key].toFixed(2)):'')]);
 return '\ufeff'+rows.map(row=>row.map(value=>`"${String(value).replace(/"/g,'""')}"`).join(';')).join('\n');
}
