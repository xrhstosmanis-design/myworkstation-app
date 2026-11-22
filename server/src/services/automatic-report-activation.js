import {createHash} from 'node:crypto';

export const ACTIVATION_SERVICE_ID='srv-d9isenfavr4c73bdh52g';
const keys=['v','serviceId','epoch','issuedAt','notBefore','enabled'];
const off=Object.freeze({valid:false,enabled:false,serviceId:null,epoch:null,issuedAt:null,notBefore:null,fingerprint:null,activationFingerprint:null});
export function activationInstant(value){
  return typeof value==='string'&&/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value)&&Number.isFinite(Date.parse(value))&&new Date(value).toISOString()===value;
}
const hash=value=>createHash('sha256').update(JSON.stringify(value),'utf8').digest('hex');
export function readActivation(env={}){
  try{
    if(env.RENDER_SERVICE_ID!==ACTIVATION_SERVICE_ID||typeof env.AUTOMATIC_REPORT_ACTIVATION_CONTROL!=='string'||env.AUTOMATIC_REPORT_ACTIVATION_CONTROL.length>2048)return off;
    const raw=JSON.parse(env.AUTOMATIC_REPORT_ACTIVATION_CONTROL);
    if(!raw||Array.isArray(raw)||Object.keys(raw).length!==keys.length||keys.some(key=>!Object.hasOwn(raw,key)))return off;
    // Require canonical serialization: duplicate keys, alternate encodings and
    // ambiguous control representations cannot become activation authority.
    const canonical=Object.fromEntries(keys.map(key=>[key,raw[key]]));
    if(JSON.stringify(canonical)!==env.AUTOMATIC_REPORT_ACTIVATION_CONTROL||raw.v!==1||raw.serviceId!==ACTIVATION_SERVICE_ID||typeof raw.enabled!=='boolean'||typeof raw.epoch!=='string'||!/^([0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})$/.test(raw.epoch)||!activationInstant(raw.issuedAt)||!activationInstant(raw.notBefore)||raw.notBefore<=raw.issuedAt)return off;
    const identity=[1,raw.serviceId,raw.epoch,raw.issuedAt,raw.notBefore];
    return Object.freeze({valid:true,...canonical,fingerprint:hash([...identity,raw.enabled]),activationFingerprint:hash(identity)});
  }catch{return off;}
}
export function activationAllows(control,{activationEpoch,activationFingerprint,createdAt,periodFrom,now}={}){
  try{return control?.valid===true&&control.enabled===true&&control.serviceId===ACTIVATION_SERVICE_ID&&activationEpoch===control.epoch&&activationFingerprint===control.activationFingerprint&&activationInstant(createdAt)&&activationInstant(periodFrom)&&activationInstant(now)&&createdAt>=control.issuedAt&&createdAt<=now&&now>=control.notBefore&&periodFrom>=control.notBefore;}catch{return false;}
}
