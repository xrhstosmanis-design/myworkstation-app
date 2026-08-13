import {Router} from "express";
import invoiceDraftApprovalRoutes from "./commerce-invoice-draft-approval.js";
import legacyCommerceRoutes from "./commerce-v1-legacy.js";

const router=Router();
router.use(invoiceDraftApprovalRoutes);
router.use(legacyCommerceRoutes);
export default router;
