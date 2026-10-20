import crypto from 'node:crypto';
export const VOICE_MAX_BYTES=1920044;
const invalid=()=>Object.assign(new Error('Μη έγκυρο φωνητικό. Επιτρέπεται WAV mono 16kHz έως 60 δευτερόλεπτα.'),{status:400});
export function validateVoiceWave(bytes){
  if(!Buffer.isBuffer(bytes)||bytes.length<46||bytes.length>VOICE_MAX_BYTES||bytes.length%2)throw invalid();
  if(bytes.toString('ascii',0,4)!=='RIFF'||bytes.toString('ascii',8,12)!=='WAVE'||bytes.toString('ascii',12,16)!=='fmt '||bytes.toString('ascii',36,40)!=='data')throw invalid();
  if(bytes.readUInt32LE(4)!==bytes.length-8||bytes.readUInt32LE(16)!==16||bytes.readUInt16LE(20)!==1||bytes.readUInt16LE(22)!==1||bytes.readUInt32LE(24)!==16000||bytes.readUInt32LE(28)!==32000||bytes.readUInt16LE(32)!==2||bytes.readUInt16LE(34)!==16||bytes.readUInt32LE(40)!==bytes.length-44)throw invalid();
  return {durationMs:(bytes.length-44)/32};
}
export function parseVoiceAttachment(value){
  if(!value||typeof value!=='object'||Array.isArray(value)||value.mimeType!=='audio/wav'||typeof value.dataUrl!=='string'||value.dataUrl.length>Math.ceil(VOICE_MAX_BYTES/3)*4+22)throw invalid();
  const match=value.dataUrl.match(/^data:audio\/wav;base64,((?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?)$/);
  if(!match)throw invalid();
  const bytes=Buffer.from(match[1],'base64');
  if(bytes.toString('base64')!==match[1])throw invalid();
  const {durationMs}=validateVoiceWave(bytes);
  return {name:'voice.wav',mimeType:'audio/wav',size:bytes.length,checksum:crypto.createHash('sha256').update(bytes).digest('hex'),data:match[1],durationMs};
}
