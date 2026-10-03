import {prisma} from "./prisma.js";

const TARGET_REQUEST_ID="c9c6aa5a-5dc3-4fc7-8b29-0728081952ca";

export async function clearKatStuckRbsRequest(){
  const changed=await prisma.$executeRaw`UPDATE "RbsCapDriverV1Request" SET "status"='DECLINED',"updatedAt"=NOW() WHERE "id"=${TARGET_REQUEST_ID} AND "storeId"='kat-store' AND "terminalPos"='KAT-POS-02' AND "paymentMethod"='CASH' AND "total"=1.20 AND "status"='DISPATCHED' AND "saleId" IS NULL`;
  if(changed)console.log("KAT RBS cleanup: cleared the known stuck 1.20 EUR dispatched request without fiscal resend.");
}
