import {Router} from 'express';
import {createMonthlyInventoryCaptureGrantManager} from '../services/monthly-inventory-capture-grants.js';

const purpose='MONTHLY_INVENTORY_CAPTURE',maximum=9223372036854775807n;
const fail=()=>{throw Object.assign(new Error('Έλεγξε την επιλογή καταστήματος και τα στοιχεία της ενέργειας.'),{status:400,code:'MONTHLY_CAPTURE_HTTP_INPUT_INVALID'})};
const text=value=>typeof value==='string'&&value.length>0&&Buffer.byteLength(value,'utf8')<=160&&value.trim()===value&&!/[\u0000-\u001f\u007f]/.test(value);
const integer=(value,positive=false)=>typeof value==='string'&&value.length<=19&&/^(0|[1-9][0-9]*)$/.test(value)&&BigInt(value)<=maximum&&(!positive||BigInt(value)>0n);
function exact(raw,keys){
 if(!raw||typeof raw!=='object'||Array.isArray(raw)||![Object.prototype,null].includes(Object.getPrototypeOf(raw)))fail();
 const descriptors=Object.getOwnPropertyDescriptors(raw);
 if(Reflect.ownKeys(descriptors).some(key=>typeof key!=='string'||!keys.includes(key)||!Object.hasOwn(descriptors[key],'value'))||keys.some(key=>!Object.hasOwn(descriptors,key)))fail();
 return Object.fromEntries(keys.map(key=>[key,descriptors[key].value]));
}
function request(req,action){
 const keys=['storeId',...(action==='read'?[]:['lifecycleGeneration']),...(['enable','revoke'].includes(action)?['grantId','expectedRevision']:[]),...(action==='enable'?['purpose']:[])];
 if(action==='read'){
  // express.json may initialize an absent GET body to {}. Transported bodies,
  // including an explicitly sent {}, are nevertheless not part of this API.
  if(req.headers['transfer-encoding']||Number(req.headers['content-length']||0)>0||req.body!==undefined&&(typeof req.body!=='object'||req.body===null||Array.isArray(req.body)||Reflect.ownKeys(req.body).length))fail();
 }else exact(req.query,[]);
 const value=exact(action==='read'?req.query:req.body,keys);
 if(!text(value.storeId)||action!=='read'&&!integer(value.lifecycleGeneration)||['enable','revoke'].includes(action)&&(!text(value.grantId)||!integer(value.expectedRevision,true))||action==='enable'&&value.purpose!==purpose)fail();
 const companyId=req.user?.companyId;
 if(!text(companyId))throw Object.assign(new Error('Απαιτείται προσωπική σύνδεση.'),{status:401,code:'MONTHLY_CAPTURE_AUTHENTICATION_REQUIRED'});
 return{companyId,...value};
}

export function createMonthlyInventoryCaptureRouter(db,{manager=createMonthlyInventoryCaptureGrantManager(db)}={}){
 const router=Router();
 router.use((_req,res,next)=>{res.set('Cache-Control','no-store');next()});
 const handle=action=>async(req,res)=>{
  try{if(req.method!==(action==='read'?'GET':'POST'))fail();res.json(await manager[action](req.user,request(req,action)))}
  catch(error){
   if([400,401,403,409].includes(error?.status)&&typeof error?.code==='string'&&/^MONTHLY_(?:CAPTURE|SNAPSHOT)_[A-Z_]+$/.test(error.code))return res.status(error.status).json({error:error.code==='MONTHLY_CAPTURE_HTTP_INPUT_INVALID'?error.message:'Η προσωπική έγκριση δεν είναι διαθέσιμη για αυτή την επιλογή. Κάνε νέο έλεγχο.',code:error.code});
   return res.status(503).json({error:'Ο έλεγχος προσωπικής έγκρισης δεν είναι προσωρινά διαθέσιμος. Κάνε νέο έλεγχο πριν από άλλη ενέργεια.',code:'MONTHLY_CAPTURE_REQUEST_UNAVAILABLE'});
  }
 };
 router.get('/',handle('read'));
 router.post('/create-inactive',handle('createInactive'));
 router.post('/enable',handle('enable'));
 router.post('/revoke',handle('revoke'));
 return router;
}
