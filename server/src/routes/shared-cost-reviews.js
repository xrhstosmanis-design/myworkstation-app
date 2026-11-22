import {Router} from 'express';
import {z} from 'zod';
import {createSharedCostReviews} from '../services/shared-cost-reviews.js';
export function createSharedCostReviewRoutes({db,repository=createSharedCostReviews(db)}={}){
 const router=Router();
 const run=method=>async(req,res)=>{
  res.set('Cache-Control','no-store');
  try{res.json(await repository[method](req.method==='GET'?req.query:req.body,req.user))}
  catch(error){const invalid=error instanceof z.ZodError,known=String(error.code||'').startsWith('SHARED_REVIEW_'),auth=['AI_WALLET_ROLE_DENIED','AI_WALLET_SESSION_REQUIRED'].includes(error.code);res.status(invalid?400:known||auth?error.status||409:503).json({code:invalid?'SHARED_REVIEW_INVALID':known||auth?error.code:'SHARED_REVIEW_UNAVAILABLE',error:invalid?'Έλεγξε μήνα, αναφορά και στοιχεία επιμερισμού.':error.code==='SHARED_REVIEW_CHANGED'?'Τα στοιχεία ή η έκδοση άλλαξαν. Χρειάζεται νέος έλεγχος στον server.':'Η αποθήκευση δεν επιβεβαιώθηκε. Διατήρησε την ίδια αναφορά και έλεγξε το ιστορικό ή επανάλαβε το ίδιο αίτημα.'})}
 };
 router.post('/preview',run('preview'));router.post('/save',run('save'));router.get('/history',run('history'));return router;
}
