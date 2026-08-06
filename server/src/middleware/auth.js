import jwt from "jsonwebtoken";
import { prisma } from "../prisma.js";

export async function auth(req,res,next){
  const token=req.headers.authorization?.replace("Bearer ","");
  if(!token)return res.status(401).json({error:"Απαιτείται σύνδεση."});
  try{
    const payload=jwt.verify(token,process.env.JWT_SECRET);

    // Store Operator tokens keep their existing isolated authentication flow.
    if(payload.tokenType==="STORE_OPERATOR"){
      req.user=payload;
      return next();
    }

    // Old Super Admin tokens are deliberately rejected after the 2FA upgrade.
    if(payload.isSuperAdmin&&!payload.sessionId){
      return res.status(401).json({error:"Απαιτείται νέα ασφαλής σύνδεση με 2FA."});
    }

    let currentUser=null;
    if(payload.sessionId){
      const session=await prisma.userSession.findUnique({
        where:{id:payload.sessionId},
        include:{user:{select:{sessionVersion:true,role:true,mustChangePassword:true,company:{select:{active:true}}}}}
      });
      const expired=!session||session.expiresAt.getTime()<=Date.now();
      const revoked=!!session?.revokedAt;
      const versionChanged=session?.user?.sessionVersion!==payload.sessionVersion;
      const inactiveCompany=session?.user?.role!=="SUPER_ADMIN"&&!session?.user?.company?.active;
      if(expired||revoked||versionChanged||inactiveCompany){
        return res.status(401).json({error:"Η συνεδρία δεν είναι πλέον ενεργή."});
      }
      currentUser=session.user;
      if(Date.now()-session.lastSeenAt.getTime()>5*60*1000){
        prisma.userSession.update({where:{id:session.id},data:{lastSeenAt:new Date()}}).catch(()=>{});
      }
    }

    const passwordChangeAllowed=req.originalUrl.startsWith("/api/auth/change-password")||req.originalUrl.startsWith("/api/auth/logout");
    const passwordChangeRequired=currentUser?.mustChangePassword===true||payload.mustChangePassword===true;
    if(passwordChangeRequired&&!passwordChangeAllowed){
      return res.status(403).json({
        error:"Απαιτείται αλλαγή του προσωρινού κωδικού πριν από την πρόσβαση.",
        code:"PASSWORD_CHANGE_REQUIRED"
      });
    }

    req.user={...payload,mustChangePassword:passwordChangeRequired};
    next();
  }catch(error){
    console.error("Authentication validation failed",error?.message||error);
    res.status(401).json({error:"Η συνεδρία έληξε."});
  }
}
