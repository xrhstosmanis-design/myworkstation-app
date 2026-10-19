// The durable worker performs the expensive restore before execute starts.
// This adapter checks its signed receipt; it never manufactures a restore result.
import {createHmac,timingSafeEqual} from 'node:crypto';
const protocol='MWS_STORE_RECOVERY_PROOF_V1';
const q=x=>'"'+String(x).replaceAll('"','""')+'"';
const fail=()=>{throw Object.assign(new Error('Το νέο αντίγραφο δεν έχει επαληθευμένη ανάκτηση.'),{status:409})};
export function recoveryProofMac(secret,json){if(typeof secret!=='string'||secret.length<24||typeof json!=='string'||Buffer.byteLength(json)>32768)fail();return createHmac('sha256',secret).update(protocol+'\n'+json).digest('hex')}
export function validateRecoveryProof(envelope,{secret,operationId,snapshot,now=Date.now()}){
 if(typeof envelope?.proofJson!=='string'||!/^[a-f0-9]{64}$/.test(envelope?.mac||''))fail();
 const expected=recoveryProofMac(secret,envelope.proofJson);if(!timingSafeEqual(Buffer.from(expected,'hex'),Buffer.from(envelope.mac,'hex')))fail();
 let proof;try{proof=JSON.parse(envelope.proofJson)}catch{fail()}
 if(proof.protocol!==protocol||proof.operationId!==operationId||proof.sourceRevision!==snapshot.sourceRevision||proof.manifestHash!==snapshot.planHash||proof.companyId!==snapshot.scope.companyId||proof.storeId!==snapshot.scope.storeId||proof.mode!=='RESET'||snapshot.scope.mode!=='RESET'||proof.snapshotHash!==snapshot.snapshotHash||proof.restoredSnapshotHash!==snapshot.snapshotHash||proof.storageReadbackVerified!==true||proof.selectiveRestoreVerified!==true||proof.controlsUnchanged!==true||proof.fullRestoreAudit?.dataMatches!==true||proof.selectiveRestoreAudit?.dataMatches!==true||!/^[a-f0-9]{64}$/.test(proof.artifactSha256||'')||typeof proof.objectKey!=='string'||!/^myworkstation\/lifecycle\/[a-f0-9-]{36}\/[^\s]+\.dump$/.test(proof.objectKey)||!proof.objectKey.startsWith('myworkstation/lifecycle/'+operationId+'/')||typeof proof.objectVersion!=='string'||!proof.objectVersion||proof.objectVersion==='null'||proof.objectVersion.length>512)fail();
 const completed=Date.parse(proof.verifiedAt);if(!Number.isFinite(completed)||completed>now+30000||now-completed>30*60*1000)fail();
 return Object.freeze(proof);
}
export function createVerifiedRecoveryAdapter(db,{secret=()=>process.env.BACKUP_MONITOR_SECRET}={}){
 return async(snapshot,{operationId}={})=>{
  const schema=(await db.$queryRawUnsafe('SELECT current_schema() AS name'))[0]?.name;if(!schema)fail();
  const rows=await db.$queryRawUnsafe(`SELECT "result"->'recoveryProof' AS envelope FROM ${q(schema)}."StoreLifecycleExecution" WHERE "id"=$1 AND "companyId"=$2 AND "storeId"=$3 AND "state"='PREPARED' AND "expiresAt">NOW() AND "snapshotHash"=$4`,operationId,snapshot.scope.companyId,snapshot.scope.storeId,snapshot.snapshotHash);
  if(rows.length!==1)fail();return validateRecoveryProof(rows[0].envelope,{secret:secret(),operationId,snapshot});
 };
}
