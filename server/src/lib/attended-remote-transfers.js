import crypto from 'node:crypto';
const fail=(status,message)=>Object.assign(new Error(message),{status});
export const REMOTE_CHUNK_BYTES=256*1024;
export const REMOTE_FILE_BYTES=25*1024*1024;
export function remoteFileName(value){
 if(typeof value!=='string'||value.length<1||value.length>180||value.trim()!==value||/[\\/\x00-\x1f\x7f:<>"|?*]/.test(value)||/^[. ]|[. ]$/.test(value)||/^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(value))throw fail(400,'Μη έγκυρο όνομα αρχείου.');
 return value;
}
export function createRemoteTransfers({now=Date.now,maxBytes=64*1024*1024,ttl=10*60*1000}={}){
 const rows=new Map();let reserved=0;
 const remove=id=>{const r=rows.get(id);if(r){reserved-=r.size;rows.delete(id);}};
 const sweep=()=>{for(const[id,r]of rows)if(now()-r.createdAt>ttl)remove(id);};
 const get=(sessionId,id)=>{sweep();const r=rows.get(id);if(!r||r.sessionId!==sessionId)throw fail(404,'Το αρχείο δεν είναι διαθέσιμο σε αυτή τη συνεδρία.');return r;};
 const project=r=>({id:r.id,name:r.name,size:r.size,sha256:r.sha256,direction:r.direction,state:r.state});
 return {
  create(sessionId,direction,input){sweep();if(!['TO_DEVICE','TO_CONTROLLER'].includes(direction))throw fail(400,'Μη έγκυρη κατεύθυνση.');const name=remoteFileName(input.name);if(!Number.isSafeInteger(input.size)||input.size<1||input.size>REMOTE_FILE_BYTES||!/^[a-f0-9]{64}$/.test(input.sha256||''))throw fail(400,'Μη έγκυρο μέγεθος ή αποτύπωμα αρχείου.');if([...rows.values()].filter(r=>r.sessionId===sessionId).length>=2||reserved+input.size>maxBytes)throw fail(429,'Ολοκλήρωσε ή ακύρωσε την προηγούμενη μεταφορά.');const r={id:crypto.randomUUID(),sessionId,direction,name,size:input.size,sha256:input.sha256,chunks:[],received:0,state:'UPLOADING',hash:crypto.createHash('sha256'),createdAt:now()};rows.set(r.id,r);reserved+=r.size;return project(r);},
  append(sessionId,id,sender,{offset,data}){const r=get(sessionId,id);if(sender!==r.direction)throw fail(403,'Δεν επιτρέπεται αποστολή προς αυτή την κατεύθυνση.');if(r.state!=='UPLOADING'||offset!==r.received)throw fail(409,'Η σειρά μεταφοράς άλλαξε. Ακύρωσε και ξαναστείλε το αρχείο.');if(typeof data!=='string'||data.length>Math.ceil(REMOTE_CHUNK_BYTES/3)*4||!data.length||! /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(data))throw fail(400,'Μη έγκυρο τμήμα αρχείου.');const bytes=Buffer.from(data,'base64');if(!bytes.length||bytes.length>REMOTE_CHUNK_BYTES||bytes.toString('base64')!==data||r.received+bytes.length>r.size)throw fail(400,'Μη έγκυρο τμήμα αρχείου.');r.chunks.push(bytes);r.hash.update(bytes);r.received+=bytes.length;if(r.received===r.size){if(r.hash.digest('hex')!==r.sha256){remove(id);throw fail(422,'Το αρχείο αλλοιώθηκε και διαγράφηκε.');}r.bytes=Buffer.concat(r.chunks);r.chunks=[];r.hash=null;r.state='READY';}return {...project(r),offset:r.received};},
  chunk(sessionId,id,receiver,offset){const r=get(sessionId,id);if(receiver===r.direction)throw fail(403,'Δεν επιτρέπεται λήψη προς αυτή την κατεύθυνση.');if(r.state!=='READY')throw fail(409,'Το αρχείο δεν έχει ολοκληρωθεί.');if(!Number.isSafeInteger(offset)||offset<0||offset>=r.size||offset%REMOTE_CHUNK_BYTES!==0)throw fail(400,'Μη έγκυρη θέση αρχείου.');return {...project(r),offset,data:r.bytes.subarray(offset,offset+REMOTE_CHUNK_BYTES).toString('base64')};},
  list(sessionId){sweep();return [...rows.values()].filter(r=>r.sessionId===sessionId).map(project);},
  remove(sessionId,id){get(sessionId,id);remove(id);},
  stop(sessionId){for(const[id,r]of rows)if(r.sessionId===sessionId)remove(id);},
  sweep,
  memory(){sweep();return {reserved,files:rows.size};}
 };
}
