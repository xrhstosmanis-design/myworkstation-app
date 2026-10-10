// Bounded fixture creation; mounted only behind the existing Platform auth gate.
import {N40_FIXTURE} from "../../../shared/n40-backoffice-fixture.mjs";
const fail=(status,message)=>Object.assign(new Error(message),{status});
const select={id:true,email:true,fullName:true,role:true,companyId:true,mustChangePassword:true};
export function createN40FixtureHandlers({prisma,hash}) {
  const authorized=req=>{if(req.user?.tokenType!=="BACKOFFICE_USER"||!(req.user?.isSuperAdmin===true||req.user?.platformRole==="SUPER_ADMIN"))throw fail(403,"Απαιτείται ενεργή πρόσβαση Super Admin.");};
  const context=async db=>{
    const store=await db.store.findUnique({where:{id:N40_FIXTURE.storeId},select:{id:true,name:true,active:true,companyId:true,company:{select:{name:true,active:true}}}});
    if(!store?.active||store.companyId!==N40_FIXTURE.companyId||!store.company?.active||store.name!=="ΕΡΓΑΣΤΗΡΙΟ ΔΟΚΙΜΩΝ"||store.company.name!=="MYWORKSTATION LAB")throw fail(409,"Το ακριβές ενεργό LAB δεν επιβεβαιώθηκε.");
    return store;
  };
  return {
    read:async(req,res,next)=>{try{authorized(req);await context(prisma);const user=await prisma.user.findUnique({where:{email:N40_FIXTURE.email},select});res.json({fixture:N40_FIXTURE,user,exists:Boolean(user)});}catch(error){next(error);}},
    create:async(req,res,next)=>{try{
      authorized(req);
      const body=req.body||{},keys=Object.keys(body);
      if(keys.length!==2||keys.some(key=>!['password','confirmPassword'].includes(key))||typeof body.password!=="string"||typeof body.confirmPassword!=="string"||body.password.length<10||Buffer.byteLength(body.password,"utf8")>72||body.password!==body.confirmPassword)throw fail(400,"Χρειάζονται δύο ίδιοι νέοι κωδικοί, τουλάχιστον 10 χαρακτήρες και έως 72 bytes.");
      // Hash before transaction; plaintext is never persisted, returned or audited.
      const passwordHash=await hash(body.password,12);
      const user=await prisma.$transaction(async db=>{
        await context(db);
        if(await db.user.findUnique({where:{email:N40_FIXTURE.email},select:{id:true}}))throw fail(409,"Ο λογαριασμός υπάρχει ήδη. Δεν γίνεται αλλαγή ή επαναφορά.");
        const created=await db.user.create({data:{email:N40_FIXTURE.email,fullName:N40_FIXTURE.fullName,role:N40_FIXTURE.role,companyId:N40_FIXTURE.companyId,passwordHash,mustChangePassword:true},select});
        await db.authAudit.create({data:{userId:req.user.id,email:req.user.email||"super-admin",event:"N40_RESTRICTED_BACKOFFICE_FIXTURE_CREATED",success:true,deviceName:"MYWORKSTATION LAB · ΕΡΓΑΣΤΗΡΙΟ ΔΟΚΙΜΩΝ"}});
        return created;
      });
      res.status(201).json({ok:true,user});
    }catch(error){if(error.code==="P2002")return res.status(409).json({error:"Ο λογαριασμός υπάρχει ήδη. Δεν γίνεται αλλαγή ή επαναφορά."});next(error);}}
  };
}
