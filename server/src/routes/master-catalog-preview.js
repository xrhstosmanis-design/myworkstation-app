import {Router} from "express";
import {auth} from "../middleware/auth.js";
import platformBulkCatalogRoutes from "./platform-bulk-catalog.js";

const router=Router();
router.use(auth);
router.use((req,res,next)=>{
  const allowed=req.user?.isSuperAdmin===true||req.user?.platformRole==="SUPER_ADMIN";
  if(!allowed)return res.status(403).json({error:"Απαιτείται πρόσβαση Platform Super Admin."});
  next();
});

// Keep this router only for bulk catalog operations.
// The /preview endpoint is intentionally handled by master-catalog.js so there
// is a single source of truth for workbook/sheet/header aliases.
router.use("/bulk",platformBulkCatalogRoutes);

export default router;
