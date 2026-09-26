export async function invoiceAssistantProviderError(response){
  const body=await response.json().catch(()=>({}));
  const code=String(body?.error?.code||body?.error?.type||"").toLowerCase();
  if(response.status===429){
    if(code==="insufficient_quota"||code==="billing_hard_limit_reached")return {status:503,message:"Ο βοηθός δεν είναι διαθέσιμος: εξαντλήθηκε το διαθέσιμο όριο του παρόχου AI. Το πρόχειρο διατηρήθηκε. Χρειάζεται έλεγχος της χρέωσης/του ορίου από τον διαχειριστή."};
    const retryAfter=Number(response.headers?.get?.("retry-after"));
    const wait=Number.isFinite(retryAfter)&&retryAfter>0&&retryAfter<=3600?` Δοκίμασε ξανά μετά από ${Math.ceil(retryAfter)} δευτερόλεπτα.`:" Δοκίμασε αργότερα, χωρίς νέα υποβολή POS.";
    return {status:429,message:`Ο πάροχος AI περιόρισε προσωρινά τα αιτήματα (429). Το πρόχειρο διατηρήθηκε.${wait}`};
  }
  return {status:502,message:`Ο βοηθός δεν απάντησε (${response.status}).`};
}
