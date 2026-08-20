import fs from "node:fs";
import path from "node:path";
import {fileURLToPath} from "node:url";

const here=path.dirname(fileURLToPath(import.meta.url));
const file=path.join(here,"routes/store-pos.js");
let source=fs.readFileSync(file,"utf8");

const oldSchema='const checkoutSchema=quoteSchema.extend({items:z.array(checkoutItemSchema).min(1).max(200),paymentMethod:z.enum(["CASH","CARD","IRIS","MIXED"]).optional(),payments:z.array(z.object({method:paymentMethodSchema,amount:z.coerce.number().positive()})).min(2).max(3).optional(),clientTransactionId:z.string().uuid().optional(),confirmDuplicate:z.coerce.boolean().optional().default(false)}).superRefine((value,ctx)=>{if(value.paymentMethod==="MIXED"&&!value.payments)ctx.addIssue({code:z.ZodIssueCode.custom,path:["payments"],message:"Η μικτή πληρωμή χρειάζεται ανάλυση ποσών."});if(value.payments&&value.paymentMethod!=="MIXED")ctx.addIssue({code:z.ZodIssueCode.custom,path:["paymentMethod"],message:"Η ανάλυση πληρωμών χρησιμοποιείται μόνο στη μικτή πληρωμή."});if(!value.paymentMethod)ctx.addIssue({code:z.ZodIssueCode.custom,path:["paymentMethod"],message:"Επιλέξτε τρόπο πληρωμής."})});';
const newSchema='const checkoutSchema=quoteSchema.extend({items:z.array(checkoutItemSchema).min(1).max(200),paymentMethod:z.enum(["CASH","CARD","IRIS","MIXED"]).optional(),payments:z.array(z.object({method:paymentMethodSchema,amount:z.coerce.number().positive()})).min(2).max(3).optional(),clientTransactionId:z.string().uuid().optional(),confirmDuplicate:z.coerce.boolean().optional().default(false),onlineOrderId:z.string().min(1).optional().nullable(),onlineOrderNumber:z.string().trim().max(50).optional().nullable(),onlineDeliveryFee:z.coerce.number().min(0).max(999).optional().default(0)}).superRefine((value,ctx)=>{if(value.paymentMethod==="MIXED"&&!value.payments)ctx.addIssue({code:z.ZodIssueCode.custom,path:["payments"],message:"Η μικτή πληρωμή χρειάζεται ανάλυση ποσών."});if(value.payments&&value.paymentMethod!=="MIXED")ctx.addIssue({code:z.ZodIssueCode.custom,path:["paymentMethod"],message:"Η ανάλυση πληρωμών χρησιμοποιείται μόνο στη μικτή πληρωμή."});if(!value.paymentMethod)ctx.addIssue({code:z.ZodIssueCode.custom,path:["paymentMethod"],message:"Επιλέξτε τρόπο πληρωμής."})});';
if(source.includes(oldSchema))source=source.replace(oldSchema,newSchema);
else if(!source.includes('onlineDeliveryFee:z.coerce.number()'))throw new Error("store-pos checkout schema anchor not found");

const oldSummary='requestedByProduct=new Map(body.items.map(item=>[item.productId,item])),items=resolvedItems.map(item=>{const requested=requestedByProduct.get(item.productId);if(requested?.unitPriceOverride===undefined||requested?.unitPriceOverride===null)return item;const unitPrice=round2(money(requested.unitPriceOverride));return {...item,unitPrice,effectiveUnitPrice:unitPrice,price:unitPrice,priceSource:"MANUAL",promotionId:null,promotionType:null,customerPoints:0,discount:0,lineTotal:round2(unitPrice*item.quantity),manualPrice:true,overrideReason:String(requested.overrideReason||"").trim()}}),summary=quoteSummary(items);';
const newSummary='items=resolvedItems.map((item,index)=>{const requested=body.items[index];if(requested?.unitPriceOverride===undefined||requested?.unitPriceOverride===null)return item;const unitPrice=round2(money(requested.unitPriceOverride));return {...item,unitPrice,effectiveUnitPrice:unitPrice,price:unitPrice,priceSource:"MANUAL",promotionId:null,promotionType:null,customerPoints:0,discount:0,lineTotal:round2(unitPrice*item.quantity),manualPrice:true,overrideReason:String(requested.overrideReason||"").trim()}}),itemSummary=quoteSummary(items),onlineDeliveryFee=round2(money(body.onlineDeliveryFee||0)),summary={subtotal:round2(itemSummary.subtotal+onlineDeliveryFee),discount:itemSummary.discount,total:round2(itemSummary.total+onlineDeliveryFee)};';
if(source.includes(oldSummary))source=source.replace(oldSummary,newSummary);
else if(!source.includes('onlineDeliveryFee=round2(money(body.onlineDeliveryFee||0))'))throw new Error("store-pos online summary anchor not found");

