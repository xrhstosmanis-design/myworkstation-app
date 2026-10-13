import {prisma} from "../prisma.js";
import {ensureInvoiceCommonDraftSchema,invoiceAlias} from "../lib/invoice-common-draft.js";

export function createInvoiceAliasGuard(db=prisma){
 return async(req,res,next)=>{try{
  const match=String(req.path||"").match(/^\/([^/]+)(?:\/(.*))?$/);
  if(!match||["report","products"].includes(match[1]))return next();
  await ensureInvoiceCommonDraftSchema(db);
  const alias=await invoiceAlias(db,req.user.companyId,{orderId:decodeURIComponent(match[1])});
  if(!alias)return next();
  // The preceding POS access middleware still validates the original alias store.
  if(req.user?.tokenType==="STORE_OPERATOR"&&req.user.storeId!==alias.storeId)return res.status(403).json({error:"Το πρόχειρο δεν ανήκει στο κατάστημά σου."});
  return res.status(409).json({error:"Αυτό το δεύτερο πρόχειρο έχει ενοποιηθεί με την κοινή αγορά POS/myDATA. Άνοιξε την κοινή παραγγελία.",code:"INVOICE_DRAFT_MERGED",canonicalOrderId:alias.canonicalOrderId,canonicalDocumentId:alias.canonicalDocumentId,storeId:alias.storeId});
 }catch(e){next(e)}};
}
export const invoiceAliasGuard=createInvoiceAliasGuard();
