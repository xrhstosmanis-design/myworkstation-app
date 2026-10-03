import {prisma} from "./prisma.js";

const TARGET_REQUEST_ID="ab2e2a5a-127b-442d-97c9-8d739b1adf8c";

export async function clearKatStuckRbsRequest(){
  try{
    const changed=await prisma.$executeRaw`UPDATE "RbsCapDriverV1Request" SET "status"='DECLINED',"updatedAt"=NOW() WHERE "id"=${TARGET_REQUEST_ID} AND "storeId"='kat-store' AND "terminalPos"='KAT-POS-02' AND "paymentMethod"='CASH' AND "total"=1.20 AND "status"='DISPATCHED' AND "saleId" IS NULL`;
    if(changed)console.log("KAT RBS cleanup: cleared the known stuck 1.20 EUR dispatched request without fiscal resend.");
  }catch(error){
    if(error?.code==="P2010"&&error?.meta?.code==="42P01")return;
    throw error;
  }
}
