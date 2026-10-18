import crypto from 'node:crypto';
import {Prisma} from '@prisma/client';
import {z} from 'zod';

const MANAGERS=new Set(['SUPER_ADMIN','OWNER','ADMIN','MANAGER']);
const SCALE4=10000n,RATE_SCALE=100000n,MAX_CENTS=999999999999999999n;
const MAX_QUANTITY=1000000n*SCALE4,MAX_UNIT=99999999999999n;
const identifier=z.string().trim().min(1).max(200);

export function wholesaleError(status,code,message){return Object.assign(new Error(message),{status,code})}
export function assertWholesaleManager(ctx){
  if(!ctx||!MANAGERS.has(ctx.role)||ctx.tokenType!=='BACKOFFICE_USER'||ctx.channel!=='BACKOFFICE'||!String(ctx.companyId||'').trim()||!String(ctx.actorId||'').trim())throw wholesaleError(403,'WHOLESALE_ACCESS_DENIED','Wholesale management access required.');
}

function fixed(value,scale,code='INVALID_PRICE'){
  const text=String(value??'');
  if(text.length>40||!new RegExp(`^(?:0|[1-9]\\d*)(?:\\.\\d{1,${scale}})?$`).test(text))throw wholesaleError(400,code,'Invalid decimal value.');
  const [whole,fraction='']=text.split('.');return BigInt(whole)*10n**BigInt(scale)+BigInt(fraction.padEnd(scale,'0'));
}
function decimal(value,scale){const divisor=10n**BigInt(scale);return `${value/divisor}.${String(value%divisor).padStart(scale,'0')}`}
function round(numerator,denominator){return (numerator+denominator/2n)/denominator}
function quantity(value){const amount=fixed(value,4,'INVALID_QUANTITY');if(amount<=0n||amount>MAX_QUANTITY)throw wholesaleError(400,'INVALID_QUANTITY','Quantity must be positive and no greater than 1000000.');return decimal(amount,4)}

export const quoteInputSchema=z.object({
  customerId:identifier,storeId:identifier,
  items:z.array(z.object({productId:identifier,quantity:z.string().max(40).transform((value,ctx)=>{try{return quantity(value)}catch{ctx.addIssue({code:z.ZodIssueCode.custom,message:'Invalid positive decimal quantity.'});return z.NEVER}})}).strict()).min(1).max(100)
}).strict().superRefine((body,ctx)=>{const ids=new Set();for(const [index,item] of body.items.entries()){if(ids.has(item.productId))ctx.addIssue({code:z.ZodIssueCode.custom,path:['items',index,'productId'],message:'Duplicate products are not allowed.'});ids.add(item.productId)}});
export function normalizeQuoteInput(body){const parsed=quoteInputSchema.safeParse(body);if(!parsed.success)throw wholesaleError(400,'INVALID_QUOTE_INPUT','Check the customer, store and unique product quantities.');return parsed.data}

