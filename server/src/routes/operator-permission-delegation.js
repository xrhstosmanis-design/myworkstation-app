import {Router} from "express";
import crypto from "node:crypto";
import bcrypt from "bcryptjs";
import {z} from "zod";
import {prisma} from "../prisma.js";
import {requireStaffAction,staffError} from "../services/backoffice-staff-access.js";
import {POS_MENU_PERMISSIONS,POS_PERMISSIONS} from "../../../shared/pos-operator-permissions.mjs";

const router=Router();
const delegatedOperatorPermission = "operator-profiles.manage-permissions";
const delegatedPosAccess = "operator-profiles.manage-pos-access";
const operatorPermissionKeys = [...POS_PERMISSIONS,...POS_MENU_PERMISSIONS].map(([key])=>key);
const isMenuPermission = key=>key==="orders";
const permissionEnabled = (profile,key)=>isMenuPermission(key)?profile?.backofficeMenu?.orders===true:Boolean(profile?.permissions?.[key]);
const permissionChange = z.object({
  key:z.enum(operatorPermissionKeys), enabled:z.boolean(), expected:z.boolean()
}).strict();

function delegatedPermissionsRoute(handler,capability=delegatedOperatorPermission){
  return async(req,res,next)=>{
    try{
      if(req.user?.staffAccess!==true)throw staffError();
      await requireStaffAction(prisma,req,req.params.storeId,capability);
      await handler(req,res);
    }catch(error){
      if(error?.name==="ZodError")return res.status(400).json({error:"Μη έγκυρη αλλαγή δικαιώματος."});
      next(error);
    }
  };
}

async function lockEmployeeOperator(tx,{companyId,storeId,employeeId,actorId}){
  const [credential]=await tx.$queryRaw`
    SELECT c."id" FROM "StoreOperatorCredential" c
    JOIN "Employee" e ON e."id"=c."employeeId" AND e."storeId"=c."storeId"
    WHERE c."companyId"=${companyId} AND c."storeId"=${storeId} AND c."employeeId"=${employeeId}
      AND c."role"='EMPLOYEE' AND c."active"=true AND e."active"=true AND e."userId" IS DISTINCT FROM ${actorId}
    FOR UPDATE OF c,e`;
  if(!credential)throw staffError(404,"STAFF_OBJECT_NOT_FOUND","Δεν βρέθηκε ενεργός χειριστής στο κατάστημα.");
  return credential;
}

router.get("/stores/:storeId/employee-permissions",delegatedPermissionsRoute(async(req,res)=>{
  const {companyId,id:actorId}=req.user,storeId=req.params.storeId;
  const rows=await prisma.$queryRaw`
    SELECT c."employeeId",c."displayName",p."permissions",p."backofficeMenu",p."posAccess"
    FROM "StoreOperatorCredential" c
    JOIN "Employee" e ON e."id"=c."employeeId" AND e."storeId"=c."storeId"
    LEFT JOIN "StoreOperatorProfile" p ON p."employeeId"=c."employeeId" AND p."storeId"=c."storeId" AND p."companyId"=c."companyId"
    WHERE c."companyId"=${companyId} AND c."storeId"=${storeId} AND c."role"='EMPLOYEE'
      AND c."active"=true AND e."active"=true AND e."userId" IS DISTINCT FROM ${actorId}
    ORDER BY c."displayName",c."employeeId"`;
  await requireStaffAction(prisma,req,storeId,delegatedOperatorPermission);
  res.json({companyId,storeId,items:rows.map(row=>({
    employeeId:row.employeeId,displayName:row.displayName,posAccess:row.posAccess!==false,
    permissions:Object.fromEntries(operatorPermissionKeys.map(key=>[key,permissionEnabled(row,key)]))
  }))});
}));

