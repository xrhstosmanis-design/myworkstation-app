import {randomUUID} from "node:crypto";
import {Router} from "express";
import {z} from "zod";
import {prisma} from "../prisma.js";
import {requireCompanyModule} from "../middleware/module-access.js";
import {ensureMyDataBranchSchema,readMyDataBranchForStore} from "../services/mydata-store-branch.js";
import {lifecycleContext} from "../services/store-lifecycle-context.js";
import {assertLifecycleMutation} from "../services/store-lifecycle-generation.js";

const router=Router();
const path="/documents/mydata/branch";
const storeIdSchema=z.string().min(1).max(160);
const branchSchema=z.number().int().min(0).max(2147483647).nullable();
const settingsSchema=z.object({storeId:storeIdSchema,branch:branchSchema,expectedBranch:branchSchema}).strict();
const error=(message,status,code)=>Object.assign(new Error(message),{status,code});

function requireOwner(req,res,next){
  const user=req.user;
  if(user?.tokenType!=="BACKOFFICE_USER"||user.role!=="OWNER"||user.staffAccess||user.isSuperAdmin||user.supportContext){
    return res.status(403).json({error:"Τον κωδικό εγκατάστασης myDATA τον ορίζει ο Ιδιοκτήτης."});
  }
  next();
}

async function requireStoreIntegration(db,companyId,storeId){
  const [store]=await db.$queryRaw`SELECT "id" FROM "Store" WHERE "companyId"=${companyId} AND "id"=${storeId} AND "active"=true FOR SHARE`;
  if(!store)throw error("Δεν βρέθηκε το ενεργό κατάστημα.",404,"MYDATA_BRANCH_STORE_NOT_FOUND");
  const [integration]=await db.$queryRaw`
    SELECT "id" FROM "StoreIntegrationCredential" WHERE "companyId"=${companyId} AND "storeId"=${storeId} AND "kind"='MYDATA'
  `;
  if(!integration)throw error("Ρύθμισε πρώτα τη σύνδεση myDATA για το κατάστημα.",409,"MYDATA_BRANCH_INTEGRATION_REQUIRED");
}

router.get(path,requireOwner,requireCompanyModule("DOCUMENTS"),async(req,res,next)=>{
  try{
    const {storeId}=z.object({storeId:storeIdSchema}).strict().parse(req.query);
    const {companyId}=req.user;
    await ensureMyDataBranchSchema();
    await requireStoreIntegration(prisma,companyId,storeId);
    res.set("Cache-Control","private, no-store");
    res.json({storeId,branch:await readMyDataBranchForStore(prisma,companyId,storeId)});
  }catch(cause){next(cause)}
});

router.put(path,requireOwner,requireCompanyModule("DOCUMENTS"),async(req,res,next)=>{
  try{
    const {storeId,branch,expectedBranch}=settingsSchema.parse(req.body);
    const {companyId,id,email}=req.user;
    await ensureMyDataBranchSchema();
    await prisma.$transaction(async tx=>{
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`mydata-branch-map:${companyId}`},0)) IS NULL AS locked`;
      await assertLifecycleMutation(tx,{companyId,storeId},lifecycleContext()[storeId]);
      await requireStoreIntegration(tx,companyId,storeId);
      const previous=await readMyDataBranchForStore(tx,companyId,storeId);
      if(previous===branch)return;
      if(previous!==expectedBranch)throw error("Η αντιστοίχιση άλλαξε. Άνοιξε ξανά τη ρύθμιση.",409,"MYDATA_BRANCH_STALE");
      if(branch!==null){
        const [other]=await tx.$queryRaw`
          SELECT "storeId" FROM "StoreIntegrationCredential"
          WHERE "companyId"=${companyId} AND "kind"='MYDATA' AND "storeId"<>${storeId}
            AND "metadataJson"->'myDataRecipientBranch'=to_jsonb(${branch}::integer)
        `;
        if(other)throw error("Ο κωδικός εγκατάστασης αντιστοιχεί ήδη σε άλλο κατάστημα της εταιρείας.",409,"MYDATA_BRANCH_IN_USE");
      }
      const changed=await tx.$executeRaw`
        UPDATE "StoreIntegrationCredential"
        SET "metadataJson"=(CASE WHEN ${branch}::integer IS NULL
          THEN "metadataJson"-'myDataRecipientBranch'
          ELSE jsonb_set("metadataJson",'{myDataRecipientBranch}',to_jsonb(${branch}::integer)) END)
          - 'myDataReceivingContinuation'
          || jsonb_build_object('myDataBranchRoutingEnabled',true,'myDataBranchMappingRevision',${randomUUID()}::text)
        WHERE "companyId"=${companyId} AND "storeId"=${storeId} AND "kind"='MYDATA'
      `;
      if(changed!==1)throw error("Η σύνδεση myDATA άλλαξε. Άνοιξε ξανά τη ρύθμιση.",409,"MYDATA_BRANCH_STALE");
      await tx.authAudit.create({data:{
        userId:id,email:email||"owner",
        event:`MYDATA_BRANCH_MAPPING_CHANGED:${companyId}:${storeId}:${previous??"unassigned"}:${branch??"unassigned"}`,
        success:true
      }});
    });
    res.json({storeId,branch});
  }catch(cause){next(cause)}
});

export default router;
