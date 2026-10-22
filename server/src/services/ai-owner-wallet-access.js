import {walletError} from './ai-owner-wallet-contract.js';

export function createWalletAccess(db){
  async function actor(req){
    const u=req.user;
    if(!u?.id||!u.sessionId)throw walletError('AI_WALLET_SESSION_REQUIRED',401);
    const session=await db.userSession.findUnique({where:{id:u.sessionId},include:{user:{select:{id:true,role:true,companyId:true,sessionVersion:true,mustChangePassword:true}}}});
    if(!session||session.userId!==u.id||session.revokedAt||new Date(session.expiresAt)<=new Date()||session.user?.sessionVersion!==u.sessionVersion||session.user?.mustChangePassword)throw walletError('AI_WALLET_SESSION_REQUIRED',401);
    return session.user;
  }
  async function platform(req){
    const user=await actor(req);
    if(user.role!=='SUPER_ADMIN'||!(req.user.isSuperAdmin===true||req.user.platformRole==='SUPER_ADMIN'))throw walletError('AI_WALLET_ROLE_DENIED',403);
    const companyId=req.params.companyId;
    if(!companyId||!(await db.company.findFirst({where:{id:companyId,active:true},select:{id:true}})))throw walletError('AI_WALLET_SCOPE_DENIED',404);
    return {companyId,actorId:user.id};
  }
  async function owner(req){
    const user=await actor(req),companyId=req.user.companyId,storeId=req.params.storeId;
    if(req.user.tokenType!=='BACKOFFICE_USER'||req.user.role!=='OWNER'||user.role!=='OWNER'||req.user.isSuperAdmin||req.user.platformRole==='SUPER_ADMIN')throw walletError('AI_WALLET_ROLE_DENIED',403);
    if(user.companyId!==companyId){
      if(req.user.ownerCompanyId!==companyId)throw walletError('AI_WALLET_SCOPE_DENIED',403);
      if(!(await db.$queryRaw`SELECT 1 FROM "OwnerCompanyAccess" WHERE "ownerId"=${user.id} AND "companyId"=${companyId} LIMIT 1`).length)throw walletError('AI_WALLET_SCOPE_DENIED',403);
    }
    if(!storeId||!companyId||!(await db.$queryRaw`SELECT s."id" FROM "Store" s JOIN "Company" c ON c."id"=s."companyId" WHERE s."id"=${storeId} AND s."companyId"=${companyId} AND s."active"=TRUE AND c."active"=TRUE`).length)throw walletError('AI_WALLET_SCOPE_DENIED',404);
    return {companyId,storeId,actorId:user.id};
  }
  return {platform,owner};
}
