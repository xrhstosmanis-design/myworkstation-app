const messages={
 STORE_LIFECYCLE_MAINTENANCE:'Το κατάστημα βρίσκεται σε συντήρηση. Δεν καταχωρίστηκε κίνηση.',
 STORE_LIFECYCLE_STALE_GENERATION:'Η κίνηση ανήκει σε προηγούμενη κατάσταση του καταστήματος. Διατηρήθηκε για έλεγχο και δεν καταχωρίστηκε.',
 STORE_LIFECYCLE_RETIRED_REFERENCE:'Η κίνηση αναφέρεται σε δεδομένα πριν από την εκκαθάριση. Διατηρήθηκε για έλεγχο και δεν καταχωρίστηκε.'
};
export function storeLifecycleErrorResponse(error){
 let code=Object.hasOwn(messages,error?.code)?error.code:null;
 if(!code&&(error?.meta?.code==='55000'||error?.code==='55000')){
  const detail=String(error?.meta?.message??error?.meta?.database_error??error?.message??'');
  code=Object.keys(messages).find(value=>detail.includes(value));
 }
 return code?{error:messages[code],code}:null;
}
export function storeLifecycleErrors(error,req,res,next){const body=storeLifecycleErrorResponse(error);return body?res.status(409).json(body):next(error)}
