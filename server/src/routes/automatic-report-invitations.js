import express,{Router} from 'express';
import {createHash} from 'node:crypto';
import {z} from 'zod';
import {createAutomaticReportInvitations,trustedInvitationOrigin} from '../services/automatic-report-invitations.js';
import {dispatchSchemaReady,readLockedDispatchAuthorization} from '../services/automatic-report-dispatch-policy.js';

const script=`(()=>{'use strict';const message=document.getElementById('message'),button=document.getElementById('confirm'),ack=document.getElementById('ack'),details=document.getElementById('details');let invitation=location.hash.slice(1);history.replaceState(null,'',location.pathname);const labels={DAILY:'Ημερήσια',WEEKLY:'Εβδομαδιαία',MONTHLY:'Μηνιαία'};const request=async(path,body)=>{const r=await fetch('/api/report-invitations/'+path,{method:'POST',credentials:'omit',cache:'no-store',referrerPolicy:'no-referrer',headers:{'Content-Type':'application/json','X-Report-Invitation-Intent':path},body:JSON.stringify(body)});if(!r.ok)throw new Error('Η πρόσκληση δεν είναι διαθέσιμη ή έχει λήξει. Ζήτησε νέα από τον υπεύθυνο.');return r.json()};ack.onchange=()=>{button.disabled=!ack.checked};button.onclick=async()=>{if(!ack.checked||!invitation)return;button.disabled=true;ack.disabled=true;try{await request('confirm',{invitation,explicitConsent:true});invitation='';message.textContent='Το email και η συγκατάθεσή σου επιβεβαιώθηκαν. Μπορείς να κλείσεις αυτή τη σελίδα.';details.hidden=true}catch(e){message.textContent=e.message;ack.disabled=false;button.disabled=!ack.checked}};if(!invitation){message.textContent='Άνοιξε τον πλήρη σύνδεσμο της πρόσκλησης από το email.';return}request('inspect',{invitation}).then(data=>{document.getElementById('store').textContent=data.storeName;document.getElementById('email').textContent=data.email;document.getElementById('frequencies').textContent=data.allowedFrequencies.map(x=>labels[x]).join(', ');details.hidden=false;message.textContent='Έλεγξε τα στοιχεία και επιβεβαίωσε μόνο αν θέλεις να λαμβάνεις αυτές τις αναφορές.'}).catch(e=>{message.textContent=e.message;invitation=''})})();`;
const html=`<!doctype html><html lang="el"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="referrer" content="no-referrer"><title>Επιβεβαίωση αναφορών MyWorkStation</title><style>body{font:18px/1.5 system-ui,sans-serif;background:#f1f5f9;color:#142238;margin:0;padding:24px}main{max-width:640px;margin:40px auto;background:white;border-radius:18px;padding:28px}h1{font-size:28px}button{font:inherit;min-height:48px;padding:12px 20px;border:0;border-radius:10px;background:#173f79;color:white}button:disabled{opacity:.5}label{display:block;margin:24px 0}input{width:22px;height:22px;vertical-align:middle}</style><main><h1>Αναφορές MyWorkStation</h1><p id="message" role="status">Ανάγνωση πρόσκλησης…</p><section id="details" hidden><p>Κατάστημα: <strong id="store"></strong><br>Email: <strong id="email"></strong><br>Περίοδοι: <strong id="frequencies"></strong></p><p>Οι αναφορές είναι προσωρινές. Δεν αποτελούν πλήρη οικονομική συμφωνία ή χρέωση εργαζομένου. Μπορείς να ζητήσεις ανάκληση από τον υπεύθυνο του καταστήματος.</p><label><input id="ack" type="checkbox"> Θέλω να λαμβάνω τις παραπάνω προσωρινές αναφορές σε αυτό το email.</label><button id="confirm" type="button" disabled>Επιβεβαίωση email και συγκατάθεσης</button></section></main><script>${script}</script></html>`;
const generic='Η πρόσκληση δεν είναι διαθέσιμη. Ζήτησε νέα από τον υπεύθυνο.';

export function createAutomaticReportInvitationRouter(db,{service,clock,origin}={}){
 const router=Router(),trusted=trustedInvitationOrigin(origin);
 const invitations=service||createAutomaticReportInvitations({db,clock,origin:trusted,readAuthorization:readLockedDispatchAuthorization,schemaReady:dispatchSchemaReady});
 router.use((_req,res,next)=>{res.set({'Cache-Control':'no-store','Referrer-Policy':'no-referrer','X-Content-Type-Options':'nosniff','Content-Security-Policy':`default-src 'none'; script-src 'sha256-${createHash('sha256').update(script).digest('base64')}'; style-src 'unsafe-inline'; connect-src 'self'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'`});next()});
 // This GET deliberately does not inspect proof, increment attempts or write.
 router.get('/',(_req,res)=>res.type('html').send(html));
 router.use((req,res,next)=>{
  // index already parses ordinary JSON with a 12 MiB wire cap. Bound the
  // preparsed semantic payload here as well; a second parser cannot do that.
  const declared=req.get('Content-Length');
  if(declared&&(!/^\d+$/.test(declared)||Number(declared)>8192)||req.body!==undefined&&Buffer.byteLength(JSON.stringify(req.body))>8192)return res.status(413).json({error:generic});
  next();
 });
 router.use(express.json({limit:'8kb',strict:true}));
 const handle=(action,schema)=>async(req,res)=>{
  try{
   if(req.get('Origin')!==trusted||req.get('X-Report-Invitation-Intent')!==action||req.get('Sec-Fetch-Site')&&req.get('Sec-Fetch-Site')!=='same-origin')return res.status(403).json({error:generic});
   const body=schema.parse(req.body);
   res.json(await (action==='inspect'?invitations.inspect(body.invitation):invitations.confirm(body)));
  }catch(error){res.status(Number.isInteger(error?.status)&&error.status>=400&&error.status<500?error.status:error?.name==='ZodError'?400:503).json({error:generic})}
 };
 router.post('/inspect',handle('inspect',z.object({invitation:z.string().min(1).max(4000)}).strict()));
 router.post('/confirm',handle('confirm',z.object({invitation:z.string().min(1).max(4000),explicitConsent:z.literal(true)}).strict()));
 // Errors from this router never forward token-bearing causes to global logs.
 router.use((_error,_req,res,_next)=>res.status(400).json({error:generic}));
 // A four-argument handler must be mounted OUTSIDE the Router to catch errors
 // from index's earlier JSON parser (Express skips normal router mounts).
 const upstreamError=(_error,_req,res,_next)=>res.set({'Cache-Control':'no-store','Referrer-Policy':'no-referrer','X-Content-Type-Options':'nosniff'}).status(400).json({error:generic});
 return [upstreamError,router];
}
