import {createWalletAccess} from './ai-owner-wallet-access.js';
import {prisma} from '../prisma.js';
import {walletActivityFromRequest} from './ai-wallet-activity.js';
import {auth} from '../middleware/auth.js';
import {aiOwnerWalletRepository} from './ai-owner-wallet-runtime.js';
import {createCustomerCostMeter} from './ai-customer-cost-meter.js';
import {walletError} from './ai-owner-wallet-contract.js';
export const customerCostMeter=createCustomerCostMeter({repository:aiOwnerWalletRepository});

// Reuse native authentication, including POS sessions and delegated grants.
// No alternate permission system or financial operation is introduced here.
export function createCostRequestRevalidator({authenticate=auth,db=prisma}={}){return async function revalidateCostRequest(req,authorize){
  const before=req.user,copy=Object.create(req);let accepted=false,status=401;
  const response={status(value){status=value;return this;},json(){return this;}};
  await authenticate(copy,response,error=>{if(error)throw error;accepted=true;});
  const current=copy.user;
  if(!accepted||!current||current.id!==before.id||current.companyId!==before.companyId||current.role!==before.role||current.sessionId!==before.sessionId||current.operatorSessionId!==before.operatorSessionId)throw walletError('AI_WALLET_SESSION_REQUIRED',status);
  if(current.tokenType!=='STORE_OPERATOR'){
    const session=await db.userSession.findUnique({where:{id:current.sessionId||''},include:{user:{select:{id:true,role:true,sessionVersion:true,mustChangePassword:true}}}});
    const expectedRole=current.isSuperAdmin===true&&current.platformRole==='SUPER_ADMIN'?'SUPER_ADMIN':current.role;
    if(!session||session.userId!==current.id||session.user?.id!==current.id||session.user.role!==expectedRole||session.user.sessionVersion!==current.sessionVersion||session.user.mustChangePassword||session.revokedAt||!Number.isFinite(+new Date(session.expiresAt))||+new Date(session.expiresAt)<=Date.now())throw walletError('AI_WALLET_SESSION_REQUIRED',401);
  }
  await authorize(copy);
};}
export const revalidateCostRequest=createCostRequestRevalidator();

// The invoice workspace must provide an explicit store, never "INVOICE" or the
// first company store. POS is restricted to its authenticated store as usual.
export async function customerSearchScope(req,storeId,companyId=req.user.companyId){
  if(companyId!==req.user.companyId)await createWalletAccess(prisma).platform({...req,params:{companyId}});
  if(!storeId||typeof storeId!=='string'||(req.user.tokenType==='STORE_OPERATOR'&&req.user.storeId!==storeId))throw walletError('AI_WALLET_SCOPE_DENIED',403);
  const store=await prisma.store.findFirst({where:{id:storeId,companyId,active:true,company:{active:true}},select:{id:true,companyId:true}});
  if(!store)throw walletError('AI_WALLET_SCOPE_DENIED',403);
  return {companyId:store.companyId,storeId:store.id,activity:walletActivityFromRequest({...req,user:{...req.user,companyId}},{storeId:store.id,purpose:'ONLINE_SEARCH'})};
}
