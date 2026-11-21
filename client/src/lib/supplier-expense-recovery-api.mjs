// Bind the existing owner endpoint to the selected store. This adapter never
// grants authority; the existing server owner/company checks remain mandatory.
export function supplierExpenseRecoveryApi({api,storeId,isCurrent=()=>true}){
  const reviews=new Map(),contexts=new Map();let listGeneration=0;
  const assertCurrent=()=>{if(!isCurrent())throw Error('Το κατάστημα ή η σύνδεση άλλαξε. Άνοιξε ξανά τη σύνδεση εξόδου.');};
  if(typeof storeId!=='string'||!storeId||typeof api!=='function')throw Error('Επίλεξε έγκυρο κατάστημα.');
  return async(path,options={})=>{
    assertCurrent();
    if(typeof path!=='string'||!path.startsWith('/api/transactions/'))throw Error('Μη επιτρεπτή ενέργεια ανάκτησης.');
    const url=new URL(path,'https://recovery.invalid'),method=String(options.method||'GET').toUpperCase();
    const reviewPath='/api/transactions/other-expenses/review';
    if(url.pathname===reviewPath&&method==='GET'){
      for(const [key,value] of url.searchParams)if(!['storeId','from','to'].includes(key)||(key==='storeId'&&value!==storeId))throw Error('Η ανάκτηση αφορά μόνο το επιλεγμένο κατάστημα.');
      const generation=++listGeneration;reviews.clear();contexts.clear();
      url.searchParams.set('storeId',storeId);
      const response=await api(url.pathname+'?'+url.searchParams.toString());assertCurrent();
      if(generation!==listGeneration)throw Error('Η λίστα ανανεώθηκε. Χρησιμοποίησε την τελευταία εμφάνιση.');
      if(!Array.isArray(response?.items))throw Error('Δεν επιβεβαιώθηκε η λίστα εξόδων.');
      const items=response.items.filter(item=>item.paymentMethod==='CASH_SHIFT'&&Number(item.amount)>0);
      if(items.some(item=>!item.id||!item.transactionId||(item.storeId&&item.storeId!==storeId)))throw Error('Η λίστα εξόδων χρειάζεται επανέλεγχο καταστήματος.');
      reviews.clear();contexts.clear();for(const item of items)reviews.set(String(item.id),item);
      return {items,companies:[],stores:[]};
    }
    const match=url.pathname.match(/^\/api\/transactions\/other-expenses\/([^/]+)\/supplier-advance$/);
    if(!match||url.search||url.hash||!['GET','POST'].includes(method))throw Error('Μη επιτρεπτή ενέργεια ανάκτησης.');
    const reviewId=decodeURIComponent(match[1]),review=reviews.get(reviewId);
    if(!review)throw Error('Επίλεξε έξοδο από την τρέχουσα λίστα του καταστήματος.');
    if(method==='GET'){
      const generation=listGeneration;
      const data=await api(path);assertCurrent();
      if(generation!==listGeneration||reviews.get(reviewId)!==review)throw Error('Η λίστα ανανεώθηκε. Επίλεξε ξανά το έξοδο.');
      if(data?.storeId!==storeId||data.transactionId!==review.transactionId||Number(data.amount)!==Number(review.amount)||!Array.isArray(data.suppliers)||!/^[a-f0-9]{64}$/.test(data.expectedVersion||''))throw Error('Το έξοδο δεν συμφωνεί με το επιλεγμένο κατάστημα.');
      contexts.set(reviewId,{...data,suppliers:data.suppliers.map(s=>({...s}))});return data;
    }
    const context=contexts.get(reviewId);let body;
    try{body=JSON.parse(options.body);}catch{throw Error('Μη έγκυρα στοιχεία σύνδεσης.');}
    if(!context||body?.expectedVersion!==context.expectedVersion||Number(body.expectedAmount)!==Number(context.amount)||!context.suppliers.some(s=>s.id===body.supplierId)||body.acknowledged!==true)throw Error('Ανανέωσε και επιβεβαίωσε το ίδιο έξοδο πριν τη σύνδεση.');
    // Keep context after an uncertain response so a retry uses the same original
    // form/version/idempotency key. The existing writer handles the once-only audit.
    const response=await api(path,options);assertCurrent();
    if(response?.ok!==true||response.transactionId!==context.transactionId||Number(response.amount)!==Number(context.amount))throw Error('Δεν επιβεβαιώθηκε η σύνδεση. Επανέλαβε με τα ίδια στοιχεία.');
    return response;
  };
}
