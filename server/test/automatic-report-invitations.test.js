import test from 'node:test';
import assert from 'node:assert/strict';
import {invitationHash,invitationUrl,parseInvitation,createAutomaticReportInvitations} from '../src/services/automatic-report-invitations.js';
import express from 'express';
import {createAutomaticReportInvitationRouter} from '../src/routes/automatic-report-invitations.js';
import {JSDOM} from 'jsdom';

test('invitation links carry purpose-bound proof in a fragment, never a request query',()=>{
 const proof={companyId:'c',storeId:'s',recipientId:'r',version:1,generation:'3',nonce:'b'.repeat(32),issuedAt:'2026-10-25T10:00:00.000Z',token:'a'.repeat(32)};
 const url=new URL(invitationUrl(proof));
 assert.equal(url.origin,'https://myworkstation-app.onrender.com');assert.equal(url.search,'');
 assert.deepEqual(parseInvitation(url.hash.slice(1)),proof);
 assert.throws(()=>parseInvitation(JSON.stringify({...proof,actorId:'admin'})));
 assert.throws(()=>invitationUrl(proof,'https://attacker.invalid/path'));
});

test('invitation hash separates legacy proof and binds frequencies and consent revision',()=>{
 const recipient={companyId:'c',storeId:'s',recipientId:'r',version:'1',challengeLifecycleGeneration:'3',challengeNonce:'b'.repeat(32),challengePurpose:'CONSENT',challengeFrequencies:['DAILY'],challengeConsentRevision:'0'};
 const token='a'.repeat(32),hash=invitationHash(recipient,token);
 assert.match(hash,/^[a-f0-9]{64}$/);
 assert.notEqual(hash,invitationHash({...recipient,challengeFrequencies:['WEEKLY']},token));
 assert.notEqual(hash,invitationHash({...recipient,challengeConsentRevision:'1'},token));
 assert.notEqual(hash,invitationHash({...recipient,version:'2'},token));
});

function issueHarness({verified=false,consented=false,receipt}={}){
 const now=new Date('2026-10-25T10:00:00.000Z'),r={companyId:'c',storeId:'s',recipientId:'r',email:'recipient@example.invalid',version:'1',verifiedAt:verified?now:null},c=consented?{active:true,revision:'1',recipientVersion:'1',lifecycleGeneration:'3',allowedFrequencies:['DAILY']}:null,events=[],mail=[];
 const tx={$queryRaw:async()=>[], $executeRaw:async(strings,...v)=>{events.push(strings.join(''));if(strings.join('').includes('"challengeIssuedAt"='))Object.assign(r,{challengeHash:v[0],challengeNonce:v[1],challengeRecipientVersion:String(v[2]),challengeLifecycleGeneration:String(v[3]),challengeExpiresAt:v[4],challengeIssuedAt:v[5],challengePurpose:'CONSENT',challengeFrequencies:v[6],challengeConsentRevision:String(v[7])});return 1}};
 const service=createAutomaticReportInvitations({mutate:async(scope,work)=>{events.push('begin');const result=await work({tx,scope,now,generation:'3',records:{recipients:[{recipient:r,consent:c}]}});events.push('commit');return result},sendInvitation:async m=>{assert.equal(events.at(-1),'commit');mail.push(m);return receipt||{accepted:[m.to],rejected:[],messageId:'fixture'}}});
 return {service,r,c,events,mail};
}
const admin={actorId:'admin',companyId:'c',storeId:'s'},issueInput={email:'recipient@example.invalid',recipientId:'r',expectedVersion:1,allowedFrequencies:['DAILY']};
test('one committed invitation replaces two code emails, hash only and no proof in response',async()=>{
 const h=issueHarness(),result=await h.service.issue(admin,issueInput);assert.equal(result.invitationIssued,true);assert.equal(h.mail.length,1);
 const link=h.mail[0].text.match(/https:\/\/[^\s]+/)[0],proof=parseInvitation(new URL(link).hash.slice(1));
 assert.equal(h.r.challengePurpose,'CONSENT');assert.equal(invitationHash(h.r,proof.token),h.r.challengeHash);
 assert.doesNotMatch(JSON.stringify(result),new RegExp(proof.token));assert.doesNotMatch(h.mail[0].text,/Κωδικός:/);
 assert.equal(h.events.filter(x=>x.includes('UPDATE')).length,1);
 await assert.rejects(h.service.issue(admin,issueInput),{code:'REPORT_CHALLENGE_COOLDOWN'});assert.equal(h.mail.length,1);
});
test('already verified current consent is reused with zero writes, zero mail and zero invalidation',async()=>{
 const h=issueHarness({verified:true,consented:true}),result=await h.service.issue(admin,issueInput);
 assert.equal(result.alreadyConfirmed,true);assert.deepEqual(h.events,['begin','commit']);assert.equal(h.mail.length,0);
});
test('uncertain SMTP is one attempt after commit, never a retry or proof disclosure',async()=>{
 const h=issueHarness({receipt:{messageId:'not-acceptance'}});await assert.rejects(h.service.issue(admin,issueInput),{code:'REPORT_VERIFICATION_SEND_UNCONFIRMED'});assert.equal(h.mail.length,1);assert.match(h.r.challengeHash,/^[a-f0-9]{64}$/);
});
test('strict invitation input refuses actor injection and stale versions before issuing mail',async()=>{
 const h=issueHarness();await assert.rejects(h.service.issue(admin,{...issueInput,actorId:'attacker'}));await assert.rejects(h.service.issue(admin,{...issueInput,expectedVersion:9}),{code:'REPORT_REVISION_CHANGED'});assert.equal(h.mail.length,0);
});

