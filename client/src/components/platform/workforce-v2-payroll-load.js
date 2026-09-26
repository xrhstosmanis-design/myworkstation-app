export async function loadPayrollWorkspace(request,base){
  const rows=await request(`${base}/periods`);
  let overview=null,overviewError="";
  try{overview=await request(`${base}/open-cash-sessions`)}
  catch(error){overviewError=error.message||"Δεν φορτώθηκαν οι ενεργές βάρδιες ταμείου."}
  return {rows,overview,overviewError};
}
