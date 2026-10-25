import {Router} from 'express';
import {createAutomaticReportManagement} from '../services/automatic-report-dispatch-policy.js';
import {readActivation} from '../services/automatic-report-activation.js';
import {createAutomaticReportSmtpTransport} from '../services/mail.js';

const explanations={
 REPORT_REVISION_CHANGED:'Η ρύθμιση άλλαξε σε άλλο παράθυρο. Πάτησε Ανανέωση.',
 REPORT_LIFECYCLE_ENROLLMENT_REQUIRED:'Δεν έχει ολοκληρωθεί ακόμη η ασφαλής προετοιμασία αυτού του καταστήματος για αυτόματες αποστολές.',
 REPORT_DISPATCH_SCHEMA_REQUIRED:'Η προετοιμασία αυτόματων αποστολών δεν έχει ολοκληρωθεί.',
 REPORT_ACTIVATION_REQUIRED:'Απαιτείται πρώτα η τελική προετοιμασία ενεργοποίησης.',
 REPORT_CHALLENGE_COOLDOWN:'Περίμενε 60 δευτερόλεπτα πριν ζητήσεις νέο κωδικό.',
 REPORT_CHALLENGE_INVALID:'Ο κωδικός δεν ισχύει, έχει λήξει ή έχει ήδη χρησιμοποιηθεί.',
 REPORT_RECIPIENT_LIMIT:'Επιτρέπονται έως πέντε ενεργοί παραλήπτες ανά κατάστημα.',
 REPORT_RECIPIENT_UNVERIFIED:'Επιβεβαίωσε πρώτα τη διεύθυνση email του παραλήπτη.',
 REPORT_POLICY_PREREQUISITES:'Χρειάζονται εξουσιοδότηση και ενεργή συγκατάθεση παραλήπτη για τις επιλεγμένες περιόδους.',
 REPORT_DISPATCH_BUSY:'Οι ρυθμίσεις χρησιμοποιούνται από άλλη εργασία. Ανανέωσε σε λίγο.'
 ,REPORT_RECIPIENT_REVOKED:'Ο παραλήπτης έχει ανακληθεί. Χρειάζεται ρητή επαναπροσθήκη πριν από νέα πρόσκληση.'
};

// Authentication is mounted by index; the actual current database role is also
// required here and again by the mutation services. Browser flags are not grants.
export function createAutomaticReportDispatchRouter(db,{env=process.env,management}={}){
 const router=Router({mergeParams:true});
 const service=management||createAutomaticReportManagement({db,activationProvider:()=>readActivation(env),sendVerification:({companyId,storeId,to,subject,text})=>createAutomaticReportSmtpTransport({companyId,storeId,env}).sendMail({to,subject,text})});
 const scope=req=>({actorId:req.user.id,companyId:req.params.companyId,storeId:req.params.storeId});
 router.use(async(req,res,next)=>{
  res.set({'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});
  try{
   if(typeof req.user?.id!=='string'||!req.user.id)return res.status(401).json({error:'Απαιτείται σύνδεση.'});
   if(![req.params.companyId,req.params.storeId].every(x=>typeof x==='string'&&x.length>0&&x.length<=200&&!/[\u0000-\u001f\u007f]/.test(x)))return res.status(400).json({error:'Απαιτείται συγκεκριμένη εταιρεία και κατάστημα.'});
   const actor=await db.user.findUnique({where:{id:req.user.id},select:{id:true,role:true}});
   if(actor?.role!=='SUPER_ADMIN')return res.status(403).json({error:'Απαιτείται Super Admin.'});
   next();
  }catch{return res.status(503).json({error:'Ο έλεγχος πρόσβασης δεν είναι διαθέσιμος.'})}
 });
 const handle=fn=>async(req,res)=>{
  try{res.json(await fn(req))}
  catch(error){
   if(error?.name==='ZodError')return res.status(400).json({error:'Έλεγξε τα στοιχεία της φόρμας.'});
   if(Number.isInteger(error?.status)&&error.status>=400&&error.status<500)return res.status(error.status).json({error:explanations[error.code]||error.message,code:error.code});
   // SMTP/database errors may contain addresses, credentials or challenge data.
   // Never forward arbitrary causes to the global error logger or browser.
   res.status(503).json({error:'Η ενέργεια δεν επιβεβαιώθηκε. Ανανέωσε την κατάσταση πριν από νέα προσπάθεια.',code:'AUTOMATIC_REPORT_ACTION_UNCONFIRMED'});
  }
 };
 router.get('/',handle(req=>service.getDispatchManagement(scope(req))));
 router.put('/policy',handle(req=>service.saveDispatchPolicy(scope(req),req.body)));
 router.put('/grant',handle(req=>service.saveAutomationGrant(scope(req),req.body)));
 router.put('/recipients',handle(req=>service.saveRecipient(scope(req),req.body)));
 router.post('/invitations',handle(req=>service.issueRecipientInvitation(scope(req),req.body)));
 const recipient=req=>({...req.body,recipientId:req.params.recipientId});
 router.delete('/recipients/:recipientId',handle(req=>service.revokeRecipient(scope(req),recipient(req))));
 router.post('/recipients/:recipientId/verification',handle(req=>service.issueRecipientVerification(scope(req),recipient(req))));
 router.post('/recipients/:recipientId/verification/confirm',handle(req=>service.confirmRecipientVerification(scope(req),recipient(req))));
 router.post('/recipients/:recipientId/consent/request',handle(req=>service.issueRecipientConsent(scope(req),recipient(req))));
 router.post('/recipients/:recipientId/consent/confirm',handle(req=>service.confirmRecipientConsent(scope(req),recipient(req))));
 router.put('/recipients/:recipientId/consent',handle(req=>service.saveRecipientConsent(scope(req),recipient(req))));
 return router;
}
