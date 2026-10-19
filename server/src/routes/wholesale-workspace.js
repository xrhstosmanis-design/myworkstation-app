import {Router} from 'express';
import {Prisma} from '@prisma/client';
import {z} from 'zod';
import {prisma} from '../prisma.js';
import {authenticateWholesaleSellerManager} from '../lib/wholesale-seller-auth.js';
import {assertWholesaleEntitlement} from '../lib/wholesale-entitlement.js';
import {wholesaleError} from '../lib/wholesale-principal.js';

const query=z.union([
  z.object({scope:z.literal('company')}).strict(),
  z.object({storeId:z.string().trim().min(1).max(200)}).strict()
]);

export function createWholesaleWorkspaceRouter({db=prisma}={}){
  const router=Router();
  router.get('/',async(req,res,next)=>{try{
    res.set('Cache-Control','no-store');res.vary('Authorization');
    if(req.user?.supportContext)throw wholesaleError(403,'WHOLESALE_WORKSPACE_SUPPORT_DENIED','Απαιτείται προσωπική σύνδεση χωρίς πρόσβαση υποστήριξης.');
    if(req.body!=null&&(typeof req.body!=='object'||Array.isArray(req.body)||Object.keys(req.body).length))throw wholesaleError(400,'WHOLESALE_WORKSPACE_INVALID_INPUT','Η αίτηση προβολής δεν δέχεται σώμα δεδομένων.');
    const scope=query.parse(req.query),user=req.user;
    const workspace=await db.$transaction(async tx=>{
      await authenticateWholesaleSellerManager(tx,user,{lock:true});
      const identity=await tx.$queryRaw`SELECT u."id",u."fullName",co."id" AS "companyId",co."name" AS "companyName" FROM "User" u JOIN "Company" co ON co."id"=${user.companyId} WHERE u."id"=${user.id} FOR SHARE`;
      if(!identity[0])throw wholesaleError(401,'WHOLESALE_WORKSPACE_AUTH_REQUIRED','Απαιτείται ενεργή προσωπική σύνδεση.');
      const selected=scope.storeId||'',storeFilter=selected?Prisma.sql`AND "id"=${selected}`:Prisma.empty;
      const rows=await tx.$queryRaw(Prisma.sql`SELECT "id","name" FROM "Store" WHERE "companyId"=${user.companyId} AND "active"=true ${storeFilter} ORDER BY "name","id" FOR SHARE`);
      if(selected&&!rows.length)throw wholesaleError(404,'WHOLESALE_WORKSPACE_STORE_NOT_FOUND','Το επιλεγμένο κατάστημα δεν βρέθηκε.');
      const access=await assertWholesaleEntitlement(tx,user.companyId,{lock:true});
      // Store reads can wait. Recheck the current session and database wall
      // clock after every read/lock before disclosing private workspace data.
      await authenticateWholesaleSellerManager(tx,user,{lock:true});
      return {
        user:{id:identity[0].id,fullName:identity[0].fullName,role:user.role},
        company:{id:identity[0].companyId,name:identity[0].companyName},
        access:{moduleKey:access.moduleKey,companyId:access.companyId,enabled:access.enabled,expiresAt:access.expiresAt},
        stores:rows.map(row=>({id:row.id,name:row.name})),storeId:selected
      };
    },{maxWait:5000,timeout:15000});
    res.json(workspace);
  }catch(error){
    if(error.name==='ZodError')return res.status(400).json({error:'Επίλεξε εταιρική προβολή ή έγκυρο κατάστημα.',code:'WHOLESALE_WORKSPACE_INVALID_INPUT'});
    if(error.status>=400&&error.status<500)return res.status(error.status).json({error:error.message,code:error.code});
    next(error);
  }});
  return router;
}

export default createWholesaleWorkspaceRouter();
