import {postpaidGrantSchema,postpaidPaymentSchema} from '../services/ai-wallet-postpaid.js';
import {invoiceWalletFeatures} from "../services/ai-wallet-invoice-metering.js";
import {customerPricingSchema,customerCharge,DEFAULT_CUSTOMER_PRICING} from '../services/ai-wallet-customer-pricing.js';
import {Router} from 'express';
import {z} from 'zod';
import {prisma} from '../prisma.js';
import {auth} from '../middleware/auth.js';
import {aiOwnerWalletRepository} from '../services/ai-owner-wallet-runtime.js';
import {createWalletAccess} from '../services/ai-owner-wallet-access.js';
import {walletError} from '../services/ai-owner-wallet-contract.js';
import {ownerWalletReadiness,requireOwnerWalletReady,walletServiceConfiguration} from '../services/ai-owner-wallet-readiness.js';
import {resolvedInvoiceWalletCompany} from '../services/ai-invoice-company-scope.js';
import {invoiceWalletReadiness,requireInvoiceWalletReady} from '../services/ai-invoice-wallet-readiness.js';

const messages={AI_WALLET_EXTERNAL_TARIFF_REQUIRED:'Δεν έχει οριστεί επιβεβαιωμένη τιμή για αυτή την εξωτερική υπηρεσία. Δεν ξεκίνησε πληρωμένη αναζήτηση.',AI_WALLET_INVOICE_DISABLED:'Η χρέωση τιμολογίων δεν είναι διαθέσιμη αυτή τη στιγμή.',AI_WALLET_INVOICE_PROVIDER_REQUIRED:'Απαιτείται σύνδεση των υπηρεσιών ανάγνωσης πριν ενεργοποιηθεί η χρέωση τιμολογίων.',AI_WALLET_INVOICE_TARIFF_REQUIRED:'Απαιτείται έγκυρος τιμοκατάλογος τιμολογίων πριν από την ενεργοποίηση.',AI_WALLET_INVOICE_CONFIG_INVALID:'Η ρύθμιση χρέωσης τιμολογίων χρειάζεται έλεγχο. Δεν έγινε νέα χρέωση.',AI_WALLET_INPUT_COUNT_REQUIRED:'Δεν ήταν δυνατός ο ασφαλής υπολογισμός της δέσμευσης AI. Δεν ξεκίνησε νέα ανάγνωση. Έλεγξε τη σύνδεση ή το μέγεθος του τιμολογίου.',AI_WALLET_INSUFFICIENT:'Δεν επαρκεί το διαθέσιμο υπόλοιπο AI. Χρειάζεται ανανέωση. Οι πωλήσεις και το υπόλοιπο πρόγραμμα συνεχίζουν κανονικά.',AI_WALLET_CHANGED:'Το υπόλοιπο ή οι ρυθμίσεις άλλαξαν. Ανανέωσε πριν αποθηκεύσεις.',AI_WALLET_RECEIPT_CONFLICT:'Η αναφορά είσπραξης έχει ήδη χρησιμοποιηθεί. Δεν έγινε δεύτερη πίστωση.',AI_WALLET_USAGE_REVIEW:'Η κατανάλωση της κλήσης AI χρειάζεται έλεγχο. Το δεσμευμένο ποσό διατηρήθηκε.',AI_WALLET_TARIFF_REQUIRED:'Δεν έχει οριστεί έγκυρος τιμοκατάλογος για αυτή τη λειτουργία AI.',AI_WALLET_DISABLED:'Η προπληρωμένη χρέωση AI δεν έχει ενεργοποιηθεί.',AI_WALLET_OWNER_REQUIRED:'Επίλεξε υπάρχοντα Ιδιοκτήτη της εταιρείας για τις ειδοποιήσεις email.'};
export function walletHttpError(e,res){
  const code=e instanceof z.ZodError?'AI_WALLET_INVALID_INPUT':String(e.code||'');
  const known=code.startsWith('AI_WALLET_');
  const extra={AI_WALLET_PROVIDER_REQUIRED:'Η υπάρχουσα σύνδεση AI δεν είναι διαθέσιμη. Η χρέωση δεν ενεργοποιήθηκε.',AI_WALLET_TRIAL_CONFLICT:'Η αναφορά δοκιμαστικής παροχής έχει ήδη χρησιμοποιηθεί με διαφορετικά στοιχεία. Δεν έγινε δεύτερη πίστωση.',AI_WALLET_RESERVED_REFERENCE:'Η αναφορά αυτή προορίζεται για διαφορετικό είδος πίστωσης.',AI_WALLET_POSTPAID_RECIPIENTS_CHANGED:'Οι παραλήπτες άλλαξαν ή δεν υπάρχουν εγκεκριμένοι παραλήπτες. Ανανέωσε τη λίστα.',AI_WALLET_POSTPAID_RECIPIENTS_UNAVAILABLE:'Δεν είναι διαθέσιμοι οι εγκεκριμένοι παραλήπτες αυτού του καταστήματος.',AI_WALLET_POSTPAID_OVERPAYMENT:'Το ποσό υπερβαίνει την ανεξόφλητη οφειλή. Δεν καταχωρίστηκε είσπραξη.',AI_WALLET_POSTPAID_INVALID:'Η οφειλή AI χρειάζεται έλεγχο. Δεν έγινε νέα καταχώριση.',AI_WALLET_POSTPAID_BUSY:'Οι ρυθμίσεις χρησιμοποιούνται. Ανανέωσε πριν καταχωρίσεις.'};
  return res.status(e instanceof z.ZodError?400:known?(e.status||409):503).json({code:known?code:'AI_WALLET_UNAVAILABLE',error:messages[code]||extra[code]||(known?'Δεν επιτρέπεται η ενέργεια ή τα στοιχεία δεν είναι έγκυρα.':'Το υπόλοιπο AI δεν είναι διαθέσιμο. Δοκίμασε ξανά αργότερα.')});
}
const reference=z.string().trim().min(5).max(160).regex(/^[\p{L}\p{N}_.:/ -]+$/u);
const configureSchema=z.object({version:z.number().int().nonnegative(),enabled:z.boolean(),emailEnabled:z.boolean(),notificationOwnerId:z.string().max(160),invoiceEnabled:z.boolean().optional()}).strict();
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
    const invoiceEnabled=await resolvedInvoiceWalletCompany(repository,scope.companyId,env);await access.owner(req);
    res.json({...result,runtimeEnabled:true,balanceScope:'COMPANY',paymentInstructions:process.env.AI_OWNER_WALLET_PAYMENT_INSTRUCTIONS||'Η ανανέωση υπολοίπου AI πληρώνεται στο MyWorkStation. Επικοινώνησε μαζί μας για τα στοιχεία πληρωμής. Η πίστωση γίνεται μετά την επιβεβαίωση της είσπραξης.',meteredFeatures:invoiceWalletFeatures(env,scope.companyId,invoiceEnabled)});
  }));
  const prefix='/platform/companies/:companyId';
  router.put(prefix+'/pricing',run('platform',async(req,res,scope)=>{
    const input=z.object({version:z.number().int().nonnegative(),policy:customerPricingSchema,additionalTariffConfirmed:z.literal(true)}).strict().parse(req.body);
    await access.platform(req);res.json(await repository.configurePricing(scope.companyId,input,scope.actorId));
  }));
  router.get(prefix,run('platform',async(req,res,scope)=>{
    const result=await repository.read(scope.companyId);
    const owners=await db.$queryRaw`SELECT u."id",u."email",u."fullName" FROM "User" u JOIN "Company" c ON c."id"=${scope.companyId} AND c."active"=TRUE WHERE u."role"::text='OWNER' AND u."mustChangePassword"=FALSE AND (u."companyId"=c."id" OR EXISTS (SELECT 1 FROM "OwnerCompanyAccess" a WHERE a."ownerId"=u."id" AND a."companyId"=c."id")) ORDER BY u."fullName",u."id"`;
    const invoiceEnabled=await resolvedInvoiceWalletCompany(repository,scope.companyId,env),readiness=invoiceWalletReadiness(env);
    const activationReadiness=ownerWalletReadiness(env,result.availableMicros);
    if(activationReadiness.maxReservationMicros){
      const p=result.customerPricing||DEFAULT_CUSTOMER_PRICING;
      const policy={additionalMarkupBps:p.additionalMarkupBps,callFeeMicros:p.callFeeMicros,invoiceFeeMicros:p.invoiceFeeMicros};
      activationReadiness.baseMaxReservationMicros=activationReadiness.maxReservationMicros;
      try{
        activationReadiness.maxReservationMicros=customerCharge(activationReadiness.maxReservationMicros,policy).totalMicros;
        activationReadiness.availableEnough=BigInt(result.availableMicros)>=BigInt(activationReadiness.maxReservationMicros);
      }catch(error){
        if(error.code!=='AI_WALLET_PRICING_LIMIT')throw error;
        Object.assign(activationReadiness,{ready:false,code:error.code,maxReservationMicros:null,availableEnough:false});
      }
    }
    await access.platform(req);res.json({...result,owners,runtimeEnabled:true,meteredFeatures:invoiceWalletFeatures(env,scope.companyId,invoiceEnabled),activationReadiness,serviceConfiguration:walletServiceConfiguration(env,scope.companyId,invoiceEnabled),invoiceBilling:{enabled:invoiceEnabled,active:invoiceEnabled&&result.enabled&&readiness.globalEnabled,readiness}});
  }));
  router.put(prefix,run('platform',async(req,res,scope)=>{
    const input=configureSchema.parse(req.body);await access.platform(req);
    const current=await repository.read(scope.companyId),previousInvoice=await resolvedInvoiceWalletCompany(repository,scope.companyId,env);
    // Disabling only invoice charging remains possible during a provider outage;
    // this exception cannot enable Owner billing or change its email settings.
    const invoiceOnlyDisable=input.invoiceEnabled===false&&current.enabled===true&&input.enabled===true&&input.emailEnabled===current.emailEnabled&&input.notificationOwnerId===(current.notificationOwnerId||'');
    if(input.enabled&&!invoiceOnlyDisable)requireOwnerWalletReady(env);
    const enablesInvoices=input.invoiceEnabled===true&&(!previousInvoice||input.enabled);
    const keepsActiveInvoices=input.invoiceEnabled===undefined&&input.enabled&&previousInvoice&&env.AI_OWNER_WALLET_INVOICES_ENABLED==='true';
    if(enablesInvoices||keepsActiveInvoices)requireInvoiceWalletReady(env);
    await access.platform(req);res.json(await repository.configure(scope.companyId,input,scope.actorId));
  }));
  const postpaidSession=req=>({sessionId:req.user?.sessionId,sessionVersion:req.user?.sessionVersion});
  router.get(prefix+'/postpaid-recipients',run('platform',async(req,res,scope)=>{
    const {storeId}=z.object({storeId:z.string().min(1).max(200)}).strict().parse(req.query);
    res.json(await repository.postpaidRecipients(scope.companyId,storeId,scope.actorId,postpaidSession(req)));
  }));
  router.post(prefix+'/postpaid-credits',run('platform',async(req,res,scope)=>{
    const input=postpaidGrantSchema.parse(req.body);await access.platform(req);
    res.json(await repository.grantPostpaid(scope.companyId,input,scope.actorId,postpaidSession(req)));
  }));
  router.post(prefix+'/postpaid-payments',run('platform',async(req,res,scope)=>{
    const input=postpaidPaymentSchema.parse(req.body);await access.platform(req);
    res.json(await repository.payPostpaid(scope.companyId,input,scope.actorId,postpaidSession(req)));
  }));
  router.post(prefix+'/credits',run('platform',async(req,res,scope)=>{const input=creditSchema.parse(req.body);await access.platform(req);res.json(await repository.credit(scope.companyId,input,scope.actorId))}));
  router.post(prefix+'/trial-grants',run('platform',async(req,res,scope)=>{const input=trialSchema.parse(req.body);await access.platform(req);res.json(await repository.grantTrial(scope.companyId,input,scope.actorId))}));
  router.post(prefix+'/reviews/:entryId',run('platform',async(req,res,scope)=>{
    const input=z.object({amountMicros:z.string().regex(/^\d{1,13}$/),resolutionReference:reference,providerCostConfirmed:z.literal(true)}).strict().parse(req.body);
    await access.platform(req);res.json(await repository.settle(scope.companyId,req.params.entryId,{amountMicros:input.amountMicros,usage:{reviewReference:input.resolutionReference},resolutionReference:input.resolutionReference,actorId:scope.actorId}));
  }));
  return router;
}
export default createAiOwnerWalletRoutes();




