import crypto from "node:crypto";
import {z} from "zod";
import {assertWholesaleManager,buildWholesaleQuote,normalizeQuoteInput,wholesaleError} from "./wholesale-pricing.js";

const orderInput=z.object({
  clientOrderId:z.string().uuid().transform(value=>value.toLowerCase()),
  customerId:z.unknown(),storeId:z.unknown(),items:z.unknown(),
  quoteId:z.string().regex(/^[a-f0-9]{64}$/),
  notes:z.string().trim().max(2000).default("")
}).strict();

export function normalizeWholesaleOrderInput(input){
  const body=orderInput.parse(input);
  const quote=normalizeQuoteInput({customerId:body.customerId,storeId:body.storeId,items:body.items});
  return {...quote,clientOrderId:body.clientOrderId,quoteId:body.quoteId,notes:body.notes};
}

const fingerprint=(body,channel)=>crypto.createHash("sha256").update(JSON.stringify({
  customerId:body.customerId,storeId:body.storeId,items:body.items,
  quoteId:body.quoteId,notes:body.notes,channel
})).digest("hex");

function amount(value){
  const text=String(value),match=/^(\d+)(?:\.(\d{1,2}))?$/.exec(text);
  if(!match)throw wholesaleError(500,"ORDER_AMOUNT_INVALID","Stored wholesale order requires review.");
  return `${match[1]}.${(match[2]||"").padEnd(2,"0")}`;
}

function accepted(row,replayed){
  const order={id:row.id,customerId:row.customerId,storeId:row.storeId,actorId:row.actorId,
    channel:row.channel,status:row.status,quoteId:row.quoteId,
    snapshot:typeof row.snapshot==="string"?JSON.parse(row.snapshot):row.snapshot,
    netTotal:amount(row.netTotal),vatTotal:amount(row.vatTotal),grossTotal:amount(row.grossTotal),
    clientOrderId:row.clientOrderId,createdAt:row.createdAt};
  return {orderId:row.id,status:row.status,replayed,order};
}

async function authorizeCurrentScope(tx,ctx,body){
  // Replays deliberately validate current access without repricing the accepted
  // order. Shared locks keep deactivation/tenant moves outside this transaction.
  const companies=await tx.$queryRaw`SELECT "id" FROM "Company" WHERE "id"=${ctx.companyId} AND "active"=true LIMIT 1 FOR SHARE`;
  if(!companies[0])throw wholesaleError(404,"WHOLESALE_SCOPE_NOT_FOUND","Wholesale company is unavailable.");
  const stores=await tx.$queryRaw`SELECT "id" FROM "Store" WHERE "id"=${body.storeId} AND "companyId"=${ctx.companyId} AND "active"=true LIMIT 1 FOR SHARE`;
  if(!stores[0])throw wholesaleError(404,"WHOLESALE_SCOPE_NOT_FOUND","Wholesale store is unavailable.");
  const customers=await tx.$queryRaw`SELECT "id" FROM "WholesaleCustomer" WHERE "id"=${body.customerId} AND "companyId"=${ctx.companyId} AND "active"=true LIMIT 1 FOR SHARE`;
  if(!customers[0])throw wholesaleError(404,"WHOLESALE_SCOPE_NOT_FOUND","Wholesale customer is unavailable.");
}

function postgresCode(error){return String(error?.meta?.code||error?.code||"")}
function retryable(error){return error?.wholesaleKeyRace===true||error?.code==="P2034"||["40001","40P01"].includes(postgresCode(error))}

