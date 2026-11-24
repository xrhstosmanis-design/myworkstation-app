import {Router} from "express";
import {prisma} from "../prisma.js";
import {createStaffSupplierValueInvoice} from "../services/staff-supplier-value-invoice.js";
import supplierGlobalReportRoutes from "./supplier-global-reports.js";
import supplierProductCatalogRoutes from "./supplier-product-catalog.js";
import supplierProductTransferRoutes from "./supplier-product-transfer.js";
import supplierBasicExtraRoutes from "./supplier-basic-extra.js";
import supplierControlRoutes from "./supplier-control.js";
import {ensureSupplierControlCompatibility} from "../supplier-control-bootstrap.js";

const router=Router();
router.use(async(req,res,next)=>{
  try{
    await ensureSupplierControlCompatibility();
    next();
  }catch(error){
    next(error);
  }
});
router.use((req,res,next)=>{
  if(req.body&&typeof req.body==="object"&&!Array.isArray(req.body)){
    for(const key of ["email","taxId","legacyCode","erpCode","profession","phone","mobile","fax","sellerName","accountingCode","notes","address","city","chargeAddress","code","postalCode","label","taxOffice"]){
      if(req.body[key]==="")req.body[key]=null;
    }
  }
  next();
});
router.post("/:supplierId/value-only-invoice",async(req,res,next)=>{
  if(req.user?.staffAccess!==true)return next("route");
  try{
    const draft=await createStaffSupplierValueInvoice(prisma,req,req.params.supplierId,req.body);
    return res.status(draft.reused?200:201).json(draft);
  }catch(error){next(error)}
});
router.use((req,res,next)=>{
  if(req.user?.staffAccess===true&&req.staffCompanyGrant?.capability==="supplier-products.transfer"){
    return supplierProductTransferRoutes(req,res,next);
  }
  next();
});
router.use(supplierGlobalReportRoutes);
router.use(supplierProductCatalogRoutes);
router.use(supplierProductTransferRoutes);
router.use(supplierBasicExtraRoutes);
router.use(supplierControlRoutes);
export default router;
