import jwt from "jsonwebtoken";
import { prisma } from "../prisma.js";

function storeRuntimePermissions(profile){
  const p=profile&&typeof profile==="object"?profile:{};
  const permissions=[];
  const rights=p.permissions&&typeof p.permissions==="object"?p.permissions:{};
  if(p.posAccess!==false)permissions.push("ATTENDANCE","CASH_OVERVIEW");
  if(rights.cash)permissions.push("POS_CASH");
  if(rights.cards)permissions.push("POS_CARDS");
  if(rights.centralCashPos)permissions.push("CASH_CONTROL");
  if(rights.initialCash)permissions.push("INITIAL_CASH");
  if(rights.shiftTransactionsPos)permissions.push("STORE_LEDGER");
  if(rights.allShiftTransactionsPos){permissions.push("STORE_LEDGER","STORE_LEDGER_REVIEW","TRANSACTION_REVERSAL")}
  if(rights.supplierPayment)permissions.push("SUPPLIER_PAYMENT");
  if(rights.thirdPartyPayment)permissions.push("THIRD_PARTY_PAYMENT");
  if(rights.transferAmount)permissions.push("TRANSFER_AMOUNT");
  if(rights.sameShiftPayments)permissions.push("SAME_SHIFT_PAYMENTS");
  if(rights.returnItems)permissions.push("RETURN_ITEMS");
  if(rights.changeRetail)permissions.push("CHANGE_RETAIL");
  if(rights.addBarcode)permissions.push("ADD_BARCODE");
  if(rights.editDescription)permissions.push("EDIT_DESCRIPTION");
  if(rights.customersPos)permissions.push("CUSTOMERS_POS");
  if(rights.onlineBarcode)permissions.push("ONLINE_PRODUCT_SEARCH");
  if((rights.supplierPayment||rights.thirdPartyPayment||rights.transferAmount)&&!permissions.includes("STORE_LEDGER"))permissions.push("STORE_LEDGER");
  return [...new Set(permissions)];
}

function enforceStorePaymentPermissions(req,res,permissions){
  if(req.method!=="POST"||!String(req.originalUrl||"").startsWith("/api/transactions/stores/"))return true;
  const type=String(req.body?.type||"");
  const payment=type==="SUPPLIER_PAYMENT"||type==="OTHER_EXPENSE";
  if(type==="SUPPLIER_PAYMENT"&&!permissions.includes("SUPPLIER_PAYMENT")){
    res.status(403).json({error:"Δεν έχεις δικαίωμα Πληρωμής Προμηθευτή από το BackOffice."});return false;
  }
  if(type==="OTHER_EXPENSE"&&!permissions.includes("THIRD_PARTY_PAYMENT")){
    res.status(403).json({error:"Δεν έχεις δικαίωμα Πληρωμής προς Τρίτους από το BackOffice."});return false;
  }
  if(type==="TRANSFER_AMOUNT"&&!permissions.includes("TRANSFER_AMOUNT")){
    res.status(403).json({error:"Δεν έχεις δικαίωμα Μεταφοράς ποσού από το BackOffice."});return false;
  }
  const legacyShiftDeduction=req.body?.evidenceMode==null&&(req.body?.subtractFromShift===true||req.body?.subtractFromShift==="true");
  const sameShift=payment&&(req.body?.paymentSource==="CASH_SHIFT"||legacyShiftDeduction);
  if(sameShift&&!permissions.includes("SAME_SHIFT_PAYMENTS")){
    res.status(403).json({error:"Δεν έχεις δικαίωμα να αφαιρούνται πληρωμές από την ίδια βάρδια."});return false;
  }
  return true;
}

