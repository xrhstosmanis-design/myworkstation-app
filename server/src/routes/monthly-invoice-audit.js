import {Router} from 'express';
import {readMonthlyInvoiceAudit,readDelegatedMonthlyInvoiceAudit} from '../services/monthly-invoice-audit.js';

export function createMonthlyInvoiceAuditRouter(db){
 const router=Router();
 router.get('/',async(req,res,next)=>{
  res.set('Cache-Control','no-store');
  try{res.json(req.user?.staffAccess===true?await readDelegatedMonthlyInvoiceAudit(db,req,req.query):await readMonthlyInvoiceAudit(db,req.user,req.query))}
  catch(error){if(error?.status)return res.status(error.status).json({error:error.message,code:error.code});next(error)}
 });
 return router;
}