const saleAnchor="${summary.total},'COMPLETED','POS',${clientTransactionId}";
const saleReplacement="${summary.total},'COMPLETED',${body.onlineOrderId?'ONLINE_POS':'POS'},${clientTransactionId}";
if(source.includes(saleAnchor))source=source.replace(saleAnchor,saleReplacement);
else if(!source.includes("body.onlineOrderId?'ONLINE_POS':'POS'"))throw new Error("store-pos sale source anchor not found");

const paymentAnchor='      for(const payment of payments)await tx.$executeRaw`INSERT INTO "Payment" ("id","saleId","method","amount") VALUES (${crypto.randomUUID()},${saleId},${payment.method},${money(payment.amount)})`;';
const paymentReplacement='      if(onlineDeliveryFee>0)await tx.$executeRaw`INSERT INTO "SaleLine" ("id","saleId","productId","description","quantity","unitPrice","discount","vatRate","lineTotal") VALUES (${crypto.randomUUID()},${saleId},${null},${body.onlineOrderNumber?`Delivery Online · ${body.onlineOrderNumber}`:"Delivery Online Παραγγελίας"},1,${onlineDeliveryFee},0,24,${onlineDeliveryFee})`;\n'+paymentAnchor;
if(source.includes(paymentAnchor)&&!source.includes('Delivery Online · ${body.onlineOrderNumber}'))source=source.replace(paymentAnchor,paymentReplacement);
else if(!source.includes('Delivery Online · ${body.onlineOrderNumber}')&&!source.includes(paymentAnchor))throw new Error("store-pos delivery line anchor not found");

const cashDesc='${`POS πώληση ${saleId} · ΜΕΤΡΗΤΑ`}';
const cashNew='${body.onlineOrderNumber?`ONLINE ΠΑΡΑΓΓΕΛΙΑ ${body.onlineOrderNumber} · ΜΕΤΡΗΤΑ`:`POS πώληση ${saleId} · ΜΕΤΡΗΤΑ`}';
if(source.includes(cashDesc))source=source.replace(cashDesc,cashNew);
const cardDesc='${`POS πώληση ${saleId} · ΚΑΡΤΑ ${cardAmount.toFixed(2)} · IRIS ${irisAmount.toFixed(2)}`}';
const cardNew='${body.onlineOrderNumber?`ONLINE ΠΑΡΑΓΓΕΛΙΑ ${body.onlineOrderNumber} · ΚΑΡΤΑ ${cardAmount.toFixed(2)} · IRIS ${irisAmount.toFixed(2)}`:`POS πώληση ${saleId} · ΚΑΡΤΑ ${cardAmount.toFixed(2)} · IRIS ${irisAmount.toFixed(2)}`}';
if(source.includes(cardDesc))source=source.replace(cardDesc,cardNew);

const auditNeedle='customerId:customer?.id||null,items:items.map(item=>({productId:item.productId,name:item.name,quantity:item.quantity,unitPrice:item.unitPrice,lineTotal:item.lineTotal,priceSource:item.priceSource,overrideReason:item.overrideReason||null}))';
const auditReplacement='customerId:customer?.id||null,onlineOrderId:body.onlineOrderId||null,onlineOrderNumber:body.onlineOrderNumber||null,onlineDeliveryFee,items:items.map(item=>({productId:item.productId,name:item.name,quantity:item.quantity,unitPrice:item.unitPrice,lineTotal:item.lineTotal,priceSource:item.priceSource,overrideReason:item.overrideReason||null}))';
if(source.includes(auditNeedle))source=source.replace(auditNeedle,auditReplacement);

fs.writeFileSync(file,source);
console.log("Normal POS checkout extended for Online handoff, delivery fee and audit labeling.");
