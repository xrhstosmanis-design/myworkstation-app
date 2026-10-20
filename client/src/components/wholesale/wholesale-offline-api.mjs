// Online verification only. Nothing here caches responses or manufactures prices.
import {capturedLifecycleGeneration,originalLifecycleHeaders} from '../../utils/store-lifecycle-origin.js';
const managers=new Set(['SUPER_ADMIN','OWNER','ADMIN','MANAGER']);
const validId=value=>typeof value==='string'&&/^[A-Za-z0-9_-]{1,200}$/.test(value);
export const offlineScopeKey=scope=>JSON.stringify([scope?.userId,scope?.companyId,scope?.role,scope?.storeId]);
export const offlineIdentityKey=identity=>JSON.stringify([identity?.userId,identity?.companyId,identity?.role]);
const fail=message=>{throw Error(message)};
function originalHeaders(storeId,metadata){
 const generation=metadata?.originGeneration ?? '0';
 if(typeof generation!=='string'||!/^(0|[1-9][0-9]{0,18})$/.test(generation))fail('Δεν επιβεβαιώθηκε η αρχική έκδοση του καταστήματος. Διατήρησε το αίτημα για έλεγχο.');
 return originalLifecycleHeaders(storeId,generation);
}
export async function verifyOfflineScope(api,session,storeId,{now=Date.now}={}){
 const identity=session?.identity;
 if(!identity||![identity.userId,identity.companyId,storeId].every(validId)||!['SUPER_ADMIN','OWNER','ADMIN','MANAGER','EMPLOYEE'].includes(identity.role)||!Number.isFinite(session.expiresAt)||session.expiresAt<=now())fail('Απαιτείται η τρέχουσα προσωπική σύνδεση και συγκεκριμένο κατάστημα.');
 const paid=await api('/api/wholesale/capabilities');
 const paidEnd=paid?.expiresAt==null?now()+86400000:Date.parse(paid.expiresAt);
 if(paid?.companyId!==identity.companyId||paid.moduleKey!=='WHOLESALE_B2B'||paid.enabled!==true||!Number.isFinite(paidEnd)||paidEnd<=now())throw Object.assign(Error('Το πληρωμένο module χονδρικής δεν είναι ενεργό.'),{status:403});
 const seller=!managers.has(identity.role),headers=seller?{'X-Wholesale-Seller':identity.userId,'X-Wholesale-Company':identity.companyId}:{};
 const context=await api(seller?'/api/wholesale/sellers/context':'/api/wholesale/workspace?'+new URLSearchParams({storeId}));
 if(context?.user?.id!==identity.userId||(seller?context.companyId!==identity.companyId:context.company?.id!==identity.companyId||context.user.role!==identity.role||context.storeId!==storeId)||!Array.isArray(context.stores))fail('Δεν επιβεβαιώθηκε η ίδια σύνδεση και εταιρεία.');
 const store=context.stores.find(row=>row.id===storeId&&row.active!==false);
 if(!store)throw Object.assign(Error('Το επιλεγμένο κατάστημα δεν είναι διαθέσιμο στον λογαριασμό.'),{status:403});
 if(!seller&&(context.access?.enabled!==true||context.access.companyId!==identity.companyId||context.access.moduleKey!=='WHOLESALE_B2B'||context.access.expiresAt!=null&&(!Number.isFinite(Date.parse(context.access.expiresAt))||Date.parse(context.access.expiresAt)<=now())))throw Object.assign(Error('Απαιτείται επανέλεγχος της άδειας χονδρικής.'),{status:403});
 return {identity:{...identity},scope:{...identity,storeId},store:{id:store.id,name:String(store.name||store.id)},seller,headers,paidExpiresAt:Math.min(now()+86400000,paidEnd,session.expiresAt,...(!seller&&context.access.expiresAt!=null?[Date.parse(context.access.expiresAt)]:[]))};
}
async function paged(api,path,params,headers){
 const items=[],seen=new Set();let expected;
 for(let page=1;page<=50;page++){
  const data=await api(path+'?'+new URLSearchParams({...params,q:'',page:String(page),pageSize:'100'}),{headers});
  if(!Array.isArray(data?.items)||!Number.isSafeInteger(data.total)||data.total<0||data.total>5000||data.items.length>100||expected!==undefined&&data.total!==expected)fail('Ο κατάλογος άλλαξε ή είναι πολύ μεγάλος. Επανέλαβε την προετοιμασία online.');
  expected=data.total;
  for(const row of data.items){if(!validId(row.id)||seen.has(row.id))fail('Ο κατάλογος δεν επιβεβαιώθηκε ολόκληρος.');seen.add(row.id);items.push(row)}
  if(items.length===expected)return items;
  if(items.length>expected||!data.items.length)fail('Ο κατάλογος δεν επιβεβαιώθηκε ολόκληρος.');
 }
 fail('Υπέρβαση ασφαλούς ορίου προετοιμασίας.');
}
export async function fetchOfflineSnapshot(api,session,storeId,options){
 const verified=await verifyOfflineScope(api,session,storeId,options);
 // Management customers form a shared company directory. The explicit store
 // query pins request lifecycle context; it does not invent customer assignments.
 const rows=verified.seller?await paged(api,'/api/wholesale/sellers/customers',{storeId},verified.headers):(await api('/api/wholesale/customers?'+new URLSearchParams({storeId}))).items;
 if(!Array.isArray(rows)||rows.length>5000)fail('Δεν επιβεβαιώθηκε ο κατάλογος πελατών.');
 const customers=rows.filter(row=>row.active!==false).map(row=>{if(!validId(row.id)||typeof row.name!=='string')fail('Μη έγκυρος πελάτης.');return {id:row.id,name:row.name,code:typeof row.code==='string'?row.code:''}});
 if(!customers.length)fail('Δεν υπάρχουν διαθέσιμοι πελάτες για προετοιμασία.');
 const products=(await paged(api,verified.seller?'/api/wholesale/sellers/catalog':'/api/wholesale/products',{storeId,...(verified.seller?{customerId:customers[0].id}:{})},verified.headers)).map(row=>{if(typeof row.name!=='string'||typeof row.unit!=='string')fail('Μη έγκυρο προϊόν.');return {id:row.id,name:row.name,sku:typeof row.sku==='string'?row.sku:'',unit:row.unit}});
 if(!products.length)fail('Δεν υπάρχουν διαθέσιμα είδη για προετοιμασία.');
 // Recheck after a multi-page download; a revoked grant must not create a lease.
 const final=await verifyOfflineScope(api,session,storeId,options);
 if(offlineScopeKey(verified.scope)!==offlineScopeKey(final.scope)||verified.seller!==final.seller)fail('Η σύνδεση, ο ρόλος ή το κατάστημα άλλαξε κατά την προετοιμασία.');
 return {identity:final.identity,store:final.store,customers,products,paidExpiresAt:Math.min(verified.paidExpiresAt,final.paidExpiresAt),originGeneration:capturedLifecycleGeneration(storeId)};
}
export async function reviewOfflineDraft(api,session,scope,draft,options){
 if(offlineIdentityKey(session?.identity)!==offlineIdentityKey(scope))fail('Συνδέσου με τον αρχικό προσωπικό λογαριασμό και εταιρεία.');
 const verified=await verifyOfflineScope(api,session,scope.storeId,options);
 const headers={...verified.headers,...originalHeaders(scope.storeId,draft)};
 const body={customerId:draft.customerId,storeId:scope.storeId,items:draft.items.map(({productId,quantity})=>({productId,quantity}))};
 const quote=await api(verified.seller?'/api/wholesale/sellers/quotes':'/api/wholesale/quotes',{method:'POST',headers,body:JSON.stringify(body)});
 if(quote?.storeId!==scope.storeId||quote.customerId!==draft.customerId||!/^[a-f0-9]{64}$/.test(quote.quoteId)||quote.currency!=='EUR'||!Array.isArray(quote.items)||quote.items.length!==draft.items.length||!quote.totals||!['net','vat','gross'].every(key=>/^\d+\.\d{2}$/.test(String(quote.totals[key]))))fail('Οι τρέχουσες τιμές δεν επιβεβαιώθηκαν.');
 const expected=new Map(draft.items.map(row=>[row.productId,Number(row.quantity)]));
 if(quote.items.some(row=>!expected.has(row.productId)||Number(row.quantity)!==expected.get(row.productId))||new Set(quote.items.map(row=>row.productId)).size!==expected.size)fail('Τα είδη της προσφοράς δεν συμφωνούν με το τοπικό πρόχειρο.');
 return {quote,headers,endpoint:verified.seller?'/api/wholesale/sellers/orders':'/api/wholesale/orders'};
}
export async function sendOfflineFrozen(api,session,scope,bodyString,metadata){
 if(offlineIdentityKey(session?.identity)!==offlineIdentityKey(scope))fail('Απαιτείται ο αρχικός λογαριασμός.');
 const verified=await verifyOfflineScope(api,session,scope.storeId),expected=JSON.parse(bodyString);
 if(expected.storeId!==scope.storeId)fail('Το αρχικό κατάστημα δεν συμφωνεί.');
 const response=await api(verified.seller?'/api/wholesale/sellers/orders':'/api/wholesale/orders',{method:'POST',headers:{...verified.headers,...originalHeaders(scope.storeId,metadata)},body:bodyString});
 // The seller router deliberately projects scope inside sellerQuoteView(snapshot).
 // Manager orders use the direct persisted order scope instead.
 const acceptedScope=verified.seller?response?.order?.snapshot:response?.order;
 if(!response?.orderId||response.status!=='SUBMITTED'||response.order?.id!==response.orderId||response.order.clientOrderId!==expected.clientOrderId||acceptedScope?.storeId!==scope.storeId||acceptedScope?.customerId!==expected.customerId||verified.seller&&(response.order.status!=='SUBMITTED'||acceptedScope.quoteId!==expected.quoteId))fail('Η υποβολή δεν επιβεβαιώθηκε. Το αρχικό αίτημα παραμένει κλειδωμένο.');
 return {status:'CONFIRMED',serverOrderId:response.orderId,message:'Επιβεβαιώθηκε από τον server — SUBMITTED.'};
}
