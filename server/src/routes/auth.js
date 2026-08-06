import { Router } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { z } from "zod";
import { prisma } from "../prisma.js";
import { auth } from "../middleware/auth.js";
import {
  buildOtpAuthUri,
  consumeRecoveryCode,
  decryptTotpSecret,
  encryptTotpSecret,
  generateRecoveryCodes,
  generateTotpSecret,
  hashRecoveryCodes,
  verifyTotp
} from "../security/totp.js";

const router = Router();
const SESSION_HOURS=12;

function ipAddress(req){
  const forwarded=req.headers["x-forwarded-for"];
  if(typeof forwarded==="string")return forwarded.split(",")[0].trim().slice(0,120);
  return String(req.ip||req.socket?.remoteAddress||"").slice(0,120)||null;
}

function deviceLabel(value){
  return String(value||"Άγνωστη συσκευή").trim().slice(0,80)||"Άγνωστη συσκευή";
}

function publicUser(user){
  return {
    id:user.id,
    email:user.email,
    fullName:user.fullName,
    role:user.role,
    platformAdmin:user.role==="SUPER_ADMIN",
    mustChangePassword:Boolean(user.mustChangePassword),
    company:user.company
  };
}

async function audit(req,{userId=null,email,event,success,deviceName=null}){
  await prisma.authAudit.create({
    data:{
      userId,
      email:String(email||"").toLowerCase().slice(0,190),
      event,
      success,
      deviceName:deviceLabel(deviceName),
      userAgent:String(req.headers["user-agent"]||"").slice(0,500)||null,
      ipAddress:ipAddress(req)
    }
  }).catch(()=>{});
}

async function issueSession(user,req,deviceName){
  const expiresAt=new Date(Date.now()+SESSION_HOURS*60*60*1000);
  const session=await prisma.userSession.create({
    data:{
      userId:user.id,
      deviceName:deviceLabel(deviceName),
      userAgent:String(req.headers["user-agent"]||"").slice(0,500)||null,
      ipAddress:ipAddress(req),
      expiresAt
    }
  });
  const isSuperAdmin=user.role==="SUPER_ADMIN";
  const token=jwt.sign({
    id:user.id,
    companyId:user.companyId,
    role:isSuperAdmin?"OWNER":user.role,
    platformRole:user.role,
    isSuperAdmin,
    fullName:user.fullName,
    email:user.email,
    mustChangePassword:Boolean(user.mustChangePassword),
    tokenType:"BACKOFFICE_USER",
    sessionId:session.id,
    sessionVersion:user.sessionVersion
  },process.env.JWT_SECRET,{expiresIn:`${SESSION_HOURS}h`});
  return {token,user:publicUser(user),session:{id:session.id,deviceName:session.deviceName,expiresAt}};
}

router.post("/login", async (req,res,next)=>{
  try{
    const {email,password,deviceName}=z.object({
      email:z.string().email(),
      password:z.string().min(6),
      deviceName:z.string().max(80).optional()
    }).parse(req.body);
    const normalizedEmail=email.toLowerCase();
    const user=await prisma.user.findUnique({where:{email:normalizedEmail},include:{company:true}});
    if(!user || !(await bcrypt.compare(password,user.passwordHash))){
      await audit(req,{email:normalizedEmail,event:"PASSWORD_REJECTED",success:false,deviceName});
      return res.status(401).json({error:"Λανθασμένο email ή κωδικός."});
    }

    const isSuperAdmin=user.role==="SUPER_ADMIN";
    if(!user.company.active && !isSuperAdmin){
      await audit(req,{userId:user.id,email:user.email,event:"COMPANY_INACTIVE",success:false,deviceName});
      return res.status(403).json({error:"Η συνδρομή της εταιρείας είναι ανενεργή. Επικοινωνήστε με το MyWorkStation."});
    }

    if(isSuperAdmin&&!user.totpEnabled){
      const secret=generateTotpSecret();
      const pendingSecret=encryptTotpSecret(secret);
      const setupToken=jwt.sign({id:user.id,purpose:"TOTP_SETUP",pendingSecret},process.env.JWT_SECRET,{expiresIn:"10m"});
      await audit(req,{userId:user.id,email:user.email,event:"TOTP_SETUP_STARTED",success:true,deviceName});
      return res.json({
        setupRequired:true,
        setupToken,
        secret,
        otpAuthUri:buildOtpAuthUri({email:user.email,secret}),
        user:{id:user.id,email:user.email,fullName:user.fullName,role:user.role}
      });
    }

    if(isSuperAdmin){
      const challengeToken=jwt.sign({id:user.id,purpose:"TOTP_CHALLENGE"},process.env.JWT_SECRET,{expiresIn:"5m"});
      await audit(req,{userId:user.id,email:user.email,event:"PASSWORD_ACCEPTED_MFA_REQUIRED",success:true,deviceName});
      return res.json({mfaRequired:true,challengeToken,user:{id:user.id,email:user.email,fullName:user.fullName,role:user.role}});
    }

    const result=await issueSession(user,req,deviceName);
    await audit(req,{
      userId:user.id,
      email:user.email,
      event:user.mustChangePassword?"TEMPORARY_PASSWORD_LOGIN":"LOGIN_SUCCESS",
      success:true,
      deviceName
    });
    res.json(result);
  }catch(e){next(e)}
});

