import {randomUUID} from 'node:crypto';

// Upstream responses can contain credentials, tax identifiers, proxy HTML or
// arbitrary text. Only classify a bounded message; never retain or echo it.
function upstreamMessage(body){
  if(typeof body!=='string'||body.length>8192)return '';
  const text=body.trim();
  if(text.startsWith('{')){
    try{
      const data=JSON.parse(text);
      const message=data?.message??data?.error?.message;
      return typeof message==='string'?message:'';
    }catch{return ''}
  }
  if(text.startsWith('<')){
    if(/<(?:html|!doctype)\b/i.test(text))return '';
    return /<(?:[\w-]+:)?message(?:\s[^>]*)?>([^<]*)<\/(?:[\w-]+:)?message>/i.exec(text)?.[1]||'';
  }
  return text;
}

export function myDataHttpError({status,body,environment}){
  const message=upstreamMessage(body);
  let reason='HTTP_ERROR',guidance='Η υπηρεσία myDATA δεν ολοκλήρωσε τη λήψη.';
  if(status===401||status===403){
    if(/^Access denied due to invalid subscription key\b/i.test(message)){
      reason='INVALID_SUBSCRIPTION_KEY';
      guidance='Η ΑΑΔΕ αναφέρει μη έγκυρο subscription key. Ελέγξτε το κλειδί της ενεργής εγγραφής myDATA για το επιλεγμένο περιβάλλον.';
    }else if(/^Access denied due to missing subscription key\b/i.test(message)){
      reason='MISSING_SUBSCRIPTION_KEY';
      guidance='Η ΑΑΔΕ αναφέρει ότι λείπει το subscription key. Χρειάζεται έλεγχος της διασύνδεσης.';
    }else{
      reason=status===401?'AUTHENTICATION_REJECTED':'ACCESS_DENIED';
      guidance=status===401
        ?'Η ΑΑΔΕ απέρριψε την ταυτοποίηση. Ελέγξτε το όνομα χρήστη API, το subscription key και το επιλεγμένο περιβάλλον.'
        :'Η ΑΑΔΕ αρνήθηκε την πρόσβαση. Η συγκεκριμένη αιτία δεν αναγνωρίστηκε· το 403 μόνο του δεν επιβεβαιώνει λανθασμένους κωδικούς. Χρειάζεται τεχνικός έλεγχος της σύνδεσης.';
    }
  }else if(status===429){
    reason='RATE_LIMITED';guidance='Η υπηρεσία myDATA περιόρισε προσωρινά τις κλήσεις. Περιμένετε πριν από νέα προσπάθεια.';
  }else if(status>=500&&status<=599){
    reason='UPSTREAM_UNAVAILABLE';guidance='Η υπηρεσία myDATA επέστρεψε σφάλμα διακομιστή. Δοκιμάστε αργότερα.';
  }
  const diagnostic=Object.freeze({reference:randomUUID(),operation:'RequestDocs',upstreamStatus:status,environment:environment==='PRODUCTION'?'PRODUCTION':'SANDBOX',reason});
  const label=environment==='PRODUCTION'?'Παραγωγή':'Δοκιμές';
  const error=new Error(`myDATA ${status} (${label}): ${guidance} Η λήψη δεν ολοκληρώθηκε. Κωδικός ελέγχου: ${diagnostic.reference}.`);
  error.status=502; // Preserve the existing API contract: this is an upstream failure.
  error.code='MYDATA_HTTP_ERROR';error.diagnostic=diagnostic;
  return error;
}
