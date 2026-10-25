import {invoiceWalletFeatures} from "../services/ai-wallet-invoice-metering.js";
import {Router} from 'express';
import {z} from 'zod';
import {prisma} from '../prisma.js';
import {auth} from '../middleware/auth.js';
import {aiOwnerWalletRepository} from '../services/ai-owner-wallet-runtime.js';
import {createWalletAccess} from '../services/ai-owner-wallet-access.js';
import {walletError} from '../services/ai-owner-wallet-contract.js';
import {ownerWalletReadiness,requireOwnerWalletReady} from '../services/ai-owner-wallet-readiness.js';

const messages={AI_WALLET_INSUFFICIENT:'Δεν επαρκεί το διαθέσιμο υπόλοιπο AI. Χρειάζεται ανανέωση. Οι πωλήσεις και το υπόλοιπο πρόγραμμα συνεχίζουν κανονικά.',AI_WALLET_CHANGED:'Το υπόλοιπο ή οι ρυθμίσεις άλλαξαν. Ανανέωσε πριν αποθηκεύσεις.',AI_WALLET_RECEIPT_CONFLICT:'Η αναφορά είσπραξης έχει ήδη χρησιμοποιηθεί. Δεν έγινε δεύτερη πίστωση.',AI_WALLET_USAGE_REVIEW:'Η κατανάλωση της κλήσης AI χρειάζεται έλεγχο. Το δεσμευμένο ποσό διατηρήθηκε.',AI_WALLET_TARIFF_REQUIRED:'Δεν έχει οριστεί έγκυρος τιμοκατάλογος για αυτή τη λειτουργία AI.',AI_WALLET_DISABLED:'Η προπληρωμένη χρέωση AI δεν έχει ενεργοποιηθεί.',AI_WALLET_OWNER_REQUIRED:'Επίλεξε υπάρχοντα Ιδιοκτήτη της εταιρείας για τις ειδοποιήσεις email.'};
export function walletHttpError(e,res){
  const code=e instanceof z.ZodError?'AI_WALLET_INVALID_INPUT':String(e.code||'');
  const known=code.startsWith('AI_WALLET_');
  const extra={AI_WALLET_PROVIDER_REQUIRED:'Η υπάρχουσα σύνδεση AI δεν είναι διαθέσιμη. Η χρέωση δεν ενεργοποιήθηκε.',AI_WALLET_TRIAL_CONFLICT:'Η αναφορά δοκιμαστικής παροχής έχει ήδη χρησιμοποιηθεί με διαφορετικά στοιχεία. Δεν έγινε δεύτερη πίστωση.',AI_WALLET_RESERVED_REFERENCE:'Η αναφορά αυτή προορίζεται για εσωτερική δοκιμαστική παροχή.'};
  return res.status(e instanceof z.ZodError?400:known?(e.status||409):503).json({code:known?code:'AI_WALLET_UNAVAILABLE',error:messages[code]||extra[code]||(known?'Δεν επιτρέπεται η ενέργεια ή τα στοιχεία δεν είναι έγκυρα.':'Το υπόλοιπο AI δεν είναι διαθέσιμο. Δοκίμασε ξανά αργότερα.')});
}
const reference=z.string().trim().min(5).max(160).regex(/^[\p{L}\p{N}_.:/ -]+$/u);
const configureSchema=z.object({version:z.number().int().nonnegative(),enabled:z.boolean(),emailEnabled:z.boolean(),notificationOwnerId:z.string().max(160)}).strict();
const creditSchema=z.object({amountMicros:z.string().regex(/^\d{1,13}$/),receiptReference:reference,receiptConfirmed:z.literal(true)}).strict();
const trialSchema=z.object({amountMicros:z.string().regex(/^\d{1,13}$/),grantReference:reference,reason:z.string().trim().min(5).max(300),trialConfirmed:z.literal(true)}).strict();
export function createAiOwnerWalletRoutes({db=prisma,repository=aiOwnerWalletRepository,authenticate=auth,access=createWalletAccess(db),enabled=()=>process.env.AI_OWNER_WALLET_ENABLED==='true',env=process.env}={}){
  const router=Router();router.use(authenticate);
  const run=(mode,fn)=>async(req,res)=>{try{
    res.set('Cache-Control','no-store');const scope=await access[mode](req);
    if(!enabled()){
      if(req.method==='GET')return res.json({runtimeEnabled:false,enabled:false,companyId:scope.companyId,storeId:scope.storeId||null});
      throw walletError('AI_WALLET_DISABLED',503);
    }
    await fn(req,res,scope);
  }catch(e){walletHttpError(e,res)}};
  router.get('/stores/:storeId',run('owner',async(req,res,scope)=>{
    // Company-wide balance is explicitly labelled; usage remains selected-store.
    const result=await repository.read(scope.companyId,scope.storeId);await access.owner(req);
    res.json({...result,runtimeEnabled:true,balanceScope:'COMPANY',paymentInstructions:process.env.AI_OWNER_WALLET_PAYMENT_INSTRUCTIONS||'Η ανανέωση υπολοίπου AI πληρώνεται στο MyWorkStation. Επικοινώνησε μαζί μας για τα στοιχεία πληρωμής. Η πίστωση γίνεται μετά την επιβεβαίωση της είσπραξης.',meteredFeatures:invoiceWalletFeatures()});
  }));
  const prefix='/platform/companies/:companyId';
  router.get(prefix,run('platform',async(req,res,scope)=>{
    const result=await repository.read(scope.companyId);
    const owners=await db.user.findMany({where:{companyId:scope.companyId,role:'OWNER',mustChangePassword:false},select:{id:true,email:true,fullName:true}});
    await access.platform(req);res.json({...result,owners,runtimeEnabled:true,meteredFeatures:invoiceWalletFeatures(),activationReadiness:ownerWalletReadiness(env,result.availableMicros)});
  }));
  router.put(prefix,run('platform',async(req,res,scope)=>{const input=configureSchema.parse(req.body);await access.platform(req);if(input.enabled)requireOwnerWalletReady(env);res.json(await repository.configure(scope.companyId,input,scope.actorId))}));
  router.post(prefix+'/credits',run('platform',async(req,res,scope)=>{const input=creditSchema.parse(req.body);await access.platform(req);res.json(await repository.credit(scope.companyId,input,scope.actorId))}));
  router.post(prefix+'/trial-grants',run('platform',async(req,res,scope)=>{const input=trialSchema.parse(req.body);await access.platform(req);res.json(await repository.grantTrial(scope.companyId,input,scope.actorId))}));
  router.post(prefix+'/reviews/:entryId',run('platform',async(req,res,scope)=>{
    const input=z.object({amountMicros:z.string().regex(/^\d{1,13}$/),resolutionReference:reference,providerCostConfirmed:z.literal(true)}).strict().parse(req.body);
    await access.platform(req);res.json(await repository.settle(scope.companyId,req.params.entryId,{amountMicros:input.amountMicros,usage:{reviewReference:input.resolutionReference},resolutionReference:input.resolutionReference,actorId:scope.actorId}));
  }));
  return router;
}
export default createAiOwnerWalletRoutes();
