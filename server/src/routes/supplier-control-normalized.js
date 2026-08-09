import {Router} from "express";
import supplierControlRoutes from "./supplier-control.js";
const router=Router();
router.use((req,res,next)=>{
  if(req.body&&typeof req.body==="object"&&!Array.isArray(req.body)){
    for(const key of ["email","taxId","legacyCode","erpCode","profession","phone","mobile","fax","sellerName","accountingCode","notes","address","city","chargeAddress","code","postalCode","label"]){
      if(req.body[key]==="")req.body[key]=null;
    }
  }
  next();
});
router.use(supplierControlRoutes);
export default router;
