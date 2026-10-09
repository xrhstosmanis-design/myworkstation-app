import {prisma} from "../prisma.js";
import {CREDIT_DEFAULTS} from "./ai-credit-monitor.js";

let ready;
async function ensureTable(){
  if(!ready)ready=prisma.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS "PlatformAiCreditMonitor" ("id" TEXT PRIMARY KEY,"settings" JSONB NOT NULL,"version" INTEGER NOT NULL DEFAULT 0,"updatedBy" TEXT,"updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW())`).catch(error=>{ready=null;throw error});
  await ready;
}
export const aiCreditRepository={
  async read(){
    await ensureTable();
    const rows=await prisma.$queryRaw`SELECT "settings","version" FROM "PlatformAiCreditMonitor" WHERE "id"='OPENAI_ORGANIZATION'`;
    return rows[0]?{...CREDIT_DEFAULTS,...rows[0].settings,version:rows[0].version}:{...CREDIT_DEFAULTS};
  },
  async save(settings,version,actor){
    await ensureTable();
    await prisma.$transaction(async tx=>{
      await tx.$executeRaw`INSERT INTO "PlatformAiCreditMonitor" ("id","settings") VALUES ('OPENAI_ORGANIZATION','{}'::jsonb) ON CONFLICT ("id") DO NOTHING`;
      const changed=await tx.$executeRaw`UPDATE "PlatformAiCreditMonitor" SET "settings"=${JSON.stringify(settings)}::jsonb,"version"="version"+1,"updatedBy"=${actor.id},"updatedAt"=NOW() WHERE "id"='OPENAI_ORGANIZATION' AND "version"=${version}`;
      if(changed!==1)throw Object.assign(new Error("CREDIT_SETTINGS_CONFLICT"),{code:"CREDIT_SETTINGS_CONFLICT",status:409});
      await tx.authAudit.create({data:{userId:actor.id,email:actor.email||"super-admin",event:"AI_CREDIT_MONITOR_CONFIGURED",success:true,deviceName:`Όρια AI ${settings.warningUsd}/${settings.criticalUsd} USD${settings.baselineAt?" · βάση υπολοίπου":""}`}});
    });
  }
};
