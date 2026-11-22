import {Router} from "express";
import crypto from "node:crypto";
import {z} from "zod";
import {prisma} from "../prisma.js";
import {requireStaffAction,staffError} from "../services/backoffice-staff-access.js";
import {POS_MENU_PERMISSIONS,POS_PERMISSIONS} from "../../../shared/pos-operator-permissions.mjs";

const router=Router();
const delegatedOperatorPermission = "operator-profiles.manage-permissions";
const operatorPermissionKeys = [...POS_PERMISSIONS,...POS_MENU_PERMISSIONS].map(([key])=>key);
const isMenuPermission = key=>key==="orders";
const permissionEnabled = (profile,key)=>isMenuPermission(key)?profile?.backofficeMenu?.orders===true:Boolean(profile?.permissions?.[key]);
const permissionChange = z.object({
  key:z.enum(operatorPermissionKeys), enabled:z.boolean(), expected:z.boolean()
}).strict();

function delegatedPermissionsRoute(handler){
  return async(req,res,next)=>{
    try{
      if(req.user?.staffAccess!==true)throw staffError();
      await requireStaffAction(prisma,req,req.params.storeId,delegatedOperatorPermission);
      await handler(req,res);
    }catch(error){
      if(error?.name==="ZodError")return res.status(400).json({error:"Μη έγκυρη αλλαγή δικαιώματος."});
      next(error);
    }
  };
}

router.get("/stores/:storeId/employee-permissions",delegatedPermissionsRoute(async(req,res)=>{
  const {companyId,id:actorId}=req.user,storeId=req.params.storeId;
  const rows=await prisma.$queryRaw`
    SELECT c."employeeId",c."displayName",p."permissions",p."backofficeMenu"
    FROM "StoreOperatorCredential" c
    JOIN "Employee" e ON e."id"=c."employeeId" AND e."storeId"=c."storeId"
    LEFT JOIN "StoreOperatorProfile" p ON p."employeeId"=c."employeeId" AND p."storeId"=c."storeId" AND p."companyId"=c."companyId"
    WHERE c."companyId"=${companyId} AND c."storeId"=${storeId} AND c."role"='EMPLOYEE'
      AND c."active"=true AND e."active"=true AND e."userId" IS DISTINCT FROM ${actorId}
    ORDER BY c."displayName",c."employeeId"`;
  await requireStaffAction(prisma,req,storeId,delegatedOperatorPermission);
  res.json({companyId,storeId,items:rows.map(row=>({
    employeeId:row.employeeId,displayName:row.displayName,
    permissions:Object.fromEntries(operatorPermissionKeys.map(key=>[key,permissionEnabled(row,key)]))
  }))});
}));

router.patch("/stores/:storeId/employee-permissions/:employeeId",delegatedPermissionsRoute(async(req,res)=>{
  const {companyId,id:actorId}=req.user,{storeId,employeeId}=req.params;
  const {key,enabled,expected}=permissionChange.parse(req.body);
  await prisma.$transaction(async tx=>{
    await requireStaffAction(tx,req,storeId,delegatedOperatorPermission);
    const [credential]=await tx.$queryRaw`
      SELECT c."id" FROM "StoreOperatorCredential" c
      JOIN "Employee" e ON e."id"=c."employeeId" AND e."storeId"=c."storeId"
      WHERE c."companyId"=${companyId} AND c."storeId"=${storeId} AND c."employeeId"=${employeeId}
        AND c."role"='EMPLOYEE' AND c."active"=true AND e."active"=true AND e."userId" IS DISTINCT FROM ${actorId}
      FOR UPDATE OF c,e`;
    if(!credential)throw staffError(404,"STAFF_OBJECT_NOT_FOUND","Δεν βρέθηκε ενεργός χειριστής στο κατάστημα.");
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

export default router;
