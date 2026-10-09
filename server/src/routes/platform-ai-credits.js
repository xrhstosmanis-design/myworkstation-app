import {Router} from "express";
import {z} from "zod";
import {createCreditMonitor} from "../services/ai-credit-monitor.js";
import {aiCreditRepository} from "../services/ai-credit-repository.js";

const schema=z.object({warningUsd:z.number().finite().positive().max(100000),criticalUsd:z.number().finite().nonnegative(),version:z.number().int().nonnegative(),balanceUsd:z.number().finite().min(-100000).max(1000000).optional(),accountConfirmed:z.boolean().optional()}).strict();
const messages={
  BILLING_NOT_CONFIGURED:"Δεν έχει συνδεθεί η παρακολούθηση κόστους AI. Απαιτείται ρύθμιση του λογαριασμού χρέωσης στον server.",
  BILLING_ACCESS_DENIED:"Η παρακολούθηση κόστους δεν έχει πρόσβαση στον λογαριασμό χρέωσης.",
  CREDIT_SETTINGS_CONFLICT:"Οι ρυθμίσεις άλλαξαν. Ανανέωσε πριν αποθηκεύσεις.",
  INVALID_CREDIT_BASELINE:"Επιβεβαίωσε ότι το υπόλοιπο αφορά τον ίδιο λογαριασμό AI.",
  INVALID_CREDIT_SETTINGS:"Το όριο προειδοποίησης πρέπει να είναι μεγαλύτερο από το κρίσιμο όριο."
};
// Mounted inside the existing authenticated Platform router. Keep an independent role guard
// so future mount changes cannot expose organization billing information to store users.
export function createAiCreditRoutes(monitor=createCreditMonitor({repository:aiCreditRepository})){
  const router=Router();
  router.use((req,res,next)=>{
    if(!(req.user?.isSuperAdmin===true||req.user?.platformRole==="SUPER_ADMIN"))return res.status(403).json({error:"Απαιτείται πρόσβαση Platform Super Admin."});
    res.set("Cache-Control","no-store");next();
  });
  router.get("/",async(_req,res)=>{
    try{res.json(await monitor.status())}catch{res.status(503).json({error:"Δεν είναι διαθέσιμη η παρακολούθηση υπολοίπου AI.",code:"CREDIT_MONITOR_UNAVAILABLE"})}
  });
  router.put("/",async(req,res)=>{
    try{res.json(await monitor.save(schema.parse(req.body||{}),{id:req.user.id,email:req.user.email}))}
    catch(error){
      if(error instanceof z.ZodError)return res.status(400).json({error:"Έλεγξε το υπόλοιπο και τα όρια ειδοποιήσεων.",code:"INVALID_CREDIT_SETTINGS"});
      const code=error.code||"CREDIT_MONITOR_UNAVAILABLE";
      res.status(error.status||503).json({error:messages[code]||"Δεν αποθηκεύτηκε η ρύθμιση. Δεν έγινε καμία αγορά credits.",code:messages[code]?code:"CREDIT_MONITOR_UNAVAILABLE"});
    }
  });
  return router;
}
export default createAiCreditRoutes();
