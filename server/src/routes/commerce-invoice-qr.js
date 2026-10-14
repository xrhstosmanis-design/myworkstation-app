import {Router} from "express";
import {prisma} from "../prisma.js";
import {requireStoreModule} from "../middleware/module-access.js";
import {assertCustomerDemoOutboundAllowed} from "../customer-demo-runtime.js";
import {downloadInvoiceQr} from "../lib/invoice-qr-download.js";
import {createPosInboxHandler} from "./commerce-pos-inbox.js";

export function createInvoiceQrHandler({database=prisma,download=downloadInvoiceQr,allowOutbound=assertCustomerDemoOutboundAllowed}={}){
  return async(req,res,next)=>{try{
    const storeId=String(req.body?.storeId||"");
    const user=req.user||{},employee=user.tokenType==="STORE_OPERATOR"||user.role==="EMPLOYEE";
    if(employee&&(!user.permissions?.includes("SUPPLIER_PAYMENT")||String(user.storeId||"")!==storeId))return res.status(403).json({error:"Δεν έχεις πρόσβαση στην αναγνώριση τιμολογίου αυτού του καταστήματος."});
    if(!employee&&!["SUPER_ADMIN","OWNER","ADMIN","MANAGER","BACKOFFICE_USER"].includes(user.role))return res.status(403).json({error:"Δεν έχεις δικαίωμα αναγνώρισης τιμολογίου."});
    const store=await database.store.findFirst({where:{id:storeId,companyId:user.companyId,active:true},select:{id:true,companyId:true,company:{select:{taxId:true}}}});
    if(!store)return res.status(404).json({error:"Δεν βρέθηκε το επιλεγμένο κατάστημα."});
    allowOutbound(store);
    res.set("Cache-Control","no-store");
    res.json(await download(req.body?.url,store.company.taxId));
  }catch(error){next(error)}};
}
const router=Router();
router.post("/documents/qr-read",requireStoreModule("DOCUMENTS"),createInvoiceQrHandler());
router.post("/documents/pos-inbox",requireStoreModule("DOCUMENTS"),createPosInboxHandler());
export default router;