router.post("/change-password",auth,async(req,res,next)=>{
  try{
    const {newPassword,confirmPassword,deviceName}=z.object({
      newPassword:z.string().min(10,"Ο νέος κωδικός πρέπει να έχει τουλάχιστον 10 χαρακτήρες.").max(100),
      confirmPassword:z.string().min(10).max(100),
      deviceName:z.string().max(80).optional()
    }).parse(req.body||{});
    if(newPassword!==confirmPassword)return res.status(400).json({error:"Οι δύο νέοι κωδικοί δεν είναι ίδιοι."});

    const user=await prisma.user.findUnique({where:{id:req.user.id},include:{company:true}});
    if(!user)return res.status(404).json({error:"Δεν βρέθηκε ο λογαριασμός."});
    if(user.role==="SUPER_ADMIN")return res.status(403).json({error:"Η αλλαγή αυτή αφορά λογαριασμούς πελατών."});
    if(await bcrypt.compare(newPassword,user.passwordHash)){
      return res.status(400).json({error:"Ο νέος κωδικός πρέπει να είναι διαφορετικός από τον προσωρινό."});
    }

    const updated=await prisma.user.update({
      where:{id:user.id},
      data:{
        passwordHash:await bcrypt.hash(newPassword,12),
        mustChangePassword:false,
        sessionVersion:{increment:1}
      },
      include:{company:true}
    });
    await prisma.userSession.updateMany({
      where:{userId:user.id,revokedAt:null},
      data:{revokedAt:new Date()}
    });
    const result=await issueSession(updated,req,deviceName||"Backoffice πελάτη");
    await audit(req,{userId:user.id,email:user.email,event:"TEMPORARY_PASSWORD_REPLACED",success:true,deviceName});
    res.json(result);
  }catch(error){next(error)}
});

router.post("/2fa/enable",async(req,res,next)=>{
  try{
    const {setupToken,code,deviceName}=z.object({
      setupToken:z.string().min(20),
      code:z.string().min(6).max(20),
      deviceName:z.string().max(80).optional()
    }).parse(req.body||{});
    const payload=jwt.verify(setupToken,process.env.JWT_SECRET);
    if(payload.purpose!=="TOTP_SETUP"||!payload.pendingSecret)return res.status(401).json({error:"Η διαδικασία ενεργοποίησης έληξε. Συνδέσου ξανά."});
    const user=await prisma.user.findUnique({where:{id:payload.id},include:{company:true}});
    if(!user||user.role!=="SUPER_ADMIN")return res.status(403).json({error:"Δεν επιτρέπεται ενεργοποίηση 2FA."});
    if(user.totpEnabled)return res.status(409).json({error:"Το 2FA είναι ήδη ενεργό."});
    const secret=decryptTotpSecret(payload.pendingSecret);
    if(!verifyTotp(secret,code)){
      await audit(req,{userId:user.id,email:user.email,event:"TOTP_SETUP_REJECTED",success:false,deviceName});
      return res.status(401).json({error:"Ο εξαψήφιος κωδικός δεν είναι σωστός. Περίμενε τον επόμενο και δοκίμασε ξανά."});
    }
    const recoveryCodes=generateRecoveryCodes();
    const recoveryHashes=await hashRecoveryCodes(recoveryCodes);
    const updated=await prisma.user.update({
      where:{id:user.id},
      data:{
        totpSecret:encryptTotpSecret(secret),
        totpEnabled:true,
        totpRecoveryCodes:JSON.stringify(recoveryHashes),
        sessionVersion:{increment:1}
      },
      include:{company:true}
    });
    const result=await issueSession(updated,req,deviceName);
    await audit(req,{userId:user.id,email:user.email,event:"TOTP_ENABLED_LOGIN_SUCCESS",success:true,deviceName});
    res.json({...result,recoveryCodes});
  }catch(error){
    if(error?.name==="JsonWebTokenError"||error?.name==="TokenExpiredError")return res.status(401).json({error:"Η διαδικασία ενεργοποίησης έληξε. Συνδέσου ξανά."});
    next(error);
  }
});

