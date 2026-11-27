export const operationalFinancialReports=Object.freeze({
  destructions:{label:'Καταστροφές',source:'PRODUCT_DESTRUCTION',capability:'financial-destructions.read'},
  'self-consumption':{label:'Ιδιοκατανάλωση',source:'SELF_CONSUMPTION',capability:'financial-self-consumption.read'}
});
export const operationalFinancialCapabilities=Object.freeze(Object.values(operationalFinancialReports).map(r=>r.capability));
export const salesFinancialModes=Object.freeze(['monthly','categories','suppliers','products']);
export function allowedFinancialModes(capabilities){
  return [...(capabilities.includes('store-reports-sales-analysis.read')?salesFinancialModes:[]),
    ...Object.entries(operationalFinancialReports).filter(([,r])=>capabilities.includes(r.capability)).map(([key])=>key)];
}
export function operationalFinancialRequestCapability(method,path){
  if(method!=='GET')return null;
  return Object.entries(operationalFinancialReports).find(([key])=>path===`/api/commerce/sales/financial-reports/${key}`)?.[1].capability??null;
}
