// Dedicated process control only. Actual DB time, grant and lease authority
// are independently checked by the capture authorizer in each transaction.
import {createHash} from 'node:crypto';

export const MONTHLY_CAPTURE_SERVICE_ID='srv-d9isenfavr4c73bdh52g';
export const MONTHLY_CAPTURE_CONTROL_ENV='MWS_MONTHLY_INVENTORY_CAPTURE_CONTROL';
const purpose='MONTHLY_INVENTORY_CAPTURE';
const keys=['v','purpose','serviceId','epoch','issuedAt','notBefore','enabled'];
const off=Object.freeze({valid:false,enabled:false,v:null,purpose:null,serviceId:null,epoch:null,issuedAt:null,notBefore:null,fingerprint:null,activationFingerprint:null});
const hash=value=>createHash('sha256').update(JSON.stringify(value),'utf8').digest('hex');

export function monthlyCaptureActivationInstant(value){
 return typeof value==='string'&&/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value)&&Number.isFinite(Date.parse(value))&&new Date(value).toISOString()===value;
}

export function readMonthlyCaptureActivation(env=process.env){
 try{
  if(!env||env.RENDER_SERVICE_ID!==MONTHLY_CAPTURE_SERVICE_ID)return off;
  const value=env[MONTHLY_CAPTURE_CONTROL_ENV];
  if(typeof value!=='string'||Buffer.byteLength(value,'utf8')>2048)return off;
  const raw=JSON.parse(value);
  if(!raw||Array.isArray(raw)||Object.keys(raw).length!==keys.length||keys.some(key=>!Object.hasOwn(raw,key)))return off;
  const canonical=Object.fromEntries(keys.map(key=>[key,raw[key]]));
  // Exact serialization also refuses duplicate keys, alternate escapes, key
  // order and whitespace. A caller object is not activation authority.
  if(JSON.stringify(canonical)!==value||raw.v!==1||raw.purpose!==purpose||raw.serviceId!==MONTHLY_CAPTURE_SERVICE_ID||typeof raw.enabled!=='boolean'||typeof raw.epoch!=='string'||!/^([0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})$/.test(raw.epoch)||!monthlyCaptureActivationInstant(raw.issuedAt)||!monthlyCaptureActivationInstant(raw.notBefore)||raw.notBefore<=raw.issuedAt)return off;
  const identity=[raw.v,raw.purpose,raw.serviceId,raw.epoch,raw.issuedAt,raw.notBefore];
  return Object.freeze({valid:true,...canonical,fingerprint:hash([...identity,raw.enabled]),activationFingerprint:hash(identity)});
 }catch{return off;}
}

// Runtime admission never accepts an injected environment/provider callback.
export function readCurrentMonthlyCaptureActivation(){return readMonthlyCaptureActivation(process.env);}
