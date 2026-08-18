import {readFile,writeFile} from "node:fs/promises";

const path=new URL("../src/routes/pos-sale-actions.js",import.meta.url);
const source=await readFile(path,"utf8");
const marker='      await tx.$executeRaw`UPDATE "Sale" SET "reversalState"=${body.kind},"reversedAt"=NOW(),"reversedBy"=${req.user.id},"reversedByName"=${who} WHERE "id"=${sale.id}`;';
const auditLine='      if(body.kind==="RETURN")await tx.$executeRaw`INSERT INTO "StoreTransaction" ("id","companyId","storeId","sessionId","type","amount","description","actorId","actorName") VALUES (${crypto.randomUUID()},${req.user.companyId},${store.id},${open.id},\'POS_RETURN\',${-money(sale.total)},${`ΟΛΙΚΗ ΕΠΙΣΤΡΟΦΗ · αρχική ${sale.id} · επιστροφή ${reversalId} · ${body.reason}`},${req.user.id},${who})`;\n';
if(source.includes("'POS_RETURN'")){
  console.log("[startup] explicit POS return audit already enabled");
}else{
  if(!source.includes(marker))throw new Error("POS return update marker changed; audit patch not applied.");
  await writeFile(path,source.replace(marker,auditLine+marker));
  console.log("[startup] explicit POS return audit enabled");
}
