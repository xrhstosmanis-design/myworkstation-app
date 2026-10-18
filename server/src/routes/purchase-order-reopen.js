import {Router} from "express";
import {prisma} from "../prisma.js";
import {previewPurchaseOrderReopen,reopenPurchaseOrder} from "../services/purchase-order-reopen.js";
const router=Router();
router.get("/:orderId/reopen-preview",async(req,res,next)=>{try{res.json(await previewPurchaseOrderReopen(prisma,req.user,req.params.orderId,String(req.query.storeId||"")))}catch(error){next(error)}});
router.post("/:orderId/reopen",async(req,res,next)=>{try{res.json(await reopenPurchaseOrder(prisma,req.user,req.params.orderId,req.body))}catch(error){next(error)}});
export default router;
