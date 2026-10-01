import crypto from 'node:crypto';
const fail=(status,message)=>Object.assign(new Error(message),{status});
export function createRemoteSessionStore({now=Date.now,ttl=20*60_000,idle=15_000,maxSessions=10,onExpire=()=>{}}={}){
 const sessions=new Map();
 const expire=(id,s)=>{sessions.delete(id);onExpire(s);};
 const current=id=>{const s=sessions.get(id);if(!s)throw fail(404,'Η συνεδρία δεν είναι ενεργή.');if(now()>s.expiresAt||now()-s.lastDeviceAt>idle){expire(id,s);throw fail(410,'Η συνεδρία έληξε ή χάθηκε η σύνδεση.');}return s;};
 const sweep=()=>{for(const [id,s] of sessions)if(now()>s.expiresAt||now()-s.lastDeviceAt>idle)expire(id,s);};
 return {
  start(job){sweep();if(sessions.size>=maxSessions)throw fail(503,'Δεν υπάρχει διαθέσιμη συνεδρία.');if(sessions.has(job.id))throw fail(409,'Η συνεδρία υπάρχει ήδη.');const token=crypto.randomBytes(32).toString('base64url');const s={...job,tokenHash:crypto.createHash('sha256').update(token).digest(),expiresAt:now()+ttl,lastDeviceAt:now(),lastControllerAt:now(),frame:null,commands:[],sequence:0};sessions.set(job.id,s);return {token,expiresAt:s.expiresAt};},
  device(id,token){const s=current(id);const digest=crypto.createHash('sha256').update(String(token||'')).digest();if(!crypto.timingSafeEqual(digest,s.tokenHash))throw fail(401,'Μη έγκυρη συνεδρία συσκευής.');return s;},
  controller(id,userId){const s=current(id);if(s.createdBy!==userId)throw fail(403,'Η συνεδρία ανήκει σε άλλον διαχειριστή.');return s;},
  frame(s,frame){if(now()-s.lastControllerAt>idle){expire(s.id,s);throw fail(410,'Ο διαχειριστής αποσυνδέθηκε.');}s.lastDeviceAt=now();s.frame={...frame,sequence:++s.sequence,at:now()};const commands=s.commands.splice(0);return {commands,expiresAt:s.expiresAt};},
  view(s){s.lastControllerAt=now();return {frame:s.frame,expiresAt:s.expiresAt,terminalId:s.terminalId};},
  command(s,event){s.lastControllerAt=now();if(s.commands.length>=100)throw fail(429,'Πάρα πολλές εντολές.');s.commands.push({...event,sequence:s.sequence,at:now()});},
  stop(id){sessions.delete(id);},
  canStart(){sweep();return sessions.size<maxSessions;},
  sweep
 };
}
export function validateRemoteInput(body){
 const failInput=()=>{throw fail(400,'Μη έγκυρη εντολή.');};
 if(body?.type==='click'&&['left','right'].includes(body.button)&&Number.isFinite(body.x)&&Number.isFinite(body.y)&&body.x>=0&&body.x<=1&&body.y>=0&&body.y<=1)return {type:'click',button:body.button,x:body.x,y:body.y};
 if(body?.type==='wheel'&&[-1,1].includes(body.direction))return {type:'wheel',direction:body.direction};
 const allowed=new Set(['Enter','Tab','Backspace','Delete','Escape','ArrowUp','ArrowDown','ArrowLeft','ArrowRight','Home','End','PageUp','PageDown']);
 if(body?.type==='key'&&allowed.has(body.key))return {type:'key',key:body.key};
 if(body?.type==='text'&&typeof body.text==='string'&&body.text.length>0&&body.text.length<=200&&!/[\u0000-\u001f\u007f]/.test(body.text))return {type:'text',text:body.text};
 return failInput();
}
