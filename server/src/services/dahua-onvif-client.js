import crypto from "node:crypto";
import dgram from "node:dgram";

const escapeXml=value=>String(value??"").replace(/[<>&"']/g,char=>({"<":"&lt;",">":"&gt;","&":"&amp;",'"':"&quot;","'":"&apos;"}[char]));
const first=(xml,names)=>{for(const name of names){const match=String(xml||"").match(new RegExp(`<(?:\\w+:)?${name}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/(?:\\w+:)?${name}>`,"i"));if(match)return match[1].trim()}return null};
const isoDurationSeconds=value=>{const match=String(value||"").match(/^PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+(?:\.\d+)?)S)?$/i);return match?Number(match[1]||0)*3600+Number(match[2]||0)*60+Number(match[3]||0):null};

export function onvifUsernameToken(username,password,now=new Date(),nonce=crypto.randomBytes(20)){
  const created=now.toISOString(),digest=crypto.createHash("sha1").update(Buffer.concat([nonce,Buffer.from(created),Buffer.from(String(password||""))])).digest("base64");
  return `<wsse:Security s:mustUnderstand="1"><wsse:UsernameToken><wsse:Username>${escapeXml(username)}</wsse:Username><wsse:Password Type="http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-username-token-profile-1.0#PasswordDigest">${digest}</wsse:Password><wsse:Nonce EncodingType="http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-soap-message-security-1.0#Base64Binary">${nonce.toString("base64")}</wsse:Nonce><wsu:Created>${created}</wsu:Created></wsse:UsernameToken></wsse:Security>`;
}

export function onvifEnvelope(body,{username="",password="",now}={}){
  const security=username?onvifUsernameToken(username,password,now):"";
  return `<?xml version="1.0" encoding="UTF-8"?><s:Envelope xmlns:s="http://www.w3.org/2003/05/soap-envelope" xmlns:tds="http://www.onvif.org/ver10/device/wsdl" xmlns:trt="http://www.onvif.org/ver10/media/wsdl" xmlns:tt="http://www.onvif.org/ver10/schema" xmlns:wsse="http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-wssecurity-secext-1.0.xsd" xmlns:wsu="http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-wssecurity-utility-1.0.xsd"><s:Header>${security}</s:Header><s:Body>${body}</s:Body></s:Envelope>`;
}

export function parseOnvifDeviceInformation(xml){return {manufacturer:first(xml,["Manufacturer"]),model:first(xml,["Model"]),firmwareVersion:first(xml,["FirmwareVersion"]),serialNumber:first(xml,["SerialNumber"]),hardwareId:first(xml,["HardwareId"])}};
export function parseOnvifSystemDateAndTime(xml){
  const year=Number(first(xml,["Year"])),month=Number(first(xml,["Month"])),day=Number(first(xml,["Day"])),hour=Number(first(xml,["Hour"])),minute=Number(first(xml,["Minute"])),second=Number(first(xml,["Second"]));
  const date=new Date(Date.UTC(year,month-1,day,hour,minute,second));return Number.isNaN(date.getTime())?null:date;
}
export function parseOnvifCapabilities(xml){return {mediaXAddr:first(xml,["XAddr"]),ntpFromDhcp:/<\/?(?:\w+:)?NTPFromDHCP>/i.test(String(xml||"")),systemBackup:/SystemBackup/i.test(String(xml||""))}};
export function parseOnvifProfiles(xml){return [...String(xml||"").matchAll(/<(?:\w+:)?Profiles\b[^>]*token="([^"]+)"[^>]*>/gi)].map(match=>match[1])}
export function parseDahuaKeyValue(text){return Object.fromEntries(String(text||"").split(/\r?\n/).map(line=>line.split("=")).filter(parts=>parts.length>=2).map(([key,...rest])=>[key.trim(),rest.join("=").trim()]))}
export function parseDahuaTime(text){const values=parseDahuaKeyValue(text),raw=values.result||values.time||values.currentTime,match=String(raw||"").match(/(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2}):(\d{2})/);return match?new Date(Date.UTC(+match[1],+match[2]-1,+match[3],+match[4],+match[5],+match[6])):null}
export function parseDahuaDuration(text){return isoDurationSeconds(parseDahuaKeyValue(text).duration)}