router.post("/2fa/verify",async(req,res,next)=>{
  try{
    const {challengeToken,code,deviceName}=z.object({
      challengeToken:z.string().min(20),
      code:z.string().min(6).max(20),
      deviceName:z.string().max(80).optional()
    }).parse(req.body||{});
    const payload=jwt.verify(challengeToken,process.env.JWT_SECRET);
    if(payload.purpose!=="TOTP_CHALLENGE")return res.status(401).json({error:"Η επιβεβαίωση έληξε. Συνδέσου ξανά."});
    const user=await prisma.user.findUnique({where:{id:payload.id},include:{company:true}});
    if(!user||user.role!=="SUPER_ADMIN"||!user.totpEnabled||!user.totpSecret)return res.status(403).json({error:"Το 2FA δεν είναι διαθέσιμο."});

    let accepted=verifyTotp(decryptTotpSecret(user.totpSecret),code);
    let usedRecovery=false;
    let remainingRecoveryCodes=user.totpRecoveryCodes;
    if(!accepted){
      const recovery=await consumeRecoveryCode(user.totpRecoveryCodes,code);
      accepted=recovery.matched;
      usedRecovery=recovery.matched;
      remainingRecoveryCodes=recovery.remaining;
    }
    if(!accepted){
      await audit(req,{userId:user.id,email:user.email,event:"TOTP_REJECTED",success:false,deviceName});
      return res.status(401).json({error:"Ο κωδικός 2FA δεν είναι σωστός."});
    }
    if(usedRecovery){
      await prisma.user.update({where:{id:user.id},data:{totpRecoveryCodes:remainingRecoveryCodes}});
    }
    const result=await issueSession(user,req,deviceName);
    await audit(req,{userId:user.id,email:user.email,event:usedRecovery?"RECOVERY_LOGIN_SUCCESS":"TOTP_LOGIN_SUCCESS",success:true,deviceName});
    res.json({...result,usedRecovery});
  }catch(error){
    if(error?.name==="JsonWebTokenError"||error?.name==="TokenExpiredError")return res.status(401).json({error:"Η επιβεβαίωση έληξε. Συνδέσου ξανά."});
    next(error);
  }
});

router.get("/security",auth,async(req,res,next)=>{
  try{
    if(!req.user.isSuperAdmin)return res.status(403).json({error:"Απαιτείται Platform Super Admin."});
    const [user,sessions,audits]=await Promise.all([
      prisma.user.findUnique({where:{id:req.user.id},select:{totpEnabled:true,totpRecoveryCodes:true}}),
      prisma.userSession.findMany({where:{userId:req.user.id},orderBy:{createdAt:"desc"},take:30}),
      prisma.authAudit.findMany({where:{userId:req.user.id},orderBy:{createdAt:"desc"},take:30})
    ]);
    let recoveryCount=0;
    try{recoveryCount=JSON.parse(user?.totpRecoveryCodes||"[]").length}catch{}
    res.json({
      totpEnabled:!!user?.totpEnabled,
      recoveryCount,
      currentSessionId:req.user.sessionId,
      sessions:sessions.map(session=>({
        id:session.id,
        deviceName:session.deviceName,
        ipAddress:session.ipAddress,
        createdAt:session.createdAt,
        lastSeenAt:session.lastSeenAt,
        expiresAt:session.expiresAt,
        revokedAt:session.revokedAt,
        current:session.id===req.user.sessionId
      })),
      audits
    });
  }catch(error){next(error)}
});

router.post("/sessions/:sessionId/revoke",auth,async(req,res,next)=>{
  try{
    if(!req.user.isSuperAdmin)return res.status(403).json({error:"Απαιτείται Platform Super Admin."});
    const session=await prisma.userSession.findFirst({where:{id:req.params.sessionId,userId:req.user.id}});
    if(!session)return res.status(404).json({error:"Δεν βρέθηκε η συσκευή."});
    await prisma.userSession.update({where:{id:session.id},data:{revokedAt:new Date()}});
    await audit(req,{userId:req.user.id,email:req.user.email,event:"SESSION_REVOKED",success:true,deviceName:session.deviceName});
    res.json({ok:true,current:session.id===req.user.sessionId});
  }catch(error){next(error)}
});

router.post("/sessions/revoke-others",auth,async(req,res,next)=>{
  try{
    if(!req.user.isSuperAdmin)return res.status(403).json({error:"Απαιτείται Platform Super Admin."});
    const result=await prisma.userSession.updateMany({
      where:{userId:req.user.id,id:{not:req.user.sessionId},revokedAt:null},
      data:{revokedAt:new Date()}
    });
    await audit(req,{userId:req.user.id,email:req.user.email,event:"OTHER_SESSIONS_REVOKED",success:true,deviceName:"Platform Admin"});
    res.json({ok:true,count:result.count});
  }catch(error){next(error)}
});

router.post("/logout",auth,async(req,res,next)=>{
  try{
    if(req.user.sessionId){
      await prisma.userSession.updateMany({where:{id:req.user.sessionId,userId:req.user.id},data:{revokedAt:new Date()}});
    }
    res.json({ok:true});
  }catch(error){next(error)}
});

export default router;
