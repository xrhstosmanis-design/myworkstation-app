import {Router} from 'express';
import {z} from 'zod';
import {prisma} from '../prisma.js';
import {getWholesaleEntitlement} from '../lib/wholesale-entitlement.js';
export function createWholesaleCapabilitiesRouter({db=prisma}={}){
  const router=Router();
  router.get('/',async(req,res,next)=>{try{
    res.set('Cache-Control','no-store');res.vary('Authorization');
    if(req.user?.tokenType!=='BACKOFFICE_USER'||typeof req.user?.id!=='string'||!req.user.id||typeof req.user?.sessionId!=='string'||!req.user.sessionId)return res.status(401).json({error:'Απαιτείται προσωπική σύνδεση BackOffice.',code:'WHOLESALE_AUTH_REQUIRED'});
    z.object({}).strict().parse(req.query);
    res.json(await getWholesaleEntitlement(db,req.user.companyId));
  }catch(failure){
    if(failure.name==='ZodError')return res.status(400).json({error:'Μη έγκυρη αίτηση δυνατοτήτων.',code:'WHOLESALE_INVALID_INPUT'});
    if(failure.status===401)return res.status(401).json({error:failure.message,code:failure.code});next(failure);
  }});return router;
}
export default createWholesaleCapabilitiesRouter();
