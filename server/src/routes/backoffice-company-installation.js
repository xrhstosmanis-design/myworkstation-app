import {Router} from 'express';

const inputError=()=>Object.assign(new Error('Έλεγξε τα στοιχεία εγκατάστασης εταιρικών δικαιωμάτων.'),{status:400,code:'COMPANY_INSTALL_INPUT_INVALID'});
const text=(value,limit=160)=>typeof value==='string'&&value.length>0&&value.length<=limit&&value.trim()===value&&!/[\u0000-\u001f\u007f]/.test(value);
function plain(value){return value&&typeof value==='object'&&!Array.isArray(value)&&[Object.prototype,null].includes(Object.getPrototypeOf(value));}
function exact(value,keys){if(!plain(value)||Object.keys(value).length!==keys.length||keys.some(key=>!Object.hasOwn(value,key)))throw inputError();return value;}
function envelope(value,key){exact(value,[key,'mac']);if(typeof value[key]!=='string'||Buffer.byteLength(value[key],'utf8')>32768||!value[key].length||typeof value.mac!=='string'||! /^[a-f0-9]{64}$/.test(value.mac))throw inputError();}
const defaultFactory=async(db,options)=>{
 const {createBackofficeCompanyInstallation}=await import('../services/backoffice-company-installation.js');
 return createBackofficeCompanyInstallation(db,options);
};

// Global schema transition: never accept a selected company/store as authority.
// Importing this router performs no inspection, backup or installation work.
export function createBackofficeCompanyInstallationRouter(db,{env=process.env,createInstallation=defaultFactory,clock=()=>new Date(),runtimePrerequisites=async options=>(await import('../services/backoffice-company-installation-runtime.js')).companyInstallationRuntimePrerequisites(options)}={}){
 const router=Router();
 router.use(async(req,res,next)=>{
  res.set({'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});
  try{
   const actor=req.user;
   if(!text(actor?.id)||!text(actor?.sessionId))return res.status(401).json({code:'COMPANY_INSTALL_SESSION_REQUIRED',error:'Απαιτείται ενεργή προσωπική σύνδεση Super Admin.'});
   const forbidden=['supportContext','storeId','staffAccess','ownerCompanyId','companyAuthority','companyCapabilities'];
   if(forbidden.some(key=>Object.hasOwn(actor,key))||actor.tokenType!=='BACKOFFICE_USER'||actor.role!=='OWNER'||actor.platformRole!=='SUPER_ADMIN'||actor.isSuperAdmin!==true||actor.mustChangePassword!==undefined&&actor.mustChangePassword!==false||!Number.isInteger(actor.sessionVersion)||actor.sessionVersion<0||actor.sessionVersion>2147483647||actor.companyId!==undefined&&!text(actor.companyId))return res.status(403).json({code:'COMPANY_INSTALL_ADMIN_REQUIRED',error:'Απαιτείται προσωπική πρόσβαση Platform Super Admin.'});
   const session=await db.userSession.findUnique({where:{id:actor.sessionId},include:{user:{select:{id:true,companyId:true,role:true,sessionVersion:true,mustChangePassword:true}}}});
   const expires=Number(new Date(session?.expiresAt));
   if(!session||session.userId!==actor.id||session.revokedAt||!Number.isFinite(expires)||expires<=clock().getTime()||session.user?.id!==actor.id||session.user.role!=='SUPER_ADMIN'||session.user.sessionVersion!==actor.sessionVersion||session.user.mustChangePassword||actor.companyId!==undefined&&session.user.companyId!==actor.companyId)return res.status(401).json({code:'COMPANY_INSTALL_SESSION_REVOKED',error:'Η σύνδεση Super Admin χρειάζεται ανανέωση.'});
   next();
  }catch{return res.status(503).json({code:'COMPANY_INSTALL_ACCESS_UNAVAILABLE',error:'Ο έλεγχος πρόσβασης δεν είναι διαθέσιμος.'});}
 });
 const action=method=>async(req,res)=>{
  try{
   const read=method==='describe';
   if(read&&(req.headers['transfer-encoding']||Number(req.headers['content-length']||0)>0))throw inputError();
   const input=exact(read?req.query:req.body,method==='install'?['profile','packet','requestEnvelope','proofEnvelope','explicitAuthorization']:['profile']);
   if(!read)exact(req.query,[]);
   if(Buffer.byteLength(JSON.stringify(input),'utf8')>131072||!['BASE','CAPTURE','CURRENT_CAPTURE'].includes(input.profile))throw inputError();
   if(method==='install'){
    if(input.explicitAuthorization!==true||!plain(input.packet)||!Object.keys(input.packet).length||Buffer.byteLength(JSON.stringify(input.packet),'utf8')>98304)throw inputError();
    envelope(input.requestEnvelope,'requestJson');envelope(input.proofEnvelope,'proofJson');
   }
   const sourceRevision=env.RENDER_GIT_COMMIT||env.GIT_COMMIT;
   if(typeof sourceRevision!=='string'||!/^[a-f0-9]{40}$/.test(sourceRevision))return res.status(503).json({code:'COMPANY_INSTALL_REVISION_REQUIRED',error:'Δεν επιβεβαιώθηκε η έκδοση εγκατάστασης.'});
   const enabled=env.BACKOFFICE_COMPANY_INSTALL_ENABLED==='1';
   const service=await createInstallation(db,{sourceRevision,enabled,profile:input.profile,env});
   const result=read?await service.describe():await service[method](req.user,method==='install'?{packet:input.packet,requestEnvelope:input.requestEnvelope,proofEnvelope:input.proofEnvelope,explicitAuthorization:true}:undefined);
   if(method==='inspect'){
    const prerequisites=await runtimePrerequisites({env});
    const runtimeReady=prerequisites?.ready===true;
    return res.json({...result,eligible:result.eligible===true&&runtimeReady,runtimePrerequisites:prerequisites,installationEnabled:enabled});
   }
   res.json({...result,installationEnabled:enabled});
  }catch(error){
   const known=[400,401,403,409,422].includes(error?.status)&&typeof error?.code==='string'&&/^(?:COMPANY_INSTALL|COMPANY_CURRENT_CAPTURE|COMPANY_COMPATIBILITY|STORE_LIFECYCLE|LIFECYCLE|MONTHLY_INSTALL|REPORT_OPERATIONAL|AUTOMATIC_REPORT)_[A-Z_]+$/.test(error.code);
   res.status(known?error.status:503).json({code:known?error.code:'COMPANY_INSTALL_UNCONFIRMED',error:'Η εγκατάσταση δεν επιβεβαιώθηκε. Ανανέωσε τον έλεγχο πριν από νέα ενέργεια.'});
  }
 };
 router.get('/describe',action('describe'));
 router.post('/inspect',action('inspect'));
 router.post('/install',action('install'));
 return router;
}
