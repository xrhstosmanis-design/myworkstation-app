export function requireOwnerProductAccess(req,res,next){
  const role=String(req.user?.role||"").toUpperCase();
  const platformRole=String(req.user?.platformRole||"").toUpperCase();
  const allowed=req.user?.isSuperAdmin===true||role==="SUPER_ADMIN"||role==="OWNER"||platformRole==="SUPER_ADMIN";
  if(!allowed)return res.status(403).json({error:"Η διαχείριση προϊόντων, τιμών, προσφορών και απογραφής επιτρέπεται μόνο σε OWNER ή SUPER_ADMIN."});

  if(req.method==="POST"&&req.path==="/activate"){
    const price=Number(req.body?.basePrice);
    if(!Number.isFinite(price)||price<=0)return res.status(400).json({error:"Πριν ενεργοποιηθεί το προϊόν πρέπει να οριστεί έγκυρη λιανική τιμή μεγαλύτερη από 0 €."});
  }
  if(req.method==="POST"&&req.path==="/promotions"&&req.body?.promotionType==="FIXED_PRICE"){
    const price=Number(req.body?.fixedPrice);
    if(!Number.isFinite(price)||price<=0)return res.status(400).json({error:"Η τελική τιμή προσφοράς πρέπει να είναι μεγαλύτερη από 0 €."});
  }
  next();
}
