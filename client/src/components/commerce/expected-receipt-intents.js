import {originalLifecycleHeaders} from '../../utils/store-lifecycle-origin.js';
import {lifecycleHeader} from '../../utils/store-lifecycle-fetch.js';
import {expectedReceiptAction} from '../../../../shared/supplier-expected-receipts.mjs';

const identity=value=>typeof value==='string'&&value.length>0;
export function expectedReceiptIntentContext(data,storeId){
  if(data?.storeId!==storeId||!identity(data.actorId)||!identity(data.companyId)||typeof data.lifecycleGeneration!=='string'||!/^(0|[1-9][0-9]{0,18})$/.test(data.lifecycleGeneration)||BigInt(data.lifecycleGeneration)>9223372036854775807n)throw Error('Ανανέωσε τη σύνδεση πριν από νέα αναμενόμενη παραλαβή.');
  return {actorId:data.actorId,companyId:data.companyId,storeId,generation:data.lifecycleGeneration};
}
// The identity key excludes generation so a reset cannot hide or retag an old intent.
const storageKey=context=>'mws.expectedReceipt.pending.'+JSON.stringify([context.actorId,context.companyId,context.storeId]);
export function sameExpectedReceiptContext(a,b){return a.actorId===b.actorId&&a.companyId===b.companyId&&a.storeId===b.storeId;}
function validateIntent(intent,context){
  if(!intent||intent.version!==2||!sameExpectedReceiptContext(intent,context)||typeof intent.key!=='string'||!['confirm','link','cancel'].includes(expectedReceiptAction('POST',intent.path)))throw Error('Το εκκρεμές αίτημα χρειάζεται έλεγχο πριν από νέα ενέργεια.');
  const expectedHeaders=originalLifecycleHeaders(context.storeId,intent.generation);
  if(typeof intent.generation!=='string'||!/^(0|[1-9][0-9]{0,18})$/.test(intent.generation)||BigInt(intent.generation)>9223372036854775807n||!intent.headers||Object.keys(intent.headers).length!==1||intent.headers[lifecycleHeader]!==expectedHeaders[lifecycleHeader])throw Error('Η αρχική έκδοση του εκκρεμούς αιτήματος χρειάζεται έλεγχο.');
  const body=JSON.parse(intent.serializedBody);
  if(body?.idempotencyKey!==intent.key||body.storeId!==context.storeId||body.intentActorId!==context.actorId||body.intentCompanyId!==context.companyId||body.intentGeneration!==intent.generation)throw Error('Η ταυτότητα του εκκρεμούς αιτήματος χρειάζεται έλεγχο.');
  return intent;
}
export function readExpectedReceiptIntent(context,storage=window.sessionStorage){
  const saved=storage.getItem(storageKey(context));
  return saved===null?null:validateIntent(JSON.parse(saved),context);
}
export function createExpectedReceiptIntent(context,path,body){
  const key=crypto.randomUUID();
  const payload={...body,storeId:context.storeId,intentActorId:context.actorId,intentCompanyId:context.companyId,intentGeneration:context.generation,idempotencyKey:key};
  const serializedBody=JSON.stringify(Object.fromEntries(Object.keys(payload).sort().map(key=>[key,payload[key]])));
  return validateIntent({version:2,...context,headers:originalLifecycleHeaders(context.storeId,context.generation),path,key,serializedBody},context);
}
export function saveExpectedReceiptIntent(intent,storage=window.sessionStorage){
  const prior=readExpectedReceiptIntent(intent,storage);
  if(prior&&JSON.stringify(prior)!==JSON.stringify(intent))throw Error('Υπάρχει εκκρεμές αίτημα. Επανέλεγξέ το πριν από άλλη ενέργεια.');
  storage.setItem(storageKey(intent),JSON.stringify(intent));
}
export function clearExpectedReceiptIntent(intent,storage=window.sessionStorage){
  const saved=readExpectedReceiptIntent(intent,storage);
  if(!saved||saved.key!==intent.key||saved.serializedBody!==intent.serializedBody)throw Error('Το εκκρεμές αίτημα άλλαξε. Ανανέωσε πριν συνεχίσεις.');
  storage.removeItem(storageKey(intent));
}
