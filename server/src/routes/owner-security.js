import {Router} from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import {z} from "zod";
import {prisma} from "../prisma.js";
import {auth} from "../middleware/auth.js";
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

const router=Router();
const SESSION_HOURS=12;

function ipAddress(req){
  const forwarded=req.headers["x-forwarded-for"];
  if(typeof forwarded==="string")return forwarded.split(",")[0].trim().slice(0,120);
  return String(req.ip||req.socket?.remoteAddress||"").slice(0,120)||null;
}

function deviceLabel(value,req){
  const requested=String(value||"").trim();
  if(requested)return requested.slice(0,80);
  const agent=String(req.headers["user-agent"]||"");
  if(/Windows/i.test(agent))return "Windows Backoffice";
  if(/Android/i.test(agent))return "Android συσκευή";
  if(/iPhone|iPad/i.test(agent))return "Apple συσκευή";
  return "Backoffice πελάτη";
}

function publicOwner(user,extra={}){
  return {
    id:user.id,
    email:user.email,
    fullName:user.fullName,
    role:user.role,
    platformAdmin:false,
    mustChangePassword:Boolean(user.mustChangePassword),
    company:user.company,
    ...extra
  };
}

async function audit(req,{userId=null,email,event,success,deviceName=null}){
  await prisma.authAudit.create({
    data:{
      userId,
      email:String(email||"").toLowerCase().slice(0,190),
      event,
      success,
      deviceName:deviceLabel(deviceName,req),
      userAgent:String(req.headers["user-agent"]||"").slice(0,500)||null,
      ipAddress:ipAddress(req)
    }
  }).catch(()=>{});
}

async function issueOwnerSession(user,req,deviceName){
  const expiresAt=new Date(Date.now()+SESSION_HOURS*60*60*1000);
  const session=await prisma.userSession.create({
    data:{
      userId:user.id,
      deviceName:deviceLabel(deviceName,req),
      userAgent:String(req.headers["user-agent"]||"").slice(0,500)||null,
      ipAddress:ipAddress(req),
      expiresAt
    }
  });
  const token=jwt.sign({
    id:user.id,
    companyId:user.companyId,
    role:"OWNER",
    platformRole:"OWNER",
    isSuperAdmin:false,
    fullName:user.fullName,
    email:user.email,
    mustChangePassword:Boolean(user.mustChangePassword),
    tokenType:"BACKOFFICE_USER",
    sessionId:session.id,
    sessionVersion:user.sessionVersion
  },process.env.JWT_SECRET,{expiresIn:`${SESSION_HOURS}h`});
  return {token,user:publicOwner(user),session:{id:session.id,deviceName:session.deviceName,expiresAt}};
}

function ownerOnly(req,res,next){
  if(req.user?.isSuperAdmin||req.user?.platformRole!=="OWNER")return res.status(403).json({error:"Η λειτουργία αφορά τον ιδιοκτήτη του πελάτη."});
  next();
}

// Intercepts only OWNER logins. Other roles continue to the existing auth router.
router.post("/login",async(req,res,next)=>{
  try{
    const body=z.object({
      email:z.string().email(),
      password:z.string().min(6),
      deviceName:z.string().max(80).optional()
    }).parse(req.body||{});
    const email=body.email.toLowerCase();
    const user=await prisma.user.findUnique({where:{email},include:{company:true}});
    if(!user||user.role!=="OWNER")return next();

    if(!(await bcrypt.compare(body.password,user.passwordHash))){
      await audit(req,{userId:user.id,email,event:"PASSWORD_REJECTED",success:false,deviceName:body.deviceName});
      return res.status(401).json({error:"Λανθασμένο email ή κωδικός."});
    }
    if(!user.company.active){
      await audit(req,{userId:user.id,email,event:"COMPANY_INACTIVE",success:false,deviceName:body.deviceName});
      return res.status(403).json({error:"Η συνδρομή της εταιρείας είναι ανενεργή. Επικοινωνήστε με το MyWorkStation."});
    }

    if(user.totpEnabled){
      const challengeToken=jwt.sign({id:user.id,purpose:"OWNER_TOTP_CHALLENGE"},process.env.JWT_SECRET,{expiresIn:"5m"});
      await audit(req,{userId:user.id,email,event:"OWNER_PASSWORD_ACCEPTED_MFA_REQUIRED",success:true,deviceName:body.deviceName});
      return res.json({
        token:challengeToken,
        mfaRequired:true,
        challengeToken,
        user:publicOwner(user,{mfaRequired:true})
      });
    }

    const result=await issueOwnerSession(user,req,body.deviceName);
    await audit(req,{userId:user.id,email,event:user.mustChangePassword?"TEMPORARY_PASSWORD_LOGIN":"LOGIN_SUCCESS",success:true,deviceName:body.deviceName});
    res.json(result);
  }catch(error){next(error)}
});