export async function createWholesaleOrder(db,ctx,input){
  assertWholesaleManager(ctx);
  // Only the verified backoffice adapter is implemented. Future site/seller
  // principals must not gain access by selecting their own source in JSON.
  if(ctx.channel!=="BACKOFFICE")throw wholesaleError(403,"WHOLESALE_CHANNEL_DENIED","Wholesale order source is not supported.");
  const body=normalizeWholesaleOrderInput(input),requestHash=fingerprint(body,ctx.channel);
  for(let attempt=0;attempt<3;attempt++){
    try{
      return await db.$transaction(async tx=>{
        assertWholesaleManager(ctx);
        const lockKey=JSON.stringify(["wholesale-order",ctx.companyId,ctx.actorId,body.clientOrderId]);
        // ReadCommitted gives the lookup below a fresh statement snapshot after
        // this lock resolves, including a predecessor accepted while we waited.
        await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${lockKey},0))::text AS "locked"`;
        await authorizeCurrentScope(tx,ctx,body);
        const existing=await tx.$queryRaw`SELECT * FROM "WholesaleOrderRequest" WHERE "companyId"=${ctx.companyId} AND "actorId"=${ctx.actorId} AND "clientOrderId"=${body.clientOrderId} LIMIT 1`;
        if(existing[0]){
          if(existing[0].requestHash!==requestHash)throw wholesaleError(409,"IDEMPOTENCY_CONFLICT","This order key was already used with different details.");
          if(existing[0].storeId!==body.storeId||existing[0].customerId!==body.customerId||existing[0].channel!==ctx.channel)throw wholesaleError(409,"ORDER_SCOPE_CONFLICT","The original order scope requires review.");
          // There is no cancellation/deletion API in this slice. Fail closed if
          // a future state or tombstone is encountered; never recreate the order.
          if(existing[0].status!=="SUBMITTED")throw wholesaleError(409,"ORDER_STATE_CONFLICT","The original order requires review.");
          return accepted(existing[0],true);
        }
        // SHARE locks retain each checked master, assignment, product/membership
        // and selected tier. Pricing is coherent at the final batched tier read;
        // a higher tier inserted afterwards does not rewrite this accepted quote.
        const quote=await buildWholesaleQuote(tx,ctx,{customerId:body.customerId,storeId:body.storeId,items:body.items},{lock:true});
        if(quote.quoteId!==body.quoteId){
          const error=wholesaleError(409,"PRICE_CHANGED","Prices changed. Review the refreshed quote before submitting.");
          error.details={quote};throw error;
        }
        const id=crypto.randomUUID(),snapshot=JSON.stringify(quote);
        let rows;
        try{
          rows=await tx.$queryRaw`INSERT INTO "WholesaleOrderRequest" ("id","companyId","storeId","customerId","actorId","channel","clientOrderId","requestHash","quoteId","status","revision","snapshot","notes","netTotal","vatTotal","grossTotal") VALUES (${id},${ctx.companyId},${body.storeId},${body.customerId},${ctx.actorId},${ctx.channel},${body.clientOrderId},${requestHash},${body.quoteId},'SUBMITTED',1,${snapshot}::jsonb,${body.notes},${quote.totals.net}::numeric,${quote.totals.vat}::numeric,${quote.totals.gross}::numeric) RETURNING *`;
        }catch(error){
          // Retain bounded recovery for a request-key unique race or external
          // writer. Do not retry arbitrary event errors or business rejections.
          if(postgresCode(error)==="23505"||error?.code==="P2002")error.wholesaleKeyRace=true;
          throw error;
        }
        const details=JSON.stringify({status:"SUBMITTED",revision:1,channel:ctx.channel,clientOrderId:body.clientOrderId,quoteId:body.quoteId,customerId:body.customerId,storeId:body.storeId,totals:quote.totals,creditChecked:false});
        await tx.$executeRaw`INSERT INTO "WholesaleOrderEvent" ("id","companyId","orderId","actorId","eventType","details") VALUES (${crypto.randomUUID()},${ctx.companyId},${id},${ctx.actorId},'ORDER_SUBMITTED',${details}::jsonb)`;
        return accepted(rows[0],false);
      },{isolationLevel:"ReadCommitted",timeout:15000,maxWait:5000});
    }catch(error){if(attempt===2||!retryable(error))throw error}
  }
}
