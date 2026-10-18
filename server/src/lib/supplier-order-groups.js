// Approved invoice document frequency is only a review proxy, never delivery
// frequency, a persisted primary supplier, or an instruction to transmit orders.
export const SUPPLIER_EVIDENCE_LIMIT=20000;
export function buildSupplierOrderGroups(rows,evidence,{complete=true}={}){
  complete=complete&&evidence.length<=SUPPLIER_EVIDENCE_LIMIT;
  const byProduct=new Map();
  if(complete)for(const row of evidence){
    if(!row.productId||!row.supplierId||!row.documentId)continue;
    if(!byProduct.has(row.productId))byProduct.set(row.productId,new Map());
    const suppliers=byProduct.get(row.productId);
    if(!suppliers.has(row.supplierId))suppliers.set(row.supplierId,{supplierId:row.supplierId,supplierName:row.supplierName,documents:new Set()});
    suppliers.get(row.supplierId).documents.add(row.documentId);
  }
  const groups=new Map(),unassigned=[];
  const projected=rows.map(row=>{
    const candidates=[...(byProduct.get(row.productId)?.values()||[])].map(s=>({supplierId:s.supplierId,supplierName:s.supplierName,documentCount:s.documents.size,documentIds:[...s.documents].sort()})).sort((a,b)=>b.documentCount-a.documentCount||String(a.supplierId).localeCompare(String(b.supplierId)));
    const winner=complete&&candidates.length&&(!candidates[1]||candidates[0].documentCount>candidates[1].documentCount)?candidates[0]:null;
    const result={...row,primarySupplierId:null,candidateSupplierId:winner?.supplierId||null,supplierBasis:"APPROVED_DOCUMENT_FREQUENCY_PROXY",reviewRequired:true,supplierCandidates:candidates,supplierReviewReason:!complete?"INCOMPLETE_EVIDENCE":!candidates.length?"NO_APPROVED_DOCUMENT_EVIDENCE":!winner?"DOCUMENT_FREQUENCY_TIE":"DOCUMENT_FREQUENCY_IS_NOT_DELIVERY_FREQUENCY"};
    if(winner){if(!groups.has(winner.supplierId))groups.set(winner.supplierId,{candidateSupplierId:winner.supplierId,supplierName:winner.supplierName,primarySupplierId:null,reviewRequired:true,rows:[]});groups.get(winner.supplierId).rows.push(result);}else unassigned.push(result);
    return result;
  });
  return {rows:projected,groups:[...groups.values()],unassigned,complete,supplierBasis:"APPROVED_DOCUMENT_FREQUENCY_PROXY",reviewRequired:true,automaticTransmission:false};
}
