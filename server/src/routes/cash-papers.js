import {walletActivityFromRequest} from '../services/ai-wallet-activity.js';
import {Router} from 'express';
import {prisma} from '../prisma.js';
import {companyModuleState,effectiveModuleEnabled} from '../middleware/module-access.js';
import {readCashChatEvidence} from '../services/cash-chat-evidence.js';
import {createCashPaperRepository} from '../services/cash-paper-repository.js';
import {createCashPaperReader} from '../services/cash-paper-reader.js';
import {createCashPaperProvider} from '../services/cash-paper-provider.js';
import {paperRequest,paperError} from '../services/cash-paper-contract.js';

export async function authorizeCashPaper(db,user,storeId){
  if(!user?.id||user.tokenType==='STORE_OPERATOR'||user.tokenType==='STORE_CHAT_OPERATOR')throw paperError('CASH_PAPER_ACCESS_DENIED',403);
  const actor=await db.user.findUnique({where:{id:user.id},select:{id:true,fullName:true,role:true,companyId:true,mustChangePassword:true}});
  if(!actor||actor.mustChangePassword||!['SUPER_ADMIN','OWNER'].includes(actor.role))throw paperError('CASH_PAPER_ACCESS_DENIED',403);
  const store=await db.store.findUnique({where:{id:storeId},select:{id:true,companyId:true,active:true,company:{select:{active:true}}}});
  if(!store?.active||!store.company?.active)throw paperError('CASH_PAPER_NOT_FOUND',404);
  if(actor.role!=='SUPER_ADMIN'){
    if(user.companyId!==store.companyId)throw paperError('CASH_PAPER_NOT_FOUND',404);
    if(actor.companyId!==store.companyId){
      const access=await db.$queryRaw`SELECT "ownerId" FROM "OwnerCompanyAccess" WHERE "ownerId"=${actor.id} AND "companyId"=${store.companyId} LIMIT 1`;
      if(!access.length)throw paperError('CASH_PAPER_NOT_FOUND',404);
    }
    const licence=await companyModuleState(store.companyId,{db});
    if(!licence?.licenseAllowed)throw paperError('CASH_PAPER_ACCESS_DENIED',403);
    for(const moduleKey of ['CASH_CONTROL','STORE_CHAT','AI_READER']){
      const rows=await db.$queryRaw`SELECT "active","startsAt","endsAt" FROM "StorePaidModule" WHERE "storeId"=${store.id} AND "moduleKey"=${moduleKey} LIMIT 1`;
      if(!effectiveModuleEnabled(licence.activeModules.includes(moduleKey),rows[0]?{...rows[0],configured:true}:{configured:false}))throw paperError('CASH_PAPER_ACCESS_DENIED',403);
    }
  }
  return {scope:{companyId:store.companyId,storeId:store.id},actor};
}
const errorResponse=(res,error)=>{
  const allowed=new Set(['CASH_PAPER_ACCESS_DENIED','CASH_PAPER_NOT_FOUND','CASH_PAPER_UNSUPPORTED','CASH_PAPER_SOURCE_CHANGED','CASH_PAPER_PROVIDER_UNAVAILABLE','CASH_PAPER_BUSY','STORE_LIFECYCLE_STALE_GENERATION','STORE_LIFECYCLE_MAINTENANCE']);
  const code=allowed.has(error?.code)?error.code:'CASH_PAPER_UNAVAILABLE';
  const messages={CASH_PAPER_ACCESS_DENIED:'Δεν υπάρχει πρόσβαση στην ανάγνωση χειρόγραφων.',CASH_PAPER_NOT_FOUND:'Δεν βρέθηκε το κατάστημα ή το συνημμένο.',CASH_PAPER_UNSUPPORTED:'Το συνημμένο δεν μπορεί να διαβαστεί με ασφάλεια.',CASH_PAPER_SOURCE_CHANGED:'Το συνημμένο άλλαξε. Ανανέωσε τα στοιχεία.',CASH_PAPER_PROVIDER_UNAVAILABLE:'Η ανάγνωση δεν είναι διαθέσιμη αυτή τη στιγμή.',CASH_PAPER_BUSY:'Εκτελούνται ήδη αναγνώσεις. Δοκίμασε ξανά αργότερα.',STORE_LIFECYCLE_STALE_GENERATION:'Η κατάσταση καταστήματος άλλαξε. Ανανέωσε τα στοιχεία.',STORE_LIFECYCLE_MAINTENANCE:'Το κατάστημα βρίσκεται σε συντήρηση.'};
  const status=Number.isInteger(error?.status)&&error.status>=400&&error.status<=503?error.status:503;
  res.status(status).json({error:messages[code]||'Δεν ολοκληρώθηκε η ανάγνωση. Το αίτημα χρειάζεται έλεγχο πριν επαναληφθεί.',code});
};
export function createCashPaperRouter({db=prisma,provider=createCashPaperProvider(),authorize=authorizeCashPaper}={}){
  const router=Router(),repository=createCashPaperRepository(db),reader=createCashPaperReader({repository,provider});
  router.get('/stores/:storeId',async(req,res)=>{try{
    const {scope}=await authorize(db,req.user,req.params.storeId);scope.generation=await repository.generation(scope);
    const discovery=await readCashChatEvidence(db,scope);
    const sources=[];
    for(const source of discovery.sources){const reading=source.checksum?await repository.get(scope,source.checksum):{status:'REQUIRES_REVIEW'};sources.push({...source,reading});}
    await authorize(db,req.user,req.params.storeId);
    if(await repository.generation(scope)!==scope.generation)throw paperError('STORE_LIFECYCLE_STALE_GENERATION');
    res.setHeader('Cache-Control','private, no-store');res.json({...discovery,sources,storeId:scope.storeId,generation:scope.generation});
  }catch(error){errorResponse(res,error);}});
  router.post('/stores/:storeId/read',async(req,res)=>{try{
    const parsed=paperRequest.safeParse(req.body);if(!parsed.success)return res.status(400).json({error:'Μη έγκυρα στοιχεία συνημμένου.',code:'CASH_PAPER_INVALID_REQUEST'});
    const {scope,actor}=await authorize(db,req.user,req.params.storeId);scope.generation=parsed.data.generation;scope.activity=walletActivityFromRequest({...req,user:{...req.user,companyId:scope.companyId}},{storeId:scope.storeId,purpose:'CASH_PAPER_READING'});
    const result=await reader.read(scope,actor,parsed.data);
    await authorize(db,req.user,req.params.storeId);
    if(await repository.generation(scope)!==scope.generation)throw paperError('STORE_LIFECYCLE_STALE_GENERATION');
    res.setHeader('Cache-Control','private, no-store');res.json({...result,storeId:scope.storeId,checksum:parsed.data.checksum,generation:scope.generation});
  }catch(error){errorResponse(res,error);}});
  return router;
}
export default createCashPaperRouter();
