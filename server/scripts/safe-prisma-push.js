import {spawnSync} from "node:child_process";
import {PrismaClient} from "@prisma/client";

const prisma=new PrismaClient();

async function hasCoreSchema(){
  try{
    const rows=await prisma.$queryRawUnsafe(`SELECT 1 AS ok FROM information_schema.tables WHERE table_schema='public' AND table_name='Company' LIMIT 1`);
    return rows.length>0;
  }catch{
    return false;
  }
}

try{
  if(await hasCoreSchema()){
    console.log('[startup] Core schema already exists; skipping prisma db push to preserve bootstrap-managed tables');
  }else{
    console.log('[startup] Fresh database detected; running prisma db push');
    const result=spawnSync(process.platform==='win32'?'npx.cmd':'npx',['prisma','db','push'],{stdio:'inherit',cwd:new URL('../',import.meta.url)});
    if(result.status!==0)process.exit(result.status||1);
  }
}finally{
  await prisma.$disconnect();
}
