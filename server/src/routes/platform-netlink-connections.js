import {Router} from "express";
import {z} from "zod";
import {createNetlinkConnectionStore,connectionScope} from "../integrations/netlink/store-connection.js";
import {NetlinkClient} from "../integrations/netlink/client.js";

const credentialsSchema=z.object({username:z.string().trim().min(1).max(300),password:z.string().min(1).max(2000),stationId:z.string().trim().min(1).max(160),enabled:z.boolean().default(false)}).strict();

// Mounted behind the existing Platform auth + Super Admin gate.
export function createPlatformNetlinkConnectionsRouter(db,{provider=config=>new NetlinkClient(config)}={}){
  const router=Router(),connections=createNetlinkConnectionStore(db);
  router.use((req,res,next)=>{
    res.set("Cache-Control","no-store");
    if(req.user?.isSuperAdmin!==true&&req.user?.platformRole!=="SUPER_ADMIN")return res.status(403).json({error:"Απαιτείται πρόσβαση Platform Super Admin."});
    next();
  });
  const path="/companies/:companyId/stores/:storeId/netlink-connection";
  async function context(req){
    const tenant=connectionScope(req.params);
    const store=await db.store.findFirst({where:{id:tenant.storeId,companyId:tenant.companyId,active:true},select:{id:true,name:true,companyId:true}});
    if(!store)throw Object.assign(new Error("Δεν βρέθηκε ενεργό κατάστημα στον συγκεκριμένο πελάτη."),{status:404});
    return tenant;
  }
  router.get(path,async(req,res,next)=>{try{res.json({connection:await connections.status(await context(req))})}catch(error){next(error)}});
  router.put(path,async(req,res,next)=>{try{
    const tenant=await context(req),body=credentialsSchema.parse(req.body||{});
    res.json({connection:await connections.save(tenant,body,req.user)});
  }catch(error){next(error)}});
  router.patch(`${path}/status`,async(req,res,next)=>{try{
    const tenant=await context(req),body=z.object({enabled:z.boolean()}).strict().parse(req.body||{});
    res.json({connection:await connections.setEnabled(tenant,body.enabled,req.user)});
  }catch(error){next(error)}});
  router.post(`${path}/check`,async(req,res,next)=>{try{
    const tenant=await context(req),config=await connections.credentials(tenant,{allowDisabled:true});
    // Only the documented read-only catalogue. Never prepare/execute or invent a report URL.
    try{await provider(config).menu()}catch{
      return res.status(502).json({error:"Ο έλεγχος πρόσβασης Netlink απέτυχε. Έλεγξε τα στοιχεία καταστήματος και τις ρυθμίσεις παρόχου.",code:"NETLINK_CONNECTION_CHECK_FAILED"});
    }
    res.json({ok:true,storeId:tenant.storeId,stationId:config.stationId,checkedAt:new Date().toISOString(),check:"AUTH_AND_CATALOGUE",storeIdentityVerified:false,message:"Η πρόσβαση στον κατάλογο Netlink επιβεβαιώθηκε. Η ταυτοποίηση καταστήματος εκκρεμεί με αναφορά της Netlink. Δεν εκδόθηκε κάρτα."});
  }catch(error){next(error)}});
  return router;
}