function enforceStorePosPermissions(req,res,permissions){
  const path=String(req.originalUrl||"").split("?")[0];
  if(!path.startsWith("/api/store-pos/stores/"))return true;
  const deny=error=>{res.status(403).json({error});return false};
  const isCheckout=req.method==="POST"&&/\/checkout$/.test(path);
  if(isCheckout){
    const method=String(req.body?.paymentMethod||"").toUpperCase();
    const methods=method==="MIXED"?(Array.isArray(req.body?.payments)?req.body.payments.map(row=>String(row?.method||"").toUpperCase()):[]):[method];
    if(methods.includes("CASH")&&!permissions.includes("POS_CASH"))return deny("Δεν έχεις δικαίωμα «Μετρητά» από το BackOffice.");
    if(methods.some(x=>x==="CARD"||x==="IRIS")&&!permissions.includes("POS_CARDS"))return deny("Δεν έχεις δικαίωμα «Κάρτες» από το BackOffice.");
    const manualPrice=(Array.isArray(req.body?.items)?req.body.items:[]).some(item=>item?.unitPriceOverride!==undefined&&item?.unitPriceOverride!==null);
    if(manualPrice&&!permissions.includes("CHANGE_RETAIL"))return deny("Δεν έχεις δικαίωμα «Αλλαγή τιμής λιανικής» από το BackOffice.");
  }
  if(req.method==="GET"&&/\/sales\/recent$/.test(path)&&!permissions.includes("RETURN_ITEMS")&&!permissions.includes("TRANSACTION_REVERSAL"))return deny("Δεν έχεις δικαίωμα προβολής πωλήσεων για επιστροφή/διόρθωση από το BackOffice.");
  if(req.method==="POST"&&/\/sales\/[^/]+\/delayed$/.test(path)&&!permissions.includes("TRANSACTION_REVERSAL"))return deny("Η ετεροχρονισμένη διόρθωση απαιτεί «Όλες οι συναλλαγές βάρδιας (PoS)» από το BackOffice.");
  if(req.method==="POST"&&(/\/sales\/[^/]+\/(reverse|return-items)$/.test(path)||/\/exchange$/.test(path))&&!permissions.includes("RETURN_ITEMS"))return deny("Δεν έχεις δικαίωμα «Επιστροφή ειδών» από το BackOffice.");
  if(req.method==="GET"&&/\/customers(?:\/|$)/.test(path)&&!permissions.includes("CUSTOMERS_POS"))return deny("Δεν έχεις δικαίωμα «Πελάτες (PoS)» από το BackOffice.");
  return true;
}

function exposeStorePosRuntimeAccess(req,res,rights){
  const path=String(req.originalUrl||"").split("?")[0];
  if(req.method!=="GET"||!/^\/api\/store-pos\/stores\/[^/]+$/.test(path))return;
  const send=res.json.bind(res);res.json=body=>send({...body,access:{...(body?.access||{}),...rights}});
}