router.patch("/stores/:storeId/employee-permissions/:employeeId",delegatedPermissionsRoute(async(req,res)=>{
  const {companyId,id:actorId}=req.user,{storeId,employeeId}=req.params;
  const {key,enabled,expected}=permissionChange.parse(req.body);
  await prisma.$transaction(async tx=>{
    await requireStaffAction(tx,req,storeId,delegatedOperatorPermission);
    const credential=await lockEmployeeOperator(tx,{companyId,storeId,employeeId,actorId});
    const [profile]=await tx.$queryRaw`
      SELECT "permissions","backofficeMenu" FROM "StoreOperatorProfile"
      WHERE "companyId"=${companyId} AND "storeId"=${storeId} AND "employeeId"=${employeeId} FOR UPDATE`;
    const before=permissionEnabled(profile,key);
    if(before===enabled)return;
    if(before!==expected)throw staffError(409,"STAFF_OPERATOR_PERMISSION_CHANGED","Το δικαίωμα άλλαξε. Ανανέωσε τη λίστα.");
    const menuPermission=isMenuPermission(key);
    const changed=profile?await tx.$executeRaw`
      UPDATE "StoreOperatorProfile" SET
        "permissions"=CASE WHEN ${menuPermission} THEN "permissions" ELSE jsonb_set("permissions",ARRAY[${key}]::text[],to_jsonb(${enabled}::boolean)) END,
        "backofficeMenu"=CASE WHEN ${menuPermission} THEN jsonb_set("backofficeMenu",'{orders}',to_jsonb(${enabled}::boolean)) ELSE "backofficeMenu" END,
        "updatedAt"=NOW()
      WHERE "companyId"=${companyId} AND "storeId"=${storeId} AND "employeeId"=${employeeId}`
      :await tx.$executeRaw`
      INSERT INTO "StoreOperatorProfile" ("id","companyId","storeId","employeeId","permissions","backofficeMenu","createdBy")
      VALUES (${crypto.randomUUID()},${companyId},${storeId},${employeeId},
        CASE WHEN ${menuPermission} THEN '{}'::jsonb ELSE jsonb_build_object(${key}::text,${enabled}::boolean) END,
        CASE WHEN ${menuPermission} THEN jsonb_build_object('orders',${enabled}::boolean) ELSE '{}'::jsonb END,${actorId})
      ON CONFLICT ("storeId","employeeId") DO NOTHING`;
    if(changed!==1)throw staffError(409,"STAFF_OPERATOR_PERMISSION_CHANGED","Το δικαίωμα άλλαξε. Ανανέωσε τη λίστα.");
    await tx.$executeRaw`
      INSERT INTO "StoreOperatorAudit" ("id","companyId","storeId","operatorId","actorId","eventType","details")
      VALUES (${crypto.randomUUID()},${companyId},${storeId},${credential.id},${actorId},'OPERATOR_PERMISSION_UPDATED',
        CAST(${JSON.stringify({employeeId,key,before,enabled})} AS jsonb))`;
  });
  res.json({companyId,storeId,employeeId,key,enabled});
}));

const accessChange=z.object({enabled:z.boolean(),expected:z.boolean()}).strict();

router.patch("/stores/:storeId/employee-permissions/:employeeId/pos-access",delegatedPermissionsRoute(async(req,res)=>{
  const {companyId,id:actorId}=req.user,{storeId,employeeId}=req.params;
  const {enabled,expected}=accessChange.parse(req.body);
  await prisma.$transaction(async tx=>{
    await requireStaffAction(tx,req,storeId,delegatedPosAccess);
    const credential=await lockEmployeeOperator(tx,{companyId,storeId,employeeId,actorId});
    const [profile]=await tx.$queryRaw`
      SELECT "posAccess" FROM "StoreOperatorProfile"
      WHERE "companyId"=${companyId} AND "storeId"=${storeId} AND "employeeId"=${employeeId} FOR UPDATE`;
    const before=profile?.posAccess!==false;
    if(before===enabled)return;
    if(before!==expected)throw staffError(409,"STAFF_OPERATOR_PERMISSION_CHANGED","Η πρόσβαση POS άλλαξε. Ανανέωσε τη λίστα.");
    if(!enabled){
      const [openShift]=await tx.$queryRaw`
        SELECT "id" FROM "CashShiftSession"
        WHERE "companyId"=${companyId} AND "storeId"=${storeId} AND "openedBy"=${credential.id} AND "status"='OPEN' LIMIT 1`;
      if(openShift)throw staffError(409,"STAFF_OPERATOR_OPEN_SHIFT","Κλείσε πρώτα την ανοικτή βάρδια του χειριστή.");
    }
    const changed=profile?await tx.$executeRaw`
      UPDATE "StoreOperatorProfile" SET "posAccess"=${enabled},"updatedAt"=NOW()
      WHERE "companyId"=${companyId} AND "storeId"=${storeId} AND "employeeId"=${employeeId}`
      :await tx.$executeRaw`
      INSERT INTO "StoreOperatorProfile" ("id","companyId","storeId","employeeId","posAccess","createdBy")
      VALUES (${crypto.randomUUID()},${companyId},${storeId},${employeeId},${enabled},${actorId})
      ON CONFLICT ("storeId","employeeId") DO NOTHING`;
    if(changed!==1)throw staffError(409,"STAFF_OPERATOR_PERMISSION_CHANGED","Η πρόσβαση POS άλλαξε. Ανανέωσε τη λίστα.");
    if(!enabled)await tx.$executeRaw`
      UPDATE "StoreOperatorSession" SET "revokedAt"=NOW()
      WHERE "companyId"=${companyId} AND "storeId"=${storeId} AND "operatorId"=${credential.id} AND "revokedAt" IS NULL`;
    await tx.$executeRaw`
      INSERT INTO "StoreOperatorAudit" ("id","companyId","storeId","operatorId","actorId","eventType","details")
      VALUES (${crypto.randomUUID()},${companyId},${storeId},${credential.id},${actorId},'OPERATOR_POS_ACCESS_UPDATED',
        CAST(${JSON.stringify({employeeId,before,enabled})} AS jsonb))`;
  });
  res.json({companyId,storeId,employeeId,enabled});
},delegatedPosAccess));