test('actual global JSON parser order sanitizes malformed proof and oversized/non-JSON requests',async()=>{
 let inspected=0,confirmed=0,logged=0;const service={inspect:async()=>{inspected++;return {storeName:'Synthetic',email:'recipient@example.invalid',allowedFrequencies:['DAILY'],expiresAt:'2026-10-25T10:10:00.000Z'}},confirm:async()=>{confirmed++;return {confirmed:true}}};
 const app=express();app.use(express.json({limit:'12mb'}));app.use('/api/report-invitations',createAutomaticReportInvitationRouter(null,{service}));app.use((error,_req,res,_next)=>{logged++;res.status(500).json({error:String(error)})});
 const server=app.listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));const base=`http://127.0.0.1:${server.address().port}/api/report-invitations`,origin='https://myworkstation-app.onrender.com',secret='do-not-log-proof-marker';
 try{
  for(const suffix of ['','?token='+secret]){const r=await fetch(base+suffix);assert.equal(r.status,200);assert.equal(r.headers.get('cache-control'),'no-store');assert.match(r.headers.get('content-security-policy'),/script-src 'sha256-/);assert.doesNotMatch(await r.text(),new RegExp(secret))}
  assert.equal(inspected+confirmed,0,'scanner GET has zero authority calls');
  const headers={'Content-Type':'application/json',Origin:origin,'X-Report-Invitation-Intent':'confirm'};
  const malformed=await fetch(base+'/confirm',{method:'POST',headers,body:'{"invitation":"'+secret+'",'});assert.equal(malformed.status,400);assert.doesNotMatch(await malformed.text(),new RegExp(secret));assert.equal(logged,0);
  const tooLarge=await fetch(base+'/confirm',{method:'POST',headers,body:JSON.stringify({invitation:'x'.repeat(9000),explicitConsent:true})});assert.equal(tooLarge.status,413);
  const nonJson=await fetch(base+'/confirm',{method:'POST',headers:{...headers,'Content-Type':'text/plain'},body:secret});assert.equal(nonJson.status,400);
  const foreign=await fetch(base+'/confirm',{method:'POST',headers:{...headers,Origin:'https://foreign.invalid'},body:JSON.stringify({invitation:'x',explicitConsent:true})});assert.equal(foreign.status,403);
  const noIntent=await fetch(base+'/confirm',{method:'POST',headers:{'Content-Type':'application/json',Origin:origin},body:JSON.stringify({invitation:'x',explicitConsent:true})});assert.equal(noIntent.status,403);
  assert.equal(inspected+confirmed,0);assert.equal(logged,0);
  const accepted=await fetch(base+'/confirm',{method:'POST',headers,body:JSON.stringify({invitation:'proof-envelope',explicitConsent:true})});assert.equal(accepted.status,200);assert.equal(confirmed,1);
  const ordinary=await fetch(base.replace('/api/report-invitations','/api/other'),{method:'POST',headers:{'Content-Type':'application/json'},body:'{"broken":'});assert.equal(ordinary.status,500);assert.equal(logged,1,'unrelated global error handling remains unchanged');
 }finally{await new Promise(resolve=>server.close(resolve))}
});

test('actual landing script inspects but never auto-consents, strips fragment and requires explicit user action',async()=>{
 const app=express();app.use('/api/report-invitations',createAutomaticReportInvitationRouter(null,{service:{}}));const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));
 let dom;try{
  const html=await (await fetch(`http://127.0.0.1:${server.address().port}/api/report-invitations`)).text(),calls=[];
  dom=new JSDOM(html,{url:'https://myworkstation-app.onrender.com/api/report-invitations#synthetic-proof',runScripts:'dangerously',beforeParse(window){window.fetch=async(path,options)=>{calls.push({path,body:JSON.parse(options.body),options});return {ok:true,json:async()=>path.endsWith('/inspect')?{storeName:'<img src=x onerror=alert(1)>',email:'recipient@example.invalid',allowedFrequencies:['DAILY']}:{confirmed:true}}}}});
  await new Promise(r=>setTimeout(r,0));assert.equal(dom.window.location.hash,'');assert.equal(calls.length,1);assert.match(calls[0].path,/inspect$/);assert.equal(calls[0].options.credentials,'omit');assert.equal(dom.window.document.querySelectorAll('img').length,0);
  const button=dom.window.document.getElementById('confirm'),ack=dom.window.document.getElementById('ack');assert.equal(button.disabled,true);button.click();assert.equal(calls.length,1);ack.click();button.click();await new Promise(r=>setTimeout(r,0));assert.equal(calls.length,2);assert.deepEqual(calls[1].body,{invitation:'synthetic-proof',explicitConsent:true});assert.match(dom.window.document.getElementById('message').textContent,/επιβεβαιώθηκαν/);
 }finally{dom?.window.close();await new Promise(r=>server.close(r))}
});
