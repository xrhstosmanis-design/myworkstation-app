import crypto from "crypto";

export const EFOOD_SUPPORTED_WEBHOOK_STATUSES=new Set(["READY_FOR_PICKUP","CANCELLED","DELIVERED"]);
export const EFOOD_SANDBOX_BASE_URL="https://sandbox.partner.deliveryhero.io";

function canonicalize(value){
  if(Array.isArray(value))return value.map(canonicalize);
  if(value&&typeof value==="object")return Object.keys(value).sort().reduce((out,key)=>{out[key]=canonicalize(value[key]);return out},{});
  return value;
}
export function canonicalJson(value){return JSON.stringify(canonicalize(value))}
export function efoodPayloadHash(value){return crypto.createHash("sha256").update(canonicalJson(value),"utf8").digest("hex")}

function text(value){return typeof value==="string"&&value.trim()?value.trim():typeof value==="number"?String(value):null}
function firstText(...values){for(const value of values){const parsed=text(value);if(parsed)return parsed}return null}
function upper(value){return firstText(value)?.toUpperCase().replace(/[\s-]+/g,"_")||null}
function nested(source,...path){let value=source;for(const key of path){if(!value||typeof value!=="object")return null;value=value[key]}return value}
function productRefs(payload){
  const candidates=[payload?.items,nested(payload,"order","items"),nested(payload,"data","items"),nested(payload,"data","order","items")];
  const items=candidates.find(Array.isArray)||[];
  return items.map(item=>({externalProductId:firstText(item?.id,item?.product_id,item?.productId,item?.sku,item?.external_id,item?.externalId),externalSku:firstText(item?.sku,item?.external_sku,item?.externalSku,item?.barcode),name:firstText(item?.name,item?.title,item?.product_name,item?.productName),quantity:Number(item?.quantity??item?.qty??1)})).filter(item=>item.externalProductId||item.externalSku||item.name);
}

export function normalizeEfoodWebhook(payload){
  if(!payload||typeof payload!=="object"||Array.isArray(payload))throw Object.assign(new Error("Το efood webhook payload πρέπει να είναι JSON object."),{status:400,code:"INVALID_PAYLOAD"});
  const status=upper(firstText(payload.status,payload.order_status,payload.orderStatus,payload.event_type,payload.eventType,nested(payload,"event","status"),nested(payload,"order","status"),nested(payload,"data","status"),nested(payload,"data","order","status")));
  const externalOrderId=firstText(payload.order_id,payload.orderId,payload.order_uuid,payload.orderUuid,payload.uuid,nested(payload,"order","id"),nested(payload,"order","uuid"),nested(payload,"data","order_id"),nested(payload,"data","orderId"),nested(payload,"data","order","id"),nested(payload,"data","order","uuid"));
  if(!status)throw Object.assign(new Error("Λείπει η κατάσταση παραγγελίας από το efood webhook."),{status:400,code:"MISSING_STATUS"});
  if(!externalOrderId)throw Object.assign(new Error("Λείπει το αναγνωριστικό παραγγελίας από το efood webhook."),{status:400,code:"MISSING_ORDER_ID"});
  const externalEventId=firstText(payload.event_id,payload.eventId,nested(payload,"event","id"),nested(payload,"data","event_id"),nested(payload,"data","eventId"));
  const providerStoreId=firstText(payload.store_id,payload.storeId,payload.vendor_id,payload.vendorId,nested(payload,"store","id"),nested(payload,"vendor","id"),nested(payload,"order","store_id"),nested(payload,"order","vendor_id"),nested(payload,"data","store_id"),nested(payload,"data","vendor_id"));
  const externalPartnerConfigId=firstText(payload.external_partner_config_id,payload.externalPartnerConfigId,nested(payload,"order","external_partner_config_id"),nested(payload,"data","external_partner_config_id"));
  const payloadHash=efoodPayloadHash(payload);
  return {status,externalOrderId,externalEventId,providerStoreId,externalPartnerConfigId,supported:EFOOD_SUPPORTED_WEBHOOK_STATUSES.has(status),productRefs:productRefs(payload),payloadHash,idempotencyKey:externalEventId?`event:${externalEventId}`:`order:${externalOrderId}:status:${status}`};
}

