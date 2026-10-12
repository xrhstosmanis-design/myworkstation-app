function safeText(value,max=300){return typeof value==="string"&&value.length<=max&&!/[\u0000-\u001f\u007f]/.test(value)?value:null}

export function buildEfoodEventList(rows,scope){
  return {preparationOnly:true,commercialExecutionReady:false,events:rows.filter(row=>row.companyId===scope.companyId&&row.storeId===scope.storeId&&row.integrationId===scope.integrationId).map(row=>({id:safeText(row.id),externalOrderId:safeText(row.externalOrderId),externalStatus:["READY_FOR_PICKUP","CANCELLED","DELIVERED"].includes(row.externalStatus)?row.externalStatus:"UNSUPPORTED"})).filter(row=>row.id)};
}

export function buildEfoodEventPreview({event,parsed,mappings,scope}){
  const scoped=mappings.filter(row=>row.companyId===scope.companyId&&row.storeId===scope.storeId&&row.integrationId===scope.integrationId);
  const items=parsed.productRefs.map((ref,index)=>{
    const candidates=scoped.filter(row=>(ref.externalProductId&&row.externalProductId===ref.externalProductId)||(ref.externalSku&&row.externalSku===ref.externalSku));
    const selected=candidates.length===1?candidates[0]:null;
    const matched=Boolean(selected?.status==="MATCHED"&&safeText(selected.productId)&&selected.inSelectedStore===true);
    const reason=candidates.length>1?"AMBIGUOUS_MAPPING":!selected?"MAPPING_MISSING":selected.status!=="MATCHED"||!safeText(selected.productId)?"MAPPING_UNCONFIRMED":!matched?"PRODUCT_NOT_IN_SELECTED_STORE":null;
    return {line:index+1,externalProductId:safeText(ref.externalProductId),externalSku:safeText(ref.externalSku),name:safeText(ref.name,500),barcodes:(ref.barcodes||[]).map(value=>safeText(value)).filter(Boolean),quantity:ref.quantity,mappingStatus:matched?"MATCHED":reason==="MAPPING_MISSING"||reason==="MAPPING_UNCONFIRMED"?"UNMATCHED":"BLOCKED",reason,product:matched?{id:safeText(selected.productId),name:safeText(selected.productName,500),sku:safeText(selected.productSku)}:null};
  });
  return {ok:true,preparationOnly:true,commercialExecutionReady:false,companyId:scope.companyId,storeId:scope.storeId,eventId:event.id,mode:["LAB_WEBHOOK_TEST","LOCAL_MOCK"].includes(event.mode)?event.mode:"UNKNOWN",externalOrderId:safeText(parsed.externalOrderId),status:parsed.supported?parsed.status:"UNSUPPORTED",providerStoreId:safeText(parsed.providerStoreId),externalPartnerConfigId:safeText(parsed.externalPartnerConfigId),items,mappingComplete:items.length>0&&items.every(item=>item.mappingStatus==="MATCHED"),providerContractPending:true,availabilityValidated:false,externalCall:false,orderCreated:false,saleCreated:false,stockChanged:false,paymentPosted:false,fiscalExecution:false};
}