export async function auth(req,res,next){
  const token=req.headers.authorization?.replace("Bearer ","");
  if(!token)return res.status(401).json({error:"Απαιτείται σύνδεση."});
  try{
    const payload=jwt.verify(token,process.env.JWT_SECRET);
    if(payload.tokenType==="STORE_OPERATOR"){
      if(!payload.operatorSessionId)return res.status(401).json({error:"Απαιτείται νέα είσοδος στο Store Mode.",code:"STORE_OPERATOR_SESSION_REQUIRED"});
      const rows=await prisma.$queryRaw`
        SELECT c."id",c."displayName",c."employeeId",c."companyId",c."storeId",c."role",c."active",
               e."active" AS "employeeActive",s."active" AS "storeActive",co."active" AS "companyActive",
               os."expiresAt" AS "operatorSessionExpiresAt",os."revokedAt" AS "operatorSessionRevokedAt",
               COALESCE(p."posAccess",TRUE) AS "posAccess",COALESCE(p."permissions",'{}'::jsonb) AS "profilePermissions"
        FROM "StoreOperatorCredential" c
        JOIN "Employee" e ON e."id"=c."employeeId"
        JOIN "Store" s ON s."id"=c."storeId"
        JOIN "Company" co ON co."id"=c."companyId"
        JOIN "StoreOperatorSession" os ON os."id"=${payload.operatorSessionId} AND os."operatorId"=c."id"
        LEFT JOIN "StoreOperatorProfile" p ON p."companyId"=c."companyId" AND p."storeId"=c."storeId" AND p."employeeId"=c."employeeId"
        WHERE c."id"=${payload.operatorId||payload.id} AND c."employeeId"=${payload.employeeId} AND c."storeId"=${payload.storeId} AND c."companyId"=${payload.companyId}
        LIMIT 1
      `;
      const operator=rows[0],operatorSessionExpired=!operator?.operatorSessionExpiresAt||new Date(operator.operatorSessionExpiresAt).getTime()<=Date.now();
      if(!operator||operatorSessionExpired||operator.operatorSessionRevokedAt||!operator.active||!operator.employeeActive||!operator.storeActive||!operator.companyActive)return res.status(401).json({error:"Η πρόσβαση Store Mode δεν είναι πλέον ενεργή. Συνδεθείτε ξανά.",code:"STORE_OPERATOR_SESSION_REVOKED"});
      if(operator.posAccess===false)return res.status(403).json({error:"Η πρόσβαση POS του χειριστή έχει απενεργοποιηθεί από το BackOffice.",code:"STORE_OPERATOR_POS_ACCESS_DISABLED"});
      if(operator.role!==payload.role)return res.status(401).json({error:"Ο ρόλος Store Mode άλλαξε. Συνδεθείτε ξανά.",code:"STORE_OPERATOR_ROLE_CHANGED"});
      prisma.$executeRaw`UPDATE "StoreOperatorSession" SET "lastSeenAt"=NOW() WHERE "id"=${payload.operatorSessionId} AND "lastSeenAt"<NOW()-INTERVAL '5 minutes'`.catch(()=>{});
      const rights=operator.profilePermissions&&typeof operator.profilePermissions==="object"?operator.profilePermissions:{};
      const permissions=storeRuntimePermissions({posAccess:operator.posAccess,permissions:rights});
      if(!enforceStorePaymentPermissions(req,res,permissions))return;
      if(!enforceStorePosPermissions(req,res,permissions))return;
      exposeStorePosRuntimeAccess(req,res,rights);
      const posOcrJobCreate=req.method==="POST"&&String(req.originalUrl||"").split("?")[0]==="/api/commerce/ai-reader/jobs";
      req.user={...payload,id:posOcrJobCreate?null:operator.id,operatorId:operator.id,employeeId:operator.employeeId,companyId:operator.companyId,storeId:operator.storeId,fullName:operator.displayName,role:operator.role,permissions};
      return next();
    }
    if(payload.isSuperAdmin&&!payload.sessionId)return res.status(401).json({error:"Απαιτείται νέα ασφαλής σύνδεση με 2FA."});
    let currentUser=null;
    if(payload.sessionId){
      const session=await prisma.userSession.findUnique({where:{id:payload.sessionId},include:{user:{select:{sessionVersion:true,role:true,mustChangePassword:true,company:{select:{active:true}}}}}});
      const expired=!session||session.expiresAt.getTime()<=Date.now(),revoked=!!session?.revokedAt,versionChanged=session?.user?.sessionVersion!==payload.sessionVersion,inactiveCompany=session?.user?.role!=="SUPER_ADMIN"&&!session?.user?.company?.active;
      if(expired||revoked||versionChanged||inactiveCompany)return res.status(401).json({error:"Η συνεδρία δεν είναι πλέον ενεργή."});
      currentUser=session.user;if(Date.now()-session.lastSeenAt.getTime()>5*60*1000)prisma.userSession.update({where:{id:session.id},data:{lastSeenAt:new Date()}}).catch(()=>{});
    }
    const passwordChangeAllowed=req.originalUrl.startsWith("/api/auth/change-password")||req.originalUrl.startsWith("/api/auth/logout");
    const passwordChangeRequired=currentUser?.mustChangePassword===true||payload.mustChangePassword===true;
    if(passwordChangeRequired&&!passwordChangeAllowed)return res.status(403).json({error:"Απαιτείται αλλαγή του προσωρινού κωδικού πριν από την πρόσβαση.",code:"PASSWORD_CHANGE_REQUIRED"});
    req.user={...payload,mustChangePassword:passwordChangeRequired};next();
  }catch(error){console.error("Authentication validation failed",error?.message||error);res.status(401).json({error:"Η συνεδρία έληξε."})}
}