function numeric(value,label,{min=0,max=100000000}={}){const parsed=Number(value);if(!Number.isFinite(parsed)||parsed<min||parsed>max)throw Object.assign(new Error(`Μη έγκυρο ${label}.`),{status:400});return Math.round(parsed*10000)/10000}
function requiredText(value,label,max=300){const parsed=firstText(value);if(!parsed||parsed.length>max)throw Object.assign(new Error(`Μη έγκυρο ${label}.`),{status:400});return parsed}

export function buildEfoodCatalogPreview(input={}){
  const vendorId=requiredText(input.vendorId,"Vendor ID");
  if(!Array.isArray(input.products)||!input.products.length||input.products.length>5000)throw Object.assign(new Error("Απαιτείται λίστα 1–5000 προϊόντων για την προεπισκόπηση καταλόγου."),{status:400});
  const products=input.products.map((item,index)=>({externalProductId:requiredText(item?.externalProductId||item?.sku,`κωδικός προϊόντος στη γραμμή ${index+1}`),name:requiredText(item?.name,`όνομα προϊόντος στη γραμμή ${index+1}`),price:numeric(item?.price,`τιμή στη γραμμή ${index+1}`),available:item?.available!==false,stock:item?.stock==null?null:numeric(item.stock,`stock στη γραμμή ${index+1}`)}));
  const request={vendorId,products};return {kind:"CATALOG",operation:"CATALOG_PUT_PREVIEW",environment:"SANDBOX",request,requestHash:efoodPayloadHash(request),externalCall:false,providerContractPending:true};
}
export function buildEfoodPromoPreview(input={}){
  const vendorId=requiredText(input.vendorId,"Vendor ID");
  if(!Array.isArray(input.promotions)||!input.promotions.length||input.promotions.length>1000)throw Object.assign(new Error("Απαιτείται λίστα 1–1000 προσφορών για την προεπισκόπηση."),{status:400});
  const promotions=input.promotions.map((item,index)=>({externalPromotionId:requiredText(item?.externalPromotionId||item?.id,`κωδικός προσφοράς στη γραμμή ${index+1}`),externalProductId:requiredText(item?.externalProductId||item?.sku,`κωδικός προϊόντος στη γραμμή ${index+1}`),title:requiredText(item?.title||item?.name,`τίτλος προσφοράς στη γραμμή ${index+1}`),active:item?.active!==false,price:item?.price==null?null:numeric(item.price,`τιμή προσφοράς στη γραμμή ${index+1}`),discountPercent:item?.discountPercent==null?null:numeric(item.discountPercent,`ποσοστό έκπτωσης στη γραμμή ${index+1}`,{max:100})}));
  const request={vendorId,promotions};return {kind:"PROMO",operation:"PROMO_PUT_PREVIEW",environment:"SANDBOX",request,requestHash:efoodPayloadHash(request),externalCall:false,providerContractPending:true};
}
export function buildEfoodOrderRecoveryPreview(input={}){
  const vendorId=requiredText(input.vendorId,"Vendor ID"),from=new Date(input.from),to=new Date(input.to);
  if(Number.isNaN(from.getTime())||Number.isNaN(to.getTime())||from>to)throw Object.assign(new Error("Μη έγκυρο χρονικό διάστημα ανάκτησης παραγγελιών."),{status:400});
  if(to-from>60*24*60*60*1000)throw Object.assign(new Error("Η προεπισκόπηση ανάκτησης δεν επιτρέπει διάστημα μεγαλύτερο από 60 ημέρες."),{status:400});
  const request={vendorId,externalPartnerConfigId:firstText(input.externalPartnerConfigId),from:from.toISOString(),to:to.toISOString()};return {kind:"ORDERS",operation:"ORDER_RECOVERY_GET_PREVIEW",environment:"SANDBOX",request,requestHash:efoodPayloadHash(request),externalCall:false,providerContractPending:true};
}
