import crypto from 'node:crypto';
import {createRemoteSessionStore} from './remote-agent-session.js';
import {createRemoteTransfers} from './attended-remote-transfers.js';
const error=(status,message)=>Object.assign(new Error(message),{status});
export function attendedRemoteGate(env){
 const terminals=new Set(String(env.REMOTE_SUPPORT_TERMINALS||'').split(',').map(x=>x.trim()).filter(x=>/^[A-Za-z0-9_-]{1,100}$/.test(x)));
 return id=>env.REMOTE_SUPPORT_ENABLED==='true'&&terminals.has(id);
}
export function createAttendedRemote({now=Date.now,onStop=()=>{}}={}){
 const invitations=new Map(),grants=new Map(),files=createRemoteTransfers({now});
 const close=id=>{const j=invitations.get(id);invitations.delete(id);for(const[g,v]of grants)if(v.id===id)grants.delete(g);files.stop(id);onStop(j);};
 const sessions=createRemoteSessionStore({now,ttl:null,maxSessions:30,onExpire:s=>close(s.id)});
 const publicJob=j=>({id:j.id,companyId:j.companyId,storeId:j.storeId,terminalId:j.terminalId,storeName:j.storeName,terminalName:j.terminalName,requester:j.requester,state:j.state});
 const same=(j,s)=>j&&j.companyId===s.companyId&&j.storeId===s.storeId&&j.terminalId===s.terminalId;
 const pending=(scope)=>[...invitations.values()].find(j=>same(j,scope)&&j.state==='PENDING');
 return {
  sessions,files,
  invite(scope,creator){sessions.sweep();if(invitations.size>=100)throw error(429,'Πάρα πολλά αιτήματα υποστήριξης.');if([...invitations.values()].filter(j=>j.createdBy===creator.id).length>=3)throw error(409,'Έχεις ήδη τρία ανοικτά καταστήματα ή αιτήματα.');if([...invitations.values()].some(j=>same(j,scope)))throw error(409,'Υπάρχει ήδη αίτημα ή συνεδρία για αυτό το POS.');const j={...scope,id:crypto.randomUUID(),createdBy:creator.id,creatorSessionId:creator.sessionId,creatorSessionVersion:creator.sessionVersion,requester:creator.fullName||'Υποστήριξη MyWorkStation',state:'PENDING'};invitations.set(j.id,j);return publicJob(j);},
  pending(scope){const j=pending(scope);return j?publicJob(j):null;},
  current(scope){const j=[...invitations.values()].find(x=>same(x,scope));return j?publicJob(j):null;},
  get(id){const j=invitations.get(id);if(!j)throw error(404,'Το αίτημα δεν είναι ενεργό.');return j;},
  list(creator){sessions.sweep();return [...invitations.values()].filter(j=>j.createdBy===creator).map(publicJob);},
  consent(id,scope,actor){const j=this.get(id);if(!same(j,scope)||!['PENDING','CONSENTED'].includes(j.state))throw error(409,'Το αίτημα δεν ανήκει σε αυτό το POS ή έχει χρησιμοποιηθεί.');if(j.state==='CONSENTED'&&j.consentSessionId!==actor.operatorSessionId)throw error(409,'Η αποδοχή ανήκει σε άλλη είσοδο χειριστή.');if(j.grant&&j.grantUntil>now())return {grant:j.grant};j.state='CONSENTED';j.consentSessionId=actor.operatorSessionId;j.consentOperatorId=actor.operatorId||actor.id;j.consentEmployeeId=actor.employeeId;j.consentRole=actor.role;j.grant=crypto.randomBytes(32).toString('base64url');j.grantUntil=now()+60_000;grants.set(j.grant,{id:j.id,until:j.grantUntil});return {grant:j.grant};},
  grantJob(grant){const g=typeof grant==='string'&&grants.get(grant);if(!g||g.until<now())throw error(410,'Η παράδοση της αποδοχής έληξε. Στείλε νέο αίτημα.');const j=this.get(g.id);if(j.state!=='CONSENTED'||j.grant!==grant)throw error(409,'Η αποδοχή έχει ήδη χρησιμοποιηθεί.');return j;},
  pair(grant){const j=this.grantJob(grant);const result=sessions.start(j);grants.delete(grant);delete j.grant;delete j.grantUntil;j.state='ACTIVE';return {...result,jobId:j.id,storeName:j.storeName,terminalName:j.terminalName};},
  controller(id,actor){const j=this.get(id);if(j.createdBy!==actor.id||j.creatorSessionId!==actor.sessionId)throw error(403,'Η συνεδρία ανήκει σε άλλον διαχειριστή.');return j;},
  stop(id){sessions.stop(id);close(id);},
  reject(id,scope){const j=this.get(id);if(!same(j,scope))throw error(403,'Άλλο POS.');this.stop(id);},
  sweep(){sessions.sweep();files.sweep();for(const[g,v]of grants)if(v.until<now())grants.delete(g);}
 };
}
