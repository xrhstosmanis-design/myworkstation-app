import {Router} from 'express';
import {createLabDocumentEngine,labError} from './documents.mjs';
import {createLabDocumentPdf} from './documents-pdf.mjs';
export function createLabDocumentsRouter(options){
  const engine=createLabDocumentEngine(options),router=Router();
  router.use((req,res,next)=>{res.set('Cache-Control','no-store');res.vary('Authorization');next()});
  const endpoint=work=>async(req,res,next)=>{try{await work(req,res)}catch(error){if(error.status>=400&&error.status<500)return res.status(error.status).json({testOnly:true,error:error.message,code:error.code});next(error)}};
  function query(req){if(Object.keys(req.query).length!==1||typeof req.query.storeId!=='string'||!req.query.storeId.trim()||req.query.storeId!==req.query.storeId.trim())throw labError(400,'LAB_STORE_REQUIRED','Επίλεξε συγκεκριμένο κατάστημα δοκιμής.');if(req.body&&Object.keys(req.body).length)throw labError(400,'LAB_INPUT_INVALID','Η προβολή δεν δέχεται σώμα δεδομένων.');return req.query.storeId}
  router.get('/state',endpoint(async(req,res)=>res.json(await engine.state(req.user,query(req)))));
  router.post('/documents',endpoint(async(req,res)=>res.status(201).json(await engine.issue(req.user,req.body))));
  router.post('/documents/:id/cancel',endpoint(async(req,res)=>res.json(await engine.cancel(req.user,req.params.id,req.body))));
  router.post('/payments',endpoint(async(req,res)=>res.status(201).json(await engine.pay(req.user,req.body))));
  router.get('/documents/:id/pdf',endpoint(async(req,res)=>{
    const document=await engine.getDocument(req.user,query(req),req.params.id),bytes=await createLabDocumentPdf(document);
    res.set({'Content-Type':'application/pdf','Content-Disposition':`attachment; filename="TEST-${document.id}.pdf"`,'X-Content-Type-Options':'nosniff'}).send(bytes);
  }));
  return router;
}
