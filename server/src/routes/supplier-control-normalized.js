import {Router} from "express";
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
router.use(supplierGlobalReportRoutes);
router.use(supplierProductCatalogRoutes);
router.use(supplierProductTransferRoutes);
router.use(supplierBasicExtraRoutes);
router.use(supplierControlRoutes);
export default router;
