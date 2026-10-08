// Keep the existing WASTE accounting path; only the POS entry step changes.
export async function submitPosCloseWithoutPrint({api,storeId,cart,tableOrderId=null,note=null}) {
  const items=(cart||[]).filter(row=>!row.exchangeReturn).map(row=>({
    productId:row.id,
    quantity:Number(String(row.quantity||1).replace(",",".")),
  }));
  if(!items.length)throw new Error("Χτύπησε πρώτα τουλάχιστον ένα προϊόν.");
  if(items.some(row=>!row.productId||!Number.isFinite(row.quantity)||row.quantity<=0)) {
    throw new Error("Έλεγξε τα είδη και τις ποσότητες του καλαθιού.");
  }
  const reason=String(note||"").trim()||null;
  if(tableOrderId&&!reason)throw new Error("Η φύρα τραπεζιού απαιτεί αιτία.");
  const endpoint=tableOrderId
    ?`/api/store-pos/stores/${storeId}/table-orders/${tableOrderId}/waste`
    :`/api/store-pos/stores/${storeId}/waste`;
  return api(endpoint,{method:"POST",body:JSON.stringify({
    items,note:reason,
  })});
}
