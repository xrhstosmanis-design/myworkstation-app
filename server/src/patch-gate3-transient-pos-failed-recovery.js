import {readFile,writeFile} from "node:fs/promises";
import {fileURLToPath,pathToFileURL} from "node:url";

const TARGET=fileURLToPath(new URL("./routes/commerce-pos-v244.js",import.meta.url));

export function patchTransientPosFailedRecovery(source){
  let next=String(source);
  const selectBefore=`AND ("status" IN ('POS_QUEUED','POS_DRAFT_READY') OR ("status"='POS_PROCESSING' AND "updatedAt"<\${staleBefore}))`;
  const selectAfter=`AND ("status" IN ('POS_QUEUED','POS_DRAFT_READY','POS_FAILED') OR ("status"='POS_PROCESSING' AND "updatedAt"<\${staleBefore}))`;
  const handoffBefore=`if(!handoff||!Array.isArray(handoff.pageJobIds)||!handoff.pageJobIds.length)continue;\n      await prisma.$executeRaw\`UPDATE "AiReaderJob" SET "stage"='POS_RECOVERING',"status"='POS_QUEUED',"updatedAt"=CURRENT_TIMESTAMP WHERE "id"=\${job.id} AND "companyId"=\${req.user.companyId} AND "status" IN ('POS_QUEUED','POS_DRAFT_READY','POS_PROCESSING')\`;`;
  const handoffAfter=`if(!handoff||!Array.isArray(handoff.pageJobIds)||!handoff.pageJobIds.length)continue;\n      const storedBackgroundError=String(job.resultJson?.posBackground?.error||"");\n      if(job.status==="POS_FAILED"&&!isRetryableBackgroundError(storedBackgroundError))continue;\n      await prisma.$executeRaw\`UPDATE "AiReaderJob" SET "stage"='POS_RECOVERING',"status"='POS_QUEUED',"updatedAt"=CURRENT_TIMESTAMP WHERE "id"=\${job.id} AND "companyId"=\${req.user.companyId} AND "status" IN ('POS_QUEUED','POS_DRAFT_READY','POS_PROCESSING','POS_FAILED')\`;`;

  if(next.includes(selectBefore))next=next.replace(selectBefore,selectAfter);
  else if(!next.includes(selectAfter))throw new Error("Gate 3 recovery patch: fast-recover candidate query not found.");

  if(next.includes(handoffBefore))next=next.replace(handoffBefore,handoffAfter);
  else if(!next.includes(handoffAfter))throw new Error("Gate 3 recovery patch: fast-recover guard/update block not found.");

  return next;
}

export async function applyTransientPosFailedRecoveryPatch(){
  const source=await readFile(TARGET,"utf8");
  const patched=patchTransientPosFailedRecovery(source);
  if(patched!==source)await writeFile(TARGET,patched,"utf8");
}

if(process.argv[1]&&pathToFileURL(process.argv[1]).href===import.meta.url){
  await applyTransientPosFailedRecoveryPatch();
}
