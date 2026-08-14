import jwt from "jsonwebtoken";
import { prisma } from "../prisma.js";

function storeRuntimePermissions(profile){
  const p=profile&&typeof profile==="object"?profile:{};
  const permissions=[];
  if(p.posAccess!==false)permissions.push("ATTENDANCE");
  if(p.permissions?.cash)permissions.push("CASH_CONTROL");
  if(p.permissions?.shiftTransactionsPos)permissions.push("STORE_LEDGER");
  if(p.permissions?.allShiftTransactionsPos)permissions.push("STORE_LEDGER_REVIEW");
  if(p.permissions?.supplierPayment)permissions.push("SUPPLIER_PAYMENT");
  if(p.permissions?.sameShiftPayments)permissions.push("SAME_SHIFT_PAYMENTS");
  return permissions;
}

function enforceStorePaymentPermissions(req,res,permissions){
  if(req.method!=="POST"||!String(req.originalUrl||"").startsWith("/api/transactions/stores/"))return true;
  const type=String(req.body?.type||"");
  const payment=type==="SUPPLIER_PAYMENT"||type==="OTHER_EXPENSE";
  if(type==="SUPPLIER_PAYMENT"&&!permissions.includes("SUPPLIER_PAYMENT")){
    res.status(403).json({error:"Δεν έχεις δικαίωμα Πληρωμής Προμηθευτή από το BackOffice."});
    return false;
  }
  const legacyShiftDeduction=req.body?.evidenceMode==null&&(req.body?.subtractFromShift===true||req.body?.subtractFromShift==="true");
  const sameShift=payment&&(req.body?.paymentSource==="CASH_SHIFT"||legacyShiftDeduction);
  if(sameShift&&!permissions.includes("SAME_SHIFT_PAYMENTS")){
    res.status(403).json({error:"Δεν έχεις δικαίωμα να αφαιρούνται πληρωμές από την ίδια βάρδια."});
    return false;
  }
  return true;
}

export async function auth(req,res,next){
  const token=req.headers.authorization?.replace("Bearer ","");
  if(!token)return res.status(401).json({error:"Απαιτείται σύνδεση."});
  try{
    const payload=jwt.verify(token,process.env.JWT_SECRET);

    if(payload.tokenType==="STORE_OPERATOR"){
      if(!payload.operatorSessionId){
        return res.status(401).json({error:"Απαιτείται νέα είσοδος στο Store Mode.",code:"STORE_OPERATOR_SESSION_REQUIRED"});
      }
      const rows=await prisma.$queryRaw`
        SELECT c."id",c."displayName",c."employeeId",c."companyId",c."storeId",c."role",c."active",
               e."active" AS "employeeActive",
               s."active" AS "storeActive",
               co."active" AS "companyActive",
               os."expiresAt" AS "operatorSessionExpiresAt",
               os."revokedAt" AS "operatorSessionRevokedAt",
               COALESCE(p."posAccess",TRUE) AS "posAccess",
               COALESCE(p."permissions",'{}'::jsonb) AS "profilePermissions"
        FROM "StoreOperatorCredential" c
        JOIN "Employee" e ON e."id"=c."employeeId"
        JOIN "Store" s ON s."id"=c."storeId"
        JOIN "Company" co ON co."id"=c."companyId"
        JOIN "StoreOperatorSession" os ON os."id"=${payload.operatorSessionId} AND os."operatorId"=c."id"
        LEFT JOIN "StoreOperatorProfile" p
          ON p."companyId"=c."companyId" AND p."storeId"=c."storeId" AND p."employeeId"=c."employeeId"
        WHERE c."id"=${payload.operatorId||payload.id}
          AND c."employeeId"=${payload.employeeId}
          AND c."storeId"=${payload.storeId}
          AND c."companyId"=${payload.companyId}
        LIMIT 1
      `;
      const operator=rows[0];
      const operatorSessionExpired=!operator?.operatorSessionExpiresAt||new Date(operator.operatorSessionExpiresAt).getTime()<=Date.now();
      if(!operator||operatorSessionExpired||operator.operatorSessionRevokedAt||!operator.active||!operator.employeeActive||!operator.storeActive||!operator.companyActive){
        return res.status(401).json({error:"Η πρόσβαση Store Mode δεν είναι πλέον ενεργή. Συνδεθείτε ξανά.",code:"STORE_OPERATOR_SESSION_REVOKED"});
      }
      if(operator.posAccess===false){
        return res.status(403).json({error:"Η πρόσβαση POS του χειριστή έχει απενεργοποιηθεί από το BackOffice.",code:"STORE_OPERATOR_POS_ACCESS_DISABLED"});
      }
      if(operator.role!==payload.role){
        return res.status(401).json({error:"Ο ρόλος Store Mode άλλαξε. Συνδεθείτε ξανά.",code:"STORE_OPERATOR_ROLE_CHANGED"});
      }
      prisma.$executeRaw`UPDATE "StoreOperatorSession" SET "lastSeenAt"=NOW() WHERE "id"=${payload.operatorSessionId} AND "lastSeenAt"<NOW()-INTERVAL '5 minutes'`.catch(()=>{});
      const permissions=storeRuntimePermissions({posAccess:operator.posAccess,permissions:operator.profilePermissions});
      if(!enforceStorePaymentPermissions(req,res,permissions))return;
      req.user={...payload,id:operator.id,operatorId:operator.id,employeeId:operator.employeeId,companyId:operator.companyId,storeId:operator.storeId,fullName:operator.displayName,role:operator.role,permissions};
      return next();
    }

    if(payload.isSuperAdmin&&!payload.sessionId){
      return res.status(401).json({error:"Απαιτείται νέα ασφαλής σύνδεση με 2FA."});
    }

    let currentUser=null;
    if(payload.sessionId){
      const session=await prisma.userSession.findUnique({where:{id:payload.sessionId},include:{user:{select:{sessionVersion:true,role:true,mustChangePassword:true,company:{select:{active:true}}}}}});
      const expired=!session||session.expiresAt.getTime()<=Date.now();
      const revoked=!!session?.revokedAt;
      const versionChanged=session?.user?.sessionVersion!==payload.sessionVersion;
      const inactiveCompany=session?.user?.role!=="SUPER_ADMIN"&&!session?.user?.company?.active;
      if(expired||revoked||versionChanged||inactiveCompany)return res.status(401).json({error:"Η συνεδρία δεν είναι πλέον ενεργή."});
      currentUser=session.user;
      if(Date.now()-session.lastSeenAt.getTime()>5*60*1000)prisma.userSession.update({where:{id:session.id},data:{lastSeenAt:new Date()}}).catch(()=>{});
    }

    const passwordChangeAllowed=req.originalUrl.startsWith("/api/auth/change-password")||req.originalUrl.startsWith("/api/auth/logout");
    const passwordChangeRequired=currentUser?.mustChangePassword===true||payload.mustChangePassword===true;
    if(passwordChangeRequired&&!passwordChangeAllowed){
      return res.status(403).json({error:"Απαιτείται αλλαγή του προσωρινού κωδικού πριν από την πρόσβαση.",code:"PASSWORD_CHANGE_REQUIRED"});
    }

    req.user={...payload,mustChangePassword:passwordChangeRequired};
    next();
  }catch(error){
    console.error("Authentication validation failed",error?.message||error);
    res.status(401).json({error:"Η συνεδρία έληξε."});
  }
}