router.post("/owner/2fa/verify",async(req,res,next)=>{
  try{
    const body=z.object({
      challengeToken:z.string().min(20),
      code:z.string().min(6).max(20),
      deviceName:z.string().max(80).optional()
    }).parse(req.body||{});
    const payload=jwt.verify(body.challengeToken,process.env.JWT_SECRET);
    if(payload.purpose!=="OWNER_TOTP_CHALLENGE")return res.status(401).json({error:"Η επιβεβαίωση έληξε. Συνδέσου ξανά."});
    const user=await prisma.user.findUnique({where:{id:payload.id},include:{company:true}});
    if(!user||user.role!=="OWNER"||!user.totpEnabled||!user.totpSecret)return res.status(403).json({error:"Το 2FA δεν είναι διαθέσιμο."});
    if(!user.company.active)return res.status(403).json({error:"Η συνδρομή της εταιρείας είναι ανενεργή."});

    let accepted=verifyTotp(decryptTotpSecret(user.totpSecret),body.code);
    let usedRecovery=false;
    let remaining=user.totpRecoveryCodes;
    if(!accepted){
      const recovery=await consumeRecoveryCode(user.totpRecoveryCodes,body.code);
      accepted=recovery.matched;
      usedRecovery=recovery.matched;
      remaining=recovery.remaining;
    }
    if(!accepted){
      await audit(req,{userId:user.id,email:user.email,event:"OWNER_TOTP_REJECTED",success:false,deviceName:body.deviceName});
      return res.status(401).json({error:"Ο κωδικός 2FA δεν είναι σωστός."});
    }
    if(usedRecovery)await prisma.user.update({where:{id:user.id},data:{totpRecoveryCodes:remaining}});

    const result=await issueOwnerSession(user,req,body.deviceName);
    await audit(req,{userId:user.id,email:user.email,event:usedRecovery?"OWNER_RECOVERY_LOGIN_SUCCESS":"OWNER_TOTP_LOGIN_SUCCESS",success:true,deviceName:body.deviceName});
    res.json({...result,usedRecovery});
  }catch(error){
    if(error?.name==="JsonWebTokenError"||error?.name==="TokenExpiredError")return res.status(401).json({error:"Η επιβεβαίωση έληξε. Συνδέσου ξανά."});
    next(error);
  }
});

router.post("/owner/2fa/setup",auth,ownerOnly,async(req,res,next)=>{
  try{
    const user=await prisma.user.findUnique({where:{id:req.user.id},include:{company:true}});
    if(!user||user.role!=="OWNER")return res.status(404).json({error:"Δεν βρέθηκε ο ιδιοκτήτης."});
    if(user.mustChangePassword)return res.status(409).json({error:"Ολοκλήρωσε πρώτα την αλλαγή του προσωρινού κωδικού."});
    if(user.totpEnabled)return res.status(409).json({error:"Το 2FA είναι ήδη ενεργό."});
    const secret=generateTotpSecret();
    const setupToken=jwt.sign({id:user.id,purpose:"OWNER_TOTP_SETUP",pendingSecret:encryptTotpSecret(secret)},process.env.JWT_SECRET,{expiresIn:"10m"});
    await audit(req,{userId:user.id,email:user.email,event:"OWNER_TOTP_SETUP_STARTED",success:true,deviceName:req.body?.deviceName});
    res.json({setupToken,secret,otpAuthUri:buildOtpAuthUri({email:user.email,secret})});
  }catch(error){next(error)}
});

router.post("/owner/2fa/enable",auth,ownerOnly,async(req,res,next)=>{
  try{
    const body=z.object({
      setupToken:z.string().min(20),
      code:z.string().length(6),
      deviceName:z.string().max(80).optional()
    }).parse(req.body||{});
    const payload=jwt.verify(body.setupToken,process.env.JWT_SECRET);
    if(payload.purpose!=="OWNER_TOTP_SETUP"||payload.id!==req.user.id||!payload.pendingSecret)return res.status(401).json({error:"Η διαδικασία ενεργοποίησης έληξε. Ξεκίνα ξανά."});
    const user=await prisma.user.findUnique({where:{id:req.user.id},include:{company:true}});
    if(!user||user.role!=="OWNER")return res.status(404).json({error:"Δεν βρέθηκε ο ιδιοκτήτης."});
    if(user.totpEnabled)return res.status(409).json({error:"Το 2FA είναι ήδη ενεργό."});
    const secret=decryptTotpSecret(payload.pendingSecret);
    if(!verifyTotp(secret,body.code)){
      await audit(req,{userId:user.id,email:user.email,event:"OWNER_TOTP_SETUP_REJECTED",success:false,deviceName:body.deviceName});
      return res.status(401).json({error:"Ο εξαψήφιος κωδικός δεν είναι σωστός."});
    }

    const recoveryCodes=generateRecoveryCodes();
    const updated=await prisma.user.update({
      where:{id:user.id},
      data:{
        totpSecret:encryptTotpSecret(secret),
        totpEnabled:true,
        totpRecoveryCodes:JSON.stringify(await hashRecoveryCodes(recoveryCodes)),
        sessionVersion:{increment:1}
      },
      include:{company:true}
    });
    await prisma.userSession.updateMany({where:{userId:user.id,revokedAt:null},data:{revokedAt:new Date()}});
    const result=await issueOwnerSession(updated,req,body.deviceName);
    await audit(req,{userId:user.id,email:user.email,event:"OWNER_TOTP_ENABLED",success:true,deviceName:body.deviceName});
    res.json({...result,recoveryCodes});
  }catch(error){
    if(error?.name==="JsonWebTokenError"||error?.name==="TokenExpiredError")return res.status(401).json({error:"Η διαδικασία ενεργοποίησης έληξε. Ξεκίνα ξανά."});
    next(error);
  }
});