export class DahuaOnvifClient{
  constructor({endpoint,username="",password="",fetchImpl=globalThis.fetch,timeoutMs=8000}){this.endpoint=new URL(endpoint);this.username=username;this.password=password;this.fetchImpl=fetchImpl;this.timeoutMs=timeoutMs}
  async soap(path,action,body){
    const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),this.timeoutMs);timer.unref?.();
    try{const response=await this.fetchImpl(new URL(path,this.endpoint),{method:"POST",headers:{"Content-Type":`application/soap+xml; charset=utf-8; action="${action}"`},body:onvifEnvelope(body,this),signal:controller.signal});const text=await response.text();if(!response.ok||/<(?:\w+:)?Fault\b/i.test(text))throw new Error(`ONVIF_${response.status||"FAULT"}`);return text}finally{clearTimeout(timer)}
  }
  async health(){const xml=await this.soap("/onvif/device_service","http://www.onvif.org/ver10/device/wsdl/GetDeviceInformation","<tds:GetDeviceInformation/>");return {online:true,protocol:"ONVIF",device:parseOnvifDeviceInformation(xml)}}
  async systemTime(){const xml=await this.soap("/onvif/device_service","http://www.onvif.org/ver10/device/wsdl/GetSystemDateAndTime","<tds:GetSystemDateAndTime/>");const time=parseOnvifSystemDateAndTime(xml);if(!time)throw new Error("ONVIF_TIME_MISSING");return time}
  async profiles(mediaPath="/onvif/media_service"){const xml=await this.soap(mediaPath,"http://www.onvif.org/ver10/media/wsdl/GetProfiles","<trt:GetProfiles/>");return parseOnvifProfiles(xml)}
  async snapshotUri(profileToken,mediaPath="/onvif/media_service"){const xml=await this.soap(mediaPath,"http://www.onvif.org/ver10/media/wsdl/GetSnapshotUri",`<trt:GetSnapshotUri><trt:ProfileToken>${escapeXml(profileToken)}</trt:ProfileToken></trt:GetSnapshotUri>`);const uri=first(xml,["Uri"]);if(!uri)throw new Error("ONVIF_SNAPSHOT_URI_MISSING");return uri}
  async connect(){const started=Date.now(),health=await this.health(),nvrTime=await this.systemTime();return {...health,nvrTime,latencyMs:Date.now()-started,realConnectionPerformed:true}}
}

export async function discoverOnvifDevices({timeoutMs=2500,address="239.255.255.250",port=3702,socketFactory=()=>dgram.createSocket("udp4")}={}){
  const id=crypto.randomUUID(),message=Buffer.from(`<?xml version="1.0" encoding="UTF-8"?><e:Envelope xmlns:e="http://www.w3.org/2003/05/soap-envelope" xmlns:w="http://schemas.xmlsoap.org/ws/2004/08/addressing" xmlns:d="http://schemas.xmlsoap.org/ws/2005/04/discovery" xmlns:dn="http://www.onvif.org/ver10/network/wsdl"><e:Header><w:MessageID>uuid:${id}</w:MessageID><w:To>urn:schemas-xmlsoap-org:ws:2005:04:discovery</w:To><w:Action>http://schemas.xmlsoap.org/ws/2005/04/discovery/Probe</w:Action></e:Header><e:Body><d:Probe><d:Types>dn:NetworkVideoTransmitter</d:Types></d:Probe></e:Body></e:Envelope>`),socket=socketFactory(),devices=new Map();
  return await new Promise((resolve,reject)=>{const finish=()=>{try{socket.close()}catch{}resolve([...devices.values()])},timer=setTimeout(finish,timeoutMs);socket.on("message",(data,remote)=>{const xml=data.toString("utf8"),xaddr=first(xml,["XAddrs"]),scopes=first(xml,["Scopes"]);devices.set(xaddr||remote.address,{address:remote.address,xaddr,scopes})});socket.on("error",error=>{clearTimeout(timer);try{socket.close()}catch{}reject(error)});socket.send(message,port,address,error=>{if(error){clearTimeout(timer);reject(error)}})})
}
