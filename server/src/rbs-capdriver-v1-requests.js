let schemaReady;

export async function ensureRbsCapDriverV1RequestSchema(db){
  if(!schemaReady){
    schemaReady=(async()=>{
      await db.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS "RbsCapDriverV1Request" (
        "id" TEXT PRIMARY KEY,
        "companyId" TEXT NOT NULL,
        "storeId" TEXT NOT NULL,
        "terminalPos" TEXT NOT NULL,
        "clientTransactionId" TEXT NOT NULL,
        "requestHash" TEXT NOT NULL,
        "checkoutJson" JSONB NOT NULL DEFAULT '{}'::jsonb,
        "paymentMethod" TEXT NOT NULL CHECK ("paymentMethod" IN ('CASH','CARD')),
        "total" NUMERIC(14,2) NOT NULL,
        "commandText" TEXT NOT NULL,
        "commandHash" TEXT NOT NULL,
        "status" TEXT NOT NULL DEFAULT 'PREPARED' CHECK ("status" IN ('PREPARED','CLAIMED','DISPATCHED','OPERATOR_CONFIRMED','DECLINED','REQUIRES_CHECK','SALE_COMMITTED')),
        "claimedByDeviceId" TEXT,
        "claimedAt" TIMESTAMPTZ,
        "dispatchedAt" TIMESTAMPTZ,
        "operatorId" TEXT,
        "operatorOutcome" TEXT,
        "saleId" TEXT,
        "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        UNIQUE ("storeId","clientTransactionId")
      )`);
      await db.$executeRawUnsafe(`ALTER TABLE "RbsCapDriverV1Request" ADD COLUMN IF NOT EXISTS "checkoutJson" JSONB NOT NULL DEFAULT '{}'::jsonb`);
      await db.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "RbsCapDriverV1Request_queue_idx" ON "RbsCapDriverV1Request" ("storeId","status","createdAt")`);
    })().catch(error=>{schemaReady=undefined;throw error});
  }
  return schemaReady;
}

export function rbsCapDriverV1RequestView(row){
  return row?{id:row.id,storeId:row.storeId,terminalPos:row.terminalPos,clientTransactionId:row.clientTransactionId,paymentMethod:row.paymentMethod,total:Number(row.total||0),status:row.status,createdAt:row.createdAt,dispatchedAt:row.dispatchedAt,operatorOutcome:row.operatorOutcome,saleId:row.saleId,checkout:row.checkoutJson||null}:null;
}

export function rbsCapDriverV1DispatchTransition(status,result){
  if(status!=="CLAIMED")throw new Error("Only a claimed CAP Driver request can be acknowledged");
  if(result==="WRITTEN")return "DISPATCHED";
  if(result==="UNCERTAIN")return "REQUIRES_CHECK";
  throw new Error("Unsupported CAP Driver dispatch result");
}
