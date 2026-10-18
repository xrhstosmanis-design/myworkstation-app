import {Router} from "express";
import {z} from "zod";
import {getAutomaticReportSettings,saveAutomaticReportSettings,previewSavedAutomaticCashReport} from "../services/automatic-report-settings.js";

// Mounted after the existing platform auth + Super Admin guard. Services also
// recheck the actual database role and selected active store on every request.
export function createAutomaticReportSettingsRouter(db){
  const router=Router({mergeParams:true});
  const scope=req=>({actorId:req.user?.id,companyId:req.params.companyId,storeId:req.params.storeId});
  const handle=fn=>async(req,res,next)=>{
    res.set("Cache-Control","no-store");
    try{res.json(await fn(req))}catch(error){
      if(error?.name==="ZodError")return res.status(400).json({error:error.issues?.[0]?.message||"Έλεγξε τις ρυθμίσεις αναφοράς."});
      if(error?.status)return res.status(error.status).json({error:error.message,code:error.code});
      next(error);
    }
  };
  router.get("/",handle(req=>getAutomaticReportSettings(db,scope(req))));
  router.put("/",handle(req=>saveAutomaticReportSettings(db,scope(req),req.body)));
  router.post("/preview",handle(req=>{
    const body=z.object({day:z.string().regex(/^\d{4}-\d{2}-\d{2}$/),expectedVersion:z.number().int().min(0),frequency:z.enum(["DAILY","WEEKLY","MONTHLY"]).optional()}).strict().parse(req.body);
    return previewSavedAutomaticCashReport(db,scope(req),body);
  }));
  return router;
}