// The caller supplies the transaction. SHARE locks protect the rows checked in
// that transaction's snapshot; they do not promise serializable tier insertion.
export async function buildWholesaleQuote(db,ctx,body,{lock=false}={}){
  assertWholesaleManager(ctx);const input=normalizeQuoteInput(body),share=lock?Prisma.sql`FOR SHARE`:Prisma.empty;
  const stores=await db.$queryRaw(Prisma.sql`SELECT s."id",s."name" FROM "Store" s JOIN "Company" c ON c."id"=s."companyId" AND c."active"=true WHERE s."id"=${input.storeId} AND s."companyId"=${ctx.companyId} AND s."active"=true ${share}`);
  if(!stores[0])throw wholesaleError(404,'WHOLESALE_STORE_NOT_FOUND','Active wholesale store not found.');
  const customers=await db.$queryRaw(Prisma.sql`SELECT c."id",c."name" FROM "WholesaleCustomer" c JOIN "Company" co ON co."id"=c."companyId" AND co."active"=true WHERE c."id"=${input.customerId} AND c."companyId"=${ctx.companyId} AND c."active"=true ${share}`);
  if(!customers[0])throw wholesaleError(404,'WHOLESALE_CUSTOMER_NOT_FOUND','Active wholesale customer not found.');
  const lists=await db.$queryRaw(Prisma.sql`SELECT l."id",l."name" FROM "WholesaleCustomerPriceList" a JOIN "WholesalePriceList" l ON l."id"=a."priceListId" AND l."companyId"=a."companyId" AND l."active"=true WHERE a."customerId"=${input.customerId} AND a."companyId"=${ctx.companyId} ${share}`);
  if(!lists[0])throw wholesaleError(409,'WHOLESALE_PRICE_LIST_REQUIRED','An active assigned wholesale price list is required.');
  const priceListId=lists[0].id,ids=input.items.map(item=>item.productId),quantities=input.items.map(item=>item.quantity);
  const products=await db.$queryRaw(Prisma.sql`SELECT p."id",p."sku",p."name",p."unit",p."vatRate" FROM "Product" p JOIN "StoreProduct" sp ON sp."productId"=p."id" AND sp."storeId"=${input.storeId} AND sp."active"=true WHERE p."companyId"=${ctx.companyId} AND p."active"=true AND p."id"=ANY(${ids}::text[]) ${share}`);
  if(products.length!==ids.length)throw wholesaleError(400,'WHOLESALE_PRODUCT_UNAVAILABLE','Every product must be active in this company and store.');
  const tiers=await db.$queryRaw(Prisma.sql`SELECT tier.* FROM UNNEST(${ids}::text[],${quantities}::numeric[]) AS requested("productId","quantity") JOIN LATERAL (SELECT t."id",t."productId",t."minimumQuantity",t."unitPrice",t."discountPercent",t."priceBasis",t."version" FROM "WholesalePriceListProduct" t WHERE t."companyId"=${ctx.companyId} AND t."priceListId"=${priceListId} AND t."productId"=requested."productId" AND t."minimumQuantity"<=requested."quantity" ORDER BY t."minimumQuantity" DESC,t."id" LIMIT 1 ${share}) tier ON true`);
  const byProduct=new Map(products.map(product=>[product.id,product])),byTier=new Map(tiers.map(tier=>[tier.productId,tier]));
  let net=0n,vat=0n,gross=0n;
  const items=input.items.map(item=>{
    const product=byProduct.get(item.productId),tier=byTier.get(item.productId);
    if(!tier)throw wholesaleError(409,'WHOLESALE_PRICE_REQUIRED','No eligible wholesale quantity tier is configured.');
    if(tier.priceBasis!=='NET'&&tier.priceBasis!=='GROSS')throw wholesaleError(409,'WHOLESALE_PRICE_BASIS_REQUIRED','The selected wholesale price must explicitly state NET or GROSS.');
    if(tier.unitPrice==null)throw wholesaleError(409,'WHOLESALE_FIXED_PRICE_REQUIRED','An explicit fixed wholesale unit price is required.');
    if(tier.discountPercent!=null&&fixed(tier.discountPercent,3)!==0n)throw wholesaleError(409,'WHOLESALE_AMBIGUOUS_PRICE','A fixed wholesale tier cannot also contain a nonzero discount.');
    const price=fixed(tier.unitPrice,4),amount=fixed(item.quantity,4),rate=fixed(product.vatRate,3,'INVALID_VAT_RATE'),minimum=fixed(tier.minimumQuantity,4),version=Number(tier.version);
    if(price>MAX_UNIT||rate>100000n||minimum<=0n||minimum>amount||!Number.isSafeInteger(version)||version<1||!String(product.unit||'').trim())throw wholesaleError(409,'WHOLESALE_INVALID_PRICING_DATA','The configured wholesale price, unit, VAT or version is invalid.');
    let lineNet,lineVat,lineGross;
    if(tier.priceBasis==='NET'){lineNet=round(price*amount,1000000n);lineVat=round(lineNet*rate,RATE_SCALE);lineGross=lineNet+lineVat}
    else{lineGross=round(price*amount,1000000n);lineNet=round(lineGross*RATE_SCALE,RATE_SCALE+rate);lineVat=lineGross-lineNet}
    net+=lineNet;vat+=lineVat;gross+=lineGross;
    if(net>MAX_CENTS||vat>MAX_CENTS||gross>MAX_CENTS)throw wholesaleError(400,'WHOLESALE_TOTAL_TOO_LARGE','Wholesale totals exceed the supported monetary limit.');
    return {productId:product.id,name:product.name,sku:product.sku??null,unit:product.unit,quantity:item.quantity,priceListId,tierId:tier.id,sourceUnitPrice:decimal(price,4),sourcePriceBasis:tier.priceBasis,minimumQuantity:decimal(minimum,4),priceVersion:version,vatRate:decimal(rate,3),netTotal:decimal(lineNet,2),vatTotal:decimal(lineVat,2),grossTotal:decimal(lineGross,2)};
  });
  const quote={currency:'EUR',customerId:input.customerId,customerName:customers[0].name,storeId:input.storeId,items,totals:{net:decimal(net,2),vat:decimal(vat,2),gross:decimal(gross,2)},creditChecked:false};
  // This digest is a revalidation/version checksum, never an authorization token.
  const quoteId=crypto.createHash('sha256').update(JSON.stringify({companyId:ctx.companyId,actorId:ctx.actorId,role:ctx.role,channel:ctx.channel,quote})).digest('hex');
  return {quoteId,...quote};
}
