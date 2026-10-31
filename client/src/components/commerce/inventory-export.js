const escape=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
export function inventoryCsv(filename,columns,rows){
 const csv=[columns.map(column=>column[1]),...rows.map(row=>columns.map(([key])=>row[key]))].map(row=>row.map(value=>'"'+String(value??'').replaceAll('"','""')+'"').join(';')).join('\n');
 const url=URL.createObjectURL(new Blob(['\ufeff'+csv],{type:'text/csv;charset=utf-8'})),link=document.createElement('a');link.href=url;link.download=filename;link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
export function printInventoryRows(rows,{size='A6',labels=true}={}){
 const popup=window.open('','_blank','width=900,height=700');if(!popup)return;
 popup.document.write(`<html><head><title>Εκτύπωση ειδών</title><style>@page{size:${['A4','A5','A6'].includes(size)?size:'A6'};margin:10mm}body{font-family:Arial;text-align:center}article{break-after:page}.name{font-size:${labels?18:42}px;font-weight:900}.price{font-size:${labels?26:72}px;font-weight:900;margin:18px}.barcode{font-family:monospace;font-size:20px;letter-spacing:4px;border-top:3px solid #111;border-bottom:3px solid #111;padding:12px}</style></head><body>${rows.map(row=>`<article><div class="name">${escape(row.name)}</div><div class="price">${Number(row.salePrice||0).toFixed(2)} €</div><div class="barcode">${escape(row.barcode)}</div><small>${escape(row.sku)}</small></article>`).join('')}<script>onload=()=>print()<\/script></body></html>`);popup.document.close();
}
export const inventoryHistoryColumns={
 movements:[['createdAt','Ημερομηνία'],['movementType','Κίνηση'],['actorName','Χειριστής'],['unitCost','Κόστος'],['inQty','Είσοδος'],['outQty','Έξοδος'],['stockAfter','Απόθεμα'],['note','Σημείωση']],
 purchases:[['supplierName','Προμηθευτής'],['invoicedAt','Ημερομηνία'],['quantity','Ποσότητα'],['unitCost','Καθαρή αγορά'],['initialUnitCost','Αρχική αγορά'],['discount1','Έκπτωση 1'],['discount2','Έκπτωση 2'],['discount3','Έκπτωση 3'],['vatRate','ΦΠΑ'],['grossAmount','Σύνολο'],['invoiceNumber','Τιμολόγιο']],
 'price-history':[['createdAt','Ημερομηνία'],['storeName','Κατάστημα'],['oldPrice','Παλιά λιανική'],['newPrice','Νέα λιανική'],['changeType','Τύπος']]
};
