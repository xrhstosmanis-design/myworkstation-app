// Internal building block only: no production export, restore or deletion route.
import {createCipheriv,createDecipheriv,createHash,randomBytes,randomUUID} from 'node:crypto';
import {open,realpath,unlink} from 'node:fs/promises';
import path from 'node:path';
const FORMAT='MWS_STORE_RECOVERY_V1',MAX_BYTES=32*1024*1024;
const deny=()=>{throw new Error('Invalid or unverifiable store recovery artifact.')};
const digest=bytes=>createHash('sha256').update(bytes).digest('hex');
const id=value=>typeof value==='string'&&value.length>0&&value.length<=200;
function scope(value){if(!value||!id(value.companyId)||!id(value.storeId)||!['RESET','DELETE'].includes(value.mode))deny();return {companyId:value.companyId,storeId:value.storeId,mode:value.mode}}
function key(value){if(!Buffer.isBuffer(value)||value.length!==32)deny();return value}
function snapshot(value){
 if(!value||value.format!==FORMAT||!Array.isArray(value.tables)||value.tables.length>600||!/^[a-f0-9]{40}$/.test(value.sourceRevision||'')||typeof value.createdAt!=='string'||!Number.isFinite(Date.parse(value.createdAt))||!/^[a-f0-9]{64}$/.test(value.manifestHash||''))deny();
 scope(value.scope);const names=new Set();let rows=0;
 for(const table of value.tables){
  if(!id(table.name)||names.has(table.name)||!Array.isArray(table.rows))deny();names.add(table.name);
  rows+=table.rows.length;if(rows>500000)deny();
  // Keep SQL row_to_json text intact: parsing/re-serializing would round big integers/numerics.
  for(const row of table.rows){if(typeof row!=='string')deny();let parsed;try{parsed=JSON.parse(row)}catch{deny()}if(!parsed||typeof parsed!=='object'||Array.isArray(parsed))deny()}
 }
 return value;
}
function aad(envelope){return Buffer.from(JSON.stringify({format:FORMAT,keyId:envelope.keyId,scope:scope(envelope.scope)}))}
function decode(value,length){if(typeof value!=='string'||value.length>Math.ceil(MAX_BYTES*1.4))deny();const bytes=Buffer.from(value,'base64');if(bytes.toString('base64')!==value||(length!==undefined&&bytes.length!==length))deny();return bytes}
export function sealLifecycleRecovery(value,{encryptionKey,keyId}){
 key(encryptionKey);if(!id(keyId))deny();snapshot(value);
 const plaintext=Buffer.from(JSON.stringify(value));if(plaintext.length>MAX_BYTES)deny();
 const envelope={format:FORMAT,keyId,scope:scope(value.scope)},iv=randomBytes(12);
 try{const cipher=createCipheriv('aes-256-gcm',encryptionKey,iv);cipher.setAAD(aad(envelope));const encrypted=Buffer.concat([cipher.update(plaintext),cipher.final()]);return Buffer.from(JSON.stringify({...envelope,iv:iv.toString('base64'),tag:cipher.getAuthTag().toString('base64'),ciphertext:encrypted.toString('base64')}))}finally{plaintext.fill(0)}
}
export function openLifecycleRecovery(bytes,{encryptionKey,keyId,expectedScope,expectedManifestHash,expectedSourceRevision}){
 let plaintext;
 try{
  key(encryptionKey);if(!id(keyId)||!Buffer.isBuffer(bytes)||bytes.length>MAX_BYTES*1.4+4096)deny();
  const envelope=JSON.parse(bytes.toString('utf8'));
  if(envelope.format!==FORMAT||envelope.keyId!==keyId||JSON.stringify(scope(envelope.scope))!==JSON.stringify(scope(expectedScope)))deny();
  const decipher=createDecipheriv('aes-256-gcm',encryptionKey,decode(envelope.iv,12));decipher.setAAD(aad(envelope));decipher.setAuthTag(decode(envelope.tag,16));
  plaintext=Buffer.concat([decipher.update(decode(envelope.ciphertext)),decipher.final()]);if(plaintext.length>MAX_BYTES)deny();
  const value=snapshot(JSON.parse(plaintext.toString('utf8')));if(JSON.stringify(scope(value.scope))!==JSON.stringify(scope(expectedScope))||value.manifestHash!==expectedManifestHash||value.sourceRevision!==expectedSourceRevision)deny();return value;
 }catch{deny()}finally{plaintext?.fill(0)}
}
export async function persistLifecycleRecovery(value,{directory,encryptionKey,keyId}){
 // Caller must configure an existing durable private directory; never fall back to /tmp or cwd.
 if(typeof directory!=='string'||!path.isAbsolute(directory))deny();
 const root=await realpath(directory),bytes=sealLifecycleRecovery(value,{encryptionKey,keyId});
 const artifactPath=path.join(root,randomUUID()+'.mws-recovery');let created=false;
 try{
  const file=await open(artifactPath,'wx',0o600);created=true;
  try{await file.writeFile(bytes);await file.sync()}finally{await file.close()}
  const dir=await open(root,'r');try{await dir.sync()}finally{await dir.close()}
  const saved=await open(artifactPath,'r');let readback;try{readback=await saved.readFile()}finally{await saved.close()}
  if(digest(readback)!==digest(bytes))deny();
  openLifecycleRecovery(readback,{encryptionKey,keyId,expectedScope:value.scope,expectedManifestHash:value.manifestHash,expectedSourceRevision:value.sourceRevision});
  return {artifactPath,sha256:digest(bytes),sizeBytes:bytes.length,keyId,storageReadbackVerified:true,restoreVerified:false};
 }catch(error){if(created)await unlink(artifactPath).catch(()=>{});throw error}
}
export {FORMAT as STORE_RECOVERY_FORMAT};
