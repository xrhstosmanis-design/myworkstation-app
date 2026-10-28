import {Router} from 'express';
import {readInvoiceAuditEmailPreview} from '../services/invoice-audit-email-preview.js';

export function createInvoiceAuditEmailPreviewRouter(db){
 const router=Router();
 router.get('/',async(req,res,next)=>{
  res.set('Cache-Control','no-store');
  try{res.json(await readInvoiceAuditEmailPreview(db,req.user,req.query))}
  catch(error){if(error?.status)return res.status(error.status).json({error:error.message,code:error.code});next(error)}
 });
 return router;
}
