import {createLifecycleFetch} from '../../utils/store-lifecycle-fetch.js';
import {rememberLifecycleOrigin} from '../../utils/store-lifecycle-origin.js';
export function decodeWholesaleToken(token){try{const part=token.split('.')[1].replace(/-/g,'+').replace(/_/g,'/'),bytes=Uint8Array.from(atob(part.padEnd(Math.ceil(part.length/4)*4,'=')),c=>c.charCodeAt(0));return JSON.parse(new TextDecoder().decode(bytes))}catch{return null}}
export function personalWholesaleSession(token,user){
 const claims=decodeWholesaleToken(token),valid=value=>typeof value==='string'&&value.trim()===value&&value.length>0&&value.length<=200;
 if(!claims||claims.tokenType!=='BACKOFFICE_USER'||!valid(claims.id)||!valid(claims.sessionId)||!valid(claims.companyId)||!Number.isFinite(claims.exp)||claims.exp*1000<=Date.now()||claims.supportContext||claims.mustChangePassword||user?.mustChangePassword||user?.id!==claims.id||!['SUPER_ADMIN','OWNER','ADMIN','MANAGER','EMPLOYEE'].includes(claims.role))return null;
 if(user.company?.id&&user.company.id!==claims.companyId)return null;
 return {token,user,claims,identity:{userId:claims.id,companyId:claims.companyId,role:claims.role},expiresAt:claims.exp*1000};
}
export function readPersonalWholesaleSession(storage=localStorage,temporary=sessionStorage){try{if(JSON.parse(storage.getItem('supportContext')||'null')||temporary.getItem('platformToken'))return null;return personalWholesaleSession(storage.getItem('token')||'',JSON.parse(storage.getItem('user')||'null'))}catch{return null}}
export function parseWholesaleStore(search){const params=new URLSearchParams(search),values=params.getAll('storeId');if(!values.length)return {storeId:'',central:true};if(values.length!==1||!/^[A-Za-z0-9_-]{1,200}$/.test(values[0]))return {error:'Ο σύνδεσμος δεν περιέχει έγκυρο μοναδικό κατάστημα.'};return {storeId:values[0],central:false}}
export function createWholesaleApi({fetchImpl=window.fetch.bind(window),origin=window.location.origin,onStale=()=>{}}={}){
 const transport=createLifecycleFetch({fetch:fetchImpl,origin,onPinned:rememberLifecycleOrigin,onStale});
 return async(path,options={})=>{
  if(typeof path!=='string'||!path.startsWith('/api/')||path.startsWith('//'))throw Error('Μη έγκυρη διαδρομή εφαρμογής.');
  const token=localStorage.getItem('token'),headers={'Content-Type':'application/json',...(path!=='/api/auth/login'&&token?{Authorization:`Bearer ${token}`}:{}) ,...(options.headers||{})};
  const response=await transport.request(path,{...options,headers,cache:'no-store'});
  let data;try{data=await response.json()}catch{throw Object.assign(Error('Η απάντηση δεν επιβεβαιώθηκε.'),{status:response.ok?502:response.status})}
  if(!response.ok)throw Object.assign(Error(data.error||`Σφάλμα ${response.status}`),{status:response.status,code:data.code,details:data.details});return data;
 };
}
