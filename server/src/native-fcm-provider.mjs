import {readFile} from 'node:fs/promises';
import {createSign} from 'node:crypto';
const PROJECT='myworkstation-chat', TOKEN_URL='https://oauth2.googleapis.com/token';
export const nativeFcmConfigured=(env=process.env)=>env.NATIVE_CHAT_FCM_ENABLED==='true'&&Boolean(env.NATIVE_CHAT_FCM_SERVICE_ACCOUNT_JSON||env.NATIVE_CHAT_FCM_CREDENTIALS_FILE);
export function nativeToken(value){
 if(typeof value!=='string'||!/^[A-Za-z0-9_:\-]{20,4096}$/.test(value))throw Object.assign(new Error('Μη έγκυρη εγγραφή ειδοποιήσεων.'),{status:400});
 return value;
}
export function nativeStoreLabel(value){
 if(typeof value!=='string')return '';
 return Array.from(value.replace(/[\p{Cc}\p{Cf}]/gu,' ').replace(/\s+/gu,' ').trim()).slice(0,80).join('');
}
export function nativePayload({token,binding,storeId,companyId,storeName}){
 nativeToken(token);
 if(!/^[a-f0-9]{64}$/.test(binding)||![storeId,companyId].every(v=>typeof v==='string'&&v.length>0&&v.length<=200))throw new Error('Invalid native scope');
 const label=nativeStoreLabel(storeName);
 return {message:{token,data:{kind:'MWS_CHAT',binding,storeId,companyId,...(label?{storeName:label}:{})},android:{priority:'high',ttl:'300s',collapse_key:'mws-chat'}}};
}
export function createNativeFcmProvider({env=process.env,fetchImpl=globalThis.fetch,read=readFile,now=Date.now}={}){
 let cached;
 async function request(url,options){
  const res=await fetchImpl(url,{...options,redirect:'error',signal:AbortSignal.timeout(10000)});
  // Fixed Google endpoints only; do not log response payloads, tokens or key material.
  const raw=await res.text();if(raw.length>65536)throw new Error('FCM response too large');
  let data;try{data=JSON.parse(raw)}catch{throw new Error('Invalid FCM response')}
  return {ok:res.ok,status:res.status,data};
 }
 async function access(){
  if(cached&&cached.until>now())return cached.token;
  const bytes=env.NATIVE_CHAT_FCM_SERVICE_ACCOUNT_JSON?Buffer.from(env.NATIVE_CHAT_FCM_SERVICE_ACCOUNT_JSON,'utf8'):await read(env.NATIVE_CHAT_FCM_CREDENTIALS_FILE);if(bytes.length>32768)throw new Error('Invalid FCM credential');
  const key=JSON.parse(bytes.toString());
  if(key.type!=='service_account'||key.project_id!==PROJECT||!String(key.client_email||'').endsWith('@myworkstation-chat.iam.gserviceaccount.com')||!String(key.private_key||'').startsWith('-----BEGIN PRIVATE KEY-----'))throw new Error('Invalid FCM credential');
  const seconds=Math.floor(now()/1000),encode=v=>Buffer.from(JSON.stringify(v)).toString('base64url');
  const head=encode({alg:'RS256',typ:'JWT'}),body=encode({iss:key.client_email,scope:'https://www.googleapis.com/auth/firebase.messaging',aud:TOKEN_URL,iat:seconds,exp:seconds+3600});
  const unsigned=head+'.'+body,signer=createSign('RSA-SHA256');signer.update(unsigned);
  const assertion=unsigned+'.'+signer.sign(key.private_key,'base64url');
  const r=await request(TOKEN_URL,{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({grant_type:'urn:ietf:params:oauth:grant-type:jwt-bearer',assertion})});
  if(!r.ok||typeof r.data.access_token!=='string'||!Number.isFinite(r.data.expires_in)||r.data.expires_in<=0)throw new Error('FCM authentication unavailable');
  cached={token:r.data.access_token,until:now()+Math.max(0,Math.min(3600,r.data.expires_in)-60)*1000};return cached.token;
 }
 return {configured:()=>nativeFcmConfigured(env),async send(input){
  if(!nativeFcmConfigured(env))return {delivered:false,disabled:true};
  const payload=nativePayload(input),bearer=await access();
  const r=await request(`https://fcm.googleapis.com/v1/projects/${PROJECT}/messages:send`,{method:'POST',headers:{Authorization:`Bearer ${bearer}`,'Content-Type':'application/json'},body:JSON.stringify(payload)});
  if(r.status===401)cached=undefined;
  const unregistered=Array.isArray(r.data.error?.details)&&r.data.error.details.some(d=>d['@type']==='type.googleapis.com/google.firebase.fcm.v1.FcmError'&&d.errorCode==='UNREGISTERED');
  return {delivered:r.ok,unregistered};
 }};
}
