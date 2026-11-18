import {Router} from 'express';

const inputError=()=>Object.assign(new Error('Έλεγξε τα στοιχεία προετοιμασίας αναφορών.'),{status:400,code:'REPORT_EVENT_INSTALL_INPUT_INVALID'});
const validId=value=>typeof value==='string'&&value.length>0&&value.length<=200&&value.trim()===value&&!/[\u0000-\u001f\u007f]/.test(value);
function exact(value,keys){
 if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).length!==keys.length||keys.some(key=>!Object.hasOwn(value,key)))throw inputError();
 return value;
}
const defaultFactory=async(db,options)=>{
 const {createAutomaticReportEventInstallation}=await import('../services/automatic-report-event-installation.js');
 return createAutomaticReportEventInstallation(db,options);
};

export function createAutomaticReportEventInstallationRouter(db,{env=process.env,createInstallation=defaultFactory,clock=()=>new Date()}={}){
 const router=Router({mergeParams:true});
 router.use(async(req,res,next)=>{
  res.set({'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});
  try{
   const actor=req.user;
   if(!actor?.id||!actor.sessionId)return res.status(401).json({code:'REPORT_EVENT_INSTALL_SESSION_REQUIRED',error:'Απαιτείται ενεργή σύνδεση Super Admin.'});
   if(actor.supportContext||(actor.tokenType!==undefined&&actor.tokenType!=='BACKOFFICE_USER')||!(actor.isSuperAdmin===true||actor.platformRole==='SUPER_ADMIN'))return res.status(403).json({code:'REPORT_EVENT_INSTALL_ADMIN_REQUIRED',error:'Απαιτείται πρόσβαση Platform Super Admin.'});
   const session=await db.userSession.findUnique({where:{id:actor.sessionId},include:{user:{select:{id:true,role:true,sessionVersion:true,mustChangePassword:true}}}});
   const expires=Number(new Date(session?.expiresAt));
   if(!session||session.userId!==actor.id||session.revokedAt||!Number.isFinite(expires)||expires<=clock().getTime()||session.user?.id!==actor.id||session.user.role!=='SUPER_ADMIN'||session.user.sessionVersion!==actor.sessionVersion||session.user.mustChangePassword)return res.status(401).json({code:'REPORT_EVENT_INSTALL_SESSION_REVOKED',error:'Η σύνδεση Super Admin χρειάζεται ανανέωση.'});
   if(!validId(req.params.companyId)||!validId(req.params.storeId))throw inputError();
   next();
  }catch(error){
   if(error?.status===400)return res.status(400).json({code:error.code,error:error.message});
   return res.status(503).json({code:'REPORT_EVENT_INSTALL_ACCESS_UNAVAILABLE',error:'Ο έλεγχος πρόσβασης δεν είναι διαθέσιμος.'});
  }
 });
 const action=method=>async(req,res)=>{
  try{
   const read=method==='describe';
   const input=exact(read?req.query:req.body,method==='install'?['profile','packet','explicitAuthorization']:['profile']);
   if(!read)exact(req.query,[]);
   if(read&&(req.headers['transfer-encoding']||Number(req.headers['content-length']||0)>0))throw inputError();
   if(!['BASE','CAPTURE','CAPTURE_REPORTS_ONLY'].includes(input.profile)||method==='install'&&input.explicitAuthorization!==true)throw inputError();
   const sourceRevision=env.RENDER_GIT_COMMIT||env.GIT_COMMIT;
   if(typeof sourceRevision!=='string'||!/^[a-f0-9]{40}$/.test(sourceRevision))return res.status(503).json({code:'REPORT_EVENT_INSTALL_REVISION_REQUIRED',error:'Δεν επιβεβαιώθηκε η έκδοση εγκατάστασης.'});
   const service=await createInstallation(db,{sourceRevision,enabled:env.AUTOMATIC_REPORT_EVENT_INSTALL_ENABLED==='1',profile:input.profile});
   const scope={companyId:req.params.companyId,storeId:req.params.storeId};
   const result=method==='describe'?await service.describe():await service[method](req.user,{...scope,...(method==='install'?{packet:input.packet,explicitAuthorization:true}:{})});
   res.json(result);
  }catch(error){
   const known=[400,401,403,409,422].includes(error?.status)&&typeof error?.code==='string'&&/^(?:REPORT_EVENT|REPORT_OPERATIONAL|AUTOMATIC_REPORT|STORE_LIFECYCLE|LIFECYCLE)_[A-Z_]+$/.test(error.code);
   res.status(known?error.status:503).json({code:known?error.code:'REPORT_EVENT_INSTALL_UNCONFIRMED',error:'Η προετοιμασία δεν επιβεβαιώθηκε. Ανανέωσε τον έλεγχο πριν από νέα ενέργεια.'});
  }
 };
 router.get('/describe',action('describe'));
 router.post('/inspect',action('inspect'));
 router.post('/install',action('install'));
 return router;
}
