import {Router} from "express";
import {prisma} from "../prisma.js";
import {requireStoreModule} from "../middleware/module-access.js";
import {assertCustomerDemoOutboundAllowed} from "../customer-demo-runtime.js";
import {downloadInvoiceQr,invoiceQrSource} from "../lib/invoice-qr-download.js";
import {canonicalAadeInvoiceQr,readStoredMyDataQr} from "../lib/invoice-qr-mydata.js";
import {learnVerifiedInvoiceQrSupplier,learnedInvoiceQrSupplierName} from "../lib/invoice-qr-supplier-learning.js";
import {createPosInboxHandler} from "./commerce-pos-inbox.js";

// Identifying a provider QR never records a payment. A learned format/name
// belongs to the company, while the actual invoice is always store scoped.
export function createInvoiceQrHandler({
  database=prisma,download=downloadInvoiceQr,allowOutbound=assertCustomerDemoOutboundAllowed,
  readStored=readStoredMyDataQr,learn=learnVerifiedInvoiceQrSupplier,
  lookupLearned=learnedInvoiceQrSupplierName
}={}){
  return async(req,res,next)=>{try{
    const storeId=String(req.body?.storeId||"");
    const user=req.user||{},employee=user.tokenType==="STORE_OPERATOR"||user.role==="EMPLOYEE";
    if(employee&&(!user.permissions?.includes("SUPPLIER_PAYMENT")||String(user.storeId||"")!==storeId))return res.status(403).json({error:"Δεν έχεις πρόσβαση στην αναγνώριση τιμολογίου αυτού του καταστήματος."});
    if(!employee&&!["SUPER_ADMIN","OWNER","ADMIN","MANAGER","BACKOFFICE_USER"].includes(user.role))return res.status(403).json({error:"Δεν έχεις δικαίωμα αναγνώρισης τιμολογίου."});
    const store=await database.store.findFirst({where:{id:storeId,companyId:user.companyId,active:true},select:{id:true,companyId:true,company:{select:{taxId:true}}}});
    if(!store)return res.status(404).json({error:"Δεν βρέθηκε το επιλεγμένο κατάστημα."});
    allowOutbound(store);
    const qr=String(req.body?.url||"");
    const recipientVat=String(store.company.taxId||"").replace(/^EL/i,"").trim();
    const isAadeQr=Boolean(canonicalAadeInvoiceQr(qr));
    const format=isAadeQr?"aade-mydata":invoiceQrSource(qr).format;
    let result=isAadeQr
      ?await readStored(database,{companyId:user.companyId,storeId,recipientVat,value:qr})
      :await download(qr,store.company.taxId);
    // Only the verified PDF+myDATA header can teach a supplier profile. QR
    // issuer VAT and MARK are never guessed from a URL or a previous invoice.
    const header=result?.header;
    if(header&&/^\d{9}$/.test(String(header.supplierTaxId||""))&&/^\d+$/.test(String(header.mark||""))){
      const identity={companyId:user.companyId,supplierVat:header.supplierTaxId,format};
      if(!header.supplierName){
        try{
          const name=await lookupLearned(database,identity);
          if(name)result={...result,header:{...header,supplierName:name}};
        }catch(error){
          console.warn("Verified invoice QR supplier profile lookup failed",{code:error?.code||"UNKNOWN"});
        }
      }
      try{
        await learn(database,{...identity,supplierName:result.header.supplierName,mark:header.mark});
      }catch(error){
        // Do not break the already working POS invoice/payment flow because
        // the auxiliary learning table is temporarily unavailable.
        console.warn("Verified invoice QR supplier format learning failed",{code:error?.code||"UNKNOWN"});
      }
    }
    res.set("Cache-Control","no-store");
    res.json(result);
  }catch(error){next(error)}};
}
const router=Router();
router.post("/documents/qr-read",requireStoreModule("DOCUMENTS"),createInvoiceQrHandler());
router.post("/documents/pos-inbox",requireStoreModule("DOCUMENTS"),createPosInboxHandler());
export default router;
