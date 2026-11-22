import {Router} from 'express';
import {readMonthlyInvoiceAudit,readDelegatedMonthlyInvoiceAudit,readMonthlyInvoiceAuditRecord} from '../services/monthly-invoice-audit.js';

export function createMonthlyInvoiceAuditRouter(db){
 const router=Router();
 router.get('/record',async(req,res,next)=>{
  res.set('Cache-Control','no-store');
  if(req.user?.staffAccess===true)return res.status(403).json({error:'Απαιτείται εξουσιοδοτημένη διαχείριση BackOffice.',code:'STAFF_ACCESS_DENIED'});
  try{res.json(await readMonthlyInvoiceAuditRecord(db,req.user,req.query))}
  catch(error){if(error?.status)return res.status(error.status).json({error:error.message,code:error.code});next(error)}
 });
 router.get('/',async(req,res,next)=>{
  res.set('Cache-Control','no-store');
  try{res.json(req.user?.staffAccess===true?await readDelegatedMonthlyInvoiceAudit(db,req,req.query):await readMonthlyInvoiceAudit(db,req.user,req.query))}
  catch(error){if(error?.status)return res.status(error.status).json({error:error.message,code:error.code});next(error)}
 });
 return router;
}