router.post("/owner/2fa/disable",auth,ownerOnly,async(req,res,next)=>{
  try{
    const body=z.object({
      password:z.string().min(6),
      code:z.string().min(6).max(20),
      deviceName:z.string().max(80).optional()
    }).parse(req.body||{});
    const user=await prisma.user.findUnique({where:{id:req.user.id},include:{company:true}});
    if(!user||user.role!=="OWNER"||!user.totpEnabled||!user.totpSecret)return res.status(409).json({error:"Το 2FA δεν είναι ενεργό."});
    if(!(await bcrypt.compare(body.password,user.passwordHash)))return res.status(401).json({error:"Ο κωδικός λογαριασμού δεν είναι σωστός."});

    let accepted=verifyTotp(decryptTotpSecret(user.totpSecret),body.code);
    if(!accepted){
      const recovery=await consumeRecoveryCode(user.totpRecoveryCodes,body.code);
      accepted=recovery.matched;
    }
    if(!accepted)return res.status(401).json({error:"Ο κωδικός 2FA δεν είναι σωστός."});

    const updated=await prisma.user.update({
      where:{id:user.id},
      data:{totpSecret:null,totpEnabled:false,totpRecoveryCodes:null,sessionVersion:{increment:1}},
      include:{company:true}
    });
    await prisma.userSession.updateMany({where:{userId:user.id,revokedAt:null},data:{revokedAt:new Date()}});
    const result=await issueOwnerSession(updated,req,body.deviceName);
    await audit(req,{userId:user.id,email:user.email,event:"OWNER_TOTP_DISABLED",success:true,deviceName:body.deviceName});
    res.json(result);
  }catch(error){next(error)}
});

router.get("/owner/security",auth,ownerOnly,async(req,res,next)=>{
  try{
    const [user,sessions,audits]=await Promise.all([
      prisma.user.findUnique({where:{id:req.user.id},select:{totpEnabled:true,totpRecoveryCodes:true}}),
      prisma.userSession.findMany({where:{userId:req.user.id},orderBy:{createdAt:"desc"},take:30}),
      prisma.authAudit.findMany({where:{userId:req.user.id},orderBy:{createdAt:"desc"},take:30})
    ]);
    let recoveryCount=0;
    try{recoveryCount=JSON.parse(user?.totpRecoveryCodes||"[]").length}catch{}
    res.json({
      totpEnabled:Boolean(user?.totpEnabled),
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

router.post("/owner/sessions/:sessionId/revoke",auth,ownerOnly,async(req,res,next)=>{
  try{
    const session=await prisma.userSession.findFirst({where:{id:req.params.sessionId,userId:req.user.id}});
    if(!session)return res.status(404).json({error:"Δεν βρέθηκε η συσκευή."});
    await prisma.userSession.update({where:{id:session.id},data:{revokedAt:new Date()}});
    await audit(req,{userId:req.user.id,email:req.user.email,event:"OWNER_SESSION_REVOKED",success:true,deviceName:session.deviceName});
    res.json({ok:true,current:session.id===req.user.sessionId});
  }catch(error){next(error)}
});

router.post("/owner/sessions/revoke-others",auth,ownerOnly,async(req,res,next)=>{
  try{
    const result=await prisma.userSession.updateMany({where:{userId:req.user.id,id:{not:req.user.sessionId},revokedAt:null},data:{revokedAt:new Date()}});
    await audit(req,{userId:req.user.id,email:req.user.email,event:"OWNER_OTHER_SESSIONS_REVOKED",success:true,deviceName:"Backoffice πελάτη"});
    res.json({ok:true,count:result.count});
  }catch(error){next(error)}
});

export default router;
