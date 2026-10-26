const BASE="http://127.0.0.1:17839";
const KEY="myworkstation:document-scanner:v1";
let inFlight=false;
export class ScannerPairingRequired extends Error{}
export function scannerToken(storage=globalThis.sessionStorage){try{return storage?.getItem(KEY)||""}catch{return ""}}
export function forgetScanner(storage=globalThis.sessionStorage){try{storage?.removeItem(KEY)}catch{}}
async function request(path,body,{signal,token="",fetcher=globalThis.fetch}={}){
  let response;
  try{response=await fetcher(`${BASE}${path}`,{method:"POST",credentials:"omit",redirect:"error",referrerPolicy:"no-referrer",cache:"no-store",signal,headers:{"Content-Type":"application/json",...(token?{Authorization:`Bearer ${token}`}:{})},body:JSON.stringify(body)})}
  catch(error){if(error?.name==="AbortError")throw error;throw new Error("Δεν συνδέθηκε ο σαρωτής. Άνοιξε τον τοπικό σύνδεσμο MyWorkStation και επίτρεψε την πρόσβαση στο τοπικό δίκτυο αν τη ζητήσει ο browser.")}
  const text=await response.text();if(text.length>21*1024*1024)throw new Error("Η απάντηση του σαρωτή είναι πολύ μεγάλη.");
  let data;try{data=JSON.parse(text)}catch{throw new Error("Ο σύνδεσμος σαρωτή δεν επέστρεψε έγκυρη απάντηση.")}
  if(response.status===401)throw new ScannerPairingRequired("Χρειάζεται σύνδεση με τον σαρωτή αυτού του υπολογιστή.");
  if(!response.ok)throw new Error(({BUSY:"Ο σαρωτής χρησιμοποιείται ήδη. Περίμενε να ολοκληρωθεί η προηγούμενη σάρωση.",NO_PAPER:"Δεν βρέθηκε χαρτί στον σαρωτή.",PAIR_REFUSED:"Ο κωδικός σύνδεσης είναι λανθασμένος ή έληξε.",SCAN_FAILED:"Η σάρωση απέτυχε. Έλεγξε χαρτί, σύνδεση και οδηγό WIA. Δεν έγινε αποστολή."})[data?.code]||"Ο σαρωτής δεν ολοκλήρωσε τη σάρωση.");
  return data;
}
export async function pairDocumentScanner(code,{storage=globalThis.sessionStorage,...options}={}){
  if(!/^\d{6}$/.test(code))throw new Error("Συμπλήρωσε τον εξαψήφιο κωδικό που εμφανίζει ο τοπικός σύνδεσμος.");
  const data=await request("/pair",{code},options);
  if(!/^[a-f0-9]{64}$/.test(data?.token||""))throw new Error("Δεν ολοκληρώθηκε η σύνδεση σαρωτή.");
  storage.setItem(KEY,data.token);
}
export function decodeScannedPages(data,maxPages=5){
  if(!data||!Array.isArray(data.pages)||!data.pages.length||data.pages.length>maxPages)throw new Error("Μη έγκυρο πλήθος σελίδων από τον σαρωτή.");
  let total=0;
  return data.pages.map((page,index)=>{
    if(typeof page?.jpeg!=="string"||page.jpeg.length>Math.ceil(7*1024*1024/3)*4||!/^\/9j\/[A-Za-z0-9+/]*={0,2}$/.test(page.jpeg)||page.jpeg.length%4)throw new Error("Ο σαρωτής επέστρεψε μη έγκυρη εικόνα.");
    const bytes=Uint8Array.from(atob(page.jpeg),c=>c.charCodeAt(0));total+=bytes.length;
    if(bytes.length<4||bytes.length>7*1024*1024||total>14*1024*1024||bytes[0]!==255||bytes[1]!==216||bytes.at(-2)!==255||bytes.at(-1)!==217)throw new Error("Η σαρωμένη εικόνα είναι ελλιπής ή πολύ μεγάλη.");
    return new File([bytes],`sarosi-selida-${index+1}.jpg`,{type:"image/jpeg"});
  });
}
export async function scanDocument({maxPages=5,signal,storage=globalThis.sessionStorage,...options}={}){
  if(inFlight)throw new Error("Υπάρχει ήδη σάρωση σε εξέλιξη.");
  const token=scannerToken(storage);if(!token)throw new ScannerPairingRequired("Χρειάζεται σύνδεση με τον σαρωτή αυτού του υπολογιστή.");
  if(!Number.isInteger(maxPages)||maxPages<1||maxPages>5)throw new Error("Επιτρέπονται έως 5 σελίδες ανά σάρωση.");
  inFlight=true;
  try{
    const requestId=crypto.randomUUID();
    const data=await request("/scan",{requestId,maxPages},{...options,signal,token});
    if(signal?.aborted)throw new DOMException("Η σάρωση ακυρώθηκε.","AbortError");
    return decodeScannedPages(data,maxPages);
  }finally{inFlight=false}
}
