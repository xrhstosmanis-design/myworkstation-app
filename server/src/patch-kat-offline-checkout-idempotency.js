import fs from "fs";

const path=new URL("./routes/store-pos-pilot-actions.js",import.meta.url);
let src=fs.readFileSync(path,"utf8");
const marker="KAT_OFFLINE_CHECKOUT_IDEMPOTENCY_V1";
if(src.includes(marker)){
  console.log("KAT offline checkout idempotency already installed.");
  process.exit(0);
}

const schemaAnchor='const checkoutSchema=z.object({items:z.array(itemSchema).min(1).max(200),customerId:z.string().min(1).optional().nullable(),paymentMethod:z.enum(["CASH","CARD","IRIS","MIXED"]),payments:z.array(z.object({method:paymentMethodSchema,amount:z.coerce.number().positive()})).min(2).max(3).optional()});';
if(!src.includes(schemaAnchor))throw new Error("Offline checkout idempotency anchor missing: checkoutSchema");
const schemaReplacement='const checkoutSchema=z.object({items:z.array(itemSchema).min(1).max(200),customerId:z.string().min(1).optional().nullable(),paymentMethod:z.enum(["CASH","CARD","IRIS","MIXED"]),payments:z.array(z.object({method:paymentMethodSchema,amount:z.coerce.number().positive()})).min(2).max(3).optional(),clientTransactionId:z.string().uuid().optional()}); // '+marker;
src=src.replace(schemaAnchor,schemaReplacement);

const parseAnchor='body=checkoutSchema.parse(req.body||{}),ids=[...new Set(body.items.map(x=>x.productId))],rows=';
if(!src.includes(parseAnchor))throw new Error("Offline checkout idempotency anchor missing: checkout parse");
const parseReplacement='body=checkoutSchema.parse(req.body||{}),existingSale=body.clientTransactionId?(await prisma.$queryRaw`SELECT "id","total","fiscalStatus" FROM "Sale" WHERE "id"=${body.clientTransactionId} AND "companyId"=${req.user.companyId} AND "storeId"=${store.id} LIMIT 1`)[0]:null;if(existingSale)return res.status(200).json({saleId:existingSale.id,total:money(existingSale.total),subtotal:money(existingSale.total),discount:0,paymentMethod:body.paymentMethod,payments:body.payments||[{method:body.paymentMethod,amount:money(existingSale.total)}],fiscalStatus:existingSale.fiscalStatus||"NON_FISCAL",idempotent:true});const ids=[...new Set(body.items.map(x=>x.productId))],rows=';
src=src.replace(parseAnchor,parseReplacement);

const saleIdAnchor='const saleId=crypto.randomUUID(),actor=req.user.fullName||"Πωλητής"';
if(!src.includes(saleIdAnchor))throw new Error("Offline checkout idempotency anchor missing: saleId");
src=src.replace(saleIdAnchor,'const saleId=body.clientTransactionId||crypto.randomUUID(),actor=req.user.fullName||"Πωλητής"');

fs.writeFileSync(path,src);
console.log("KAT offline checkout idempotency installed.");
