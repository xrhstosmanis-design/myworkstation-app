export async function loadPayrollWorkspace(request,base,storeId){
  const rows=await request(`${base}/periods`);
  let overview=null,overviewError="";
  try{overview=await request(`/api/transactions/stores/${storeId}/overview`)}
  catch(error){overviewError=error.message||"Δεν φορτώθηκαν οι ενεργές βάρδιες ταμείου."}
  return {rows,overview,overviewError};
}
