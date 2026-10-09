import {containsCustomerDemoIdentifier,isCustomerDemoIdentifier} from "../customer-demo-runtime.js";

// Explicit identifiers are checked before public/device/login handlers. Opaque
// credentials are checked separately, after their persisted tenant is resolved.
export function blockCustomerDemoRequest(req,res,next){
  let path;
  try{path=decodeURIComponent(String(req.originalUrl||req.url||"").split("?")[0]);}
  catch{return res.status(400).json({error:"Μη έγκυρη διεύθυνση."});}
  const method=String(req.method||"").toUpperCase();
  const preparation=(path==="/api/platform/customer-demos"&&["GET","HEAD","POST"].includes(method))||
    (method==="POST"&&/^\/api\/platform\/customer-demos\/[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\/revoke$/.test(path));
  if(preparation)return next(); // Own strict schema + verified SA auth still apply.
  const reserved=path.split("/").some(isCustomerDemoIdentifier)||containsCustomerDemoIdentifier(req.body)||containsCustomerDemoIdentifier(req.query);
  if(!reserved)return next();
  const platformMutation=path.startsWith("/api/platform/")&&!["GET","HEAD","OPTIONS"].includes(method);
  return res.status(platformMutation?409:403).json({error:"Το demo βρίσκεται σε προετοιμασία. Η λειτουργική πρόσβαση δεν είναι ακόμη διαθέσιμη.",code:platformMutation?"DEMO_PREPARATION_LOCKED":"CUSTOMER_DEMO_RUNTIME_LOCKED"});
}
