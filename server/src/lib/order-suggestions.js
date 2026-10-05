const number=value=>value===null||value===undefined||value===""?null:Number.isFinite(Number(value))?Number(value):null;
const pieceUnits=new Set(["PIECE","PCS","PC","ΤΜΧ","ΤΕΜ","ΤΕΜ.","ΤΕΜΑΧΙΟ"]);
const measuredUnits=new Map([["KG","kg"],["ΚΙΛΟ","kg"],["G","g"],["GR","g"],["GRAM","g"],["L","L"],["LT","L"],["LITER","L"],["LITRE","L"],["ML","ml"]]);
export function suggestionUnit(value){const key=String(value||"").trim().toLocaleUpperCase("el-GR");return pieceUnits.has(key)?{label:"τεμ.",step:1}:measuredUnits.has(key)?{label:measuredUnits.get(key),step:.001}:null;}

export function buildOrderSuggestions(rows,{historyDays=30,coverageDays=7,leadDays=3}={}){
  if(!Number.isInteger(historyDays)||historyDays<7||historyDays>90||!Number.isInteger(coverageDays)||coverageDays<1||coverageDays>60||!Number.isInteger(leadDays)||leadDays<0||leadDays>30)throw new Error("Μη έγκυρες ημέρες υπολογισμού.");
  return rows.map(row=>{
    const unit=suggestionUnit(row.unit),stock=number(row.currentStock),minimum=row.minStock==null?0:number(row.minStock),sold=number(row.soldQuantity),returned=number(row.returnedQuantity);
    const base={productId:row.productId,name:row.name,sku:row.sku,unitLabel:unit?.label||String(row.unit||"—"),currentStock:stock,minStock:minimum,soldQuantity:sold,returnedQuantity:returned,netQuantity:null,dailyDemand:null,targetStock:null,suggestedQuantity:null,daysRemaining:null,reason:"",warnings:[]};
    if(!unit){base.reason="Χρειάζεται επιβεβαίωση μονάδας αποθήκης.";return base;}
    if(row.hasRecipe){base.reason="Προϊόν συνταγής — χρειάζεται ξεχωριστή πρόταση υλικών.";return base;}
    if(stock===null||minimum===null||minimum<0||sold===null||returned===null||sold<0||returned<0){base.reason="Ελλιπή ή μη έγκυρα στοιχεία αποθέματος/κίνησης.";return base;}
    const net=Math.max(0,sold-returned),daily=net/historyDays,target=Math.max(minimum,daily*(coverageDays+leadDays)),needed=Math.max(0,target-stock);
    const rounded=unit.step===1?Math.ceil(needed-1e-9):Math.ceil(needed*1000-1e-7)/1000;
    Object.assign(base,{netQuantity:net,dailyDemand:daily,targetStock:target,suggestedQuantity:Math.max(0,rounded),daysRemaining:daily>0?Math.max(0,stock)/daily:null,
      reason:daily>0&&daily*(coverageDays+leadDays)>minimum?"Κάλυψη πωλήσεων για τις ημέρες κάλυψης και παράδοσης.":minimum>0?"Κάλυψη του αποθηκευμένου ελάχιστου αποθέματος.":"Δεν υπάρχει θετικό ελάχιστο ή πρόσφατη καθαρή ζήτηση."});
    if(stock<0)base.warnings.push("Αρνητικό απόθεμα: επιβεβαίωσε την ποσότητα πριν παραγγείλεις.");
    if(net===0)base.warnings.push("Χωρίς θετική καθαρή κίνηση στο επιλεγμένο ιστορικό.");
    if(returned>sold)base.warnings.push("Οι επιστροφές/ακυρώσεις υπερβαίνουν τις πωλήσεις της περιόδου· η ζήτηση περιορίζεται στο μηδέν.");
    return base;
  }).sort((a,b)=>(b.suggestedQuantity??-1)-(a.suggestedQuantity??-1)||String(a.name).localeCompare(String(b.name),"el"));
}