const delegatedPinReset="operator-profiles.reset-pin";
const pinResetBody=z.object({pin:z.string().regex(/^\d{4,8}$/)}).strict();

router.post("/stores/:storeId/employee-permissions/:employeeId/pin",delegatedPermissionsRoute(async(req,res)=>{
  const {companyId,id:actorId}=req.user,{storeId,employeeId}=req.params;
  const {pin}=pinResetBody.parse(req.body);
  const pinHash=await bcrypt.hash(pin,12);
  await prisma.$transaction(async tx=>{
    await requireStaffAction(tx,req,storeId,delegatedPinReset);
    const credential=await lockEmployeeOperator(tx,{companyId,storeId,employeeId,actorId});
    await tx.$executeRaw`
      UPDATE "StoreOperatorCredential" SET "pinHash"=${pinHash},"updatedAt"=NOW()
      WHERE "id"=${credential.id} AND "companyId"=${companyId} AND "storeId"=${storeId}`;
    await tx.$executeRaw`
      UPDATE "StoreOperatorSession" SET "revokedAt"=NOW()
      WHERE "companyId"=${companyId} AND "storeId"=${storeId} AND "operatorId"=${credential.id} AND "revokedAt" IS NULL`;
    await tx.$executeRaw`
      INSERT INTO "StoreOperatorAudit" ("id","companyId","storeId","operatorId","actorId","eventType","details")
      VALUES (${crypto.randomUUID()},${companyId},${storeId},${credential.id},${actorId},'OPERATOR_PIN_CHANGED',
        CAST(${JSON.stringify({employeeId})} AS jsonb))`;
  });
  res.json({companyId,storeId,employeeId,changed:true});
},delegatedPinReset));

const delegatedProvisioning="operator-profiles.create-employee";
const provisionBody=z.object({
  fullName:z.string().trim().min(2).max(160),
  initialPin:z.string().regex(/^\d{4,8}$/),
  requestId:z.string().uuid()
}).strict();

router.post("/stores/:storeId/employee-provisioning",delegatedPermissionsRoute(async(req,res)=>{
  const {companyId,id:actorId}=req.user,storeId=req.params.storeId;
  const {fullName,initialPin,requestId}=provisionBody.parse(req.body);
  const employeeId=crypto.createHash("sha256").update(JSON.stringify([companyId,storeId,actorId,requestId])).digest("hex");
  const pinHash=await bcrypt.hash(initialPin,12);
  const created=await prisma.$transaction(async tx=>{
    await requireStaffAction(tx,req,storeId,delegatedProvisioning);
    await tx.$queryRaw`SELECT 1 AS locked FROM pg_advisory_xact_lock(hashtextextended(${"pos-provision:"+employeeId},0))`;
    const existing=await tx.employee.findFirst({where:{id:employeeId,storeId},select:{fullName:true}});
    if(existing){
      const [credential]=await tx.$queryRaw`
        SELECT "pinHash" FROM "StoreOperatorCredential"
        WHERE "companyId"=${companyId} AND "storeId"=${storeId} AND "employeeId"=${employeeId} AND "createdBy"=${actorId}`;
      if(existing.fullName!==fullName||!credential?.pinHash||!await bcrypt.compare(initialPin,credential.pinHash)){
        throw staffError(409,"STAFF_OPERATOR_PROVISION_CONFLICT","Η ίδια αίτηση έχει ήδη χρησιμοποιηθεί με άλλα στοιχεία.");
      }
      return false;
    }
    await tx.employee.create({data:{id:employeeId,storeId,fullName,position:"Εργαζόμενος",active:true}});
    const credentialId=crypto.randomUUID();
    await tx.$executeRaw`
      INSERT INTO "StoreOperatorCredential" ("id","companyId","storeId","employeeId","displayName","role","pinHash","active","createdBy")
      VALUES (${credentialId},${companyId},${storeId},${employeeId},${fullName},'EMPLOYEE',${pinHash},TRUE,${actorId})`;
    await tx.$executeRaw`
      INSERT INTO "StoreOperatorProfile" ("id","companyId","storeId","employeeId","posAccess","createdBy")
      VALUES (${crypto.randomUUID()},${companyId},${storeId},${employeeId},FALSE,${actorId})`;
    await tx.$executeRaw`
      INSERT INTO "StoreOperatorAudit" ("id","companyId","storeId","operatorId","actorId","eventType","details")
      VALUES (${crypto.randomUUID()},${companyId},${storeId},${credentialId},${actorId},'OPERATOR_EMPLOYEE_PROVISIONED',
        jsonb_build_object('employeeId',${employeeId}::text,'posAccess',FALSE))`;
    return true;
  });
  res.status(created?201:200).json({companyId,storeId,employeeId});
},delegatedProvisioning));

export default router;
