import {isIP} from 'node:net';
import {companyConfigurationRequest,companyParameterFields,companyParameterSecretFields} from '../../../shared/backoffice-staff-company-configuration.mjs';
import {staffError} from './backoffice-staff-access.js';
import {companyModuleState} from '../middleware/module-access.js';
import {moduleCatalog} from './module-catalog.js';
const bad=()=>{throw staffError(503,'STAFF_CONFIGURATION_DATA_INVALID')};
const invalid=()=>{throw staffError(400,'STAFF_CONFIGURATION_QUERY_INVALID')};
const text=(v,nullable=false,max=10000)=>{if(nullable&&v===null)return null;if(typeof v!=='string'||v.length>max||/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(v))bad();return v};
const bool=v=>{if(typeof v!=='boolean')bad();return v};
const number=(v,{integer=false,min=-Number.MAX_SAFE_INTEGER,max=Number.MAX_SAFE_INTEGER,nullable=false}={})=>{if(nullable&&v===null)return null;if(typeof v!=='number'||!Number.isFinite(v)||v<min||v>max||integer&&!Number.isSafeInteger(v))bad();return v};
const iso=v=>{if(!(v instanceof Date)&&typeof v!=='string')bad();const d=new Date(v);if(!Number.isFinite(d.getTime()))bad();return d.toISOString()};
const bound=(r,max=10000)=>{if(!Array.isArray(r)||r.length>max)throw staffError(503,'STAFF_CONFIGURATION_LIMIT');return r};
const object=v=>{if(!v||typeof v!=='object'||Array.isArray(v)||![Object.prototype,null].includes(Object.getPrototypeOf(v)))bad();return v};
const item=r=>({id:text(r.id),sequence:number(r.sequence,{integer:true,min:0,max:999999}),description:text(r.description),price:number(r.price,{min:-999999,max:999999}),costNet:number(r.costNet,{min:0,max:999999}),active:bool(r.active)});
const group=r=>({id:text(r.id),description:text(r.description),active:bool(r.active)});
const configured=v=>v!==null&&v!==undefined&&typeof v==='string'&&v.length>0;
const relationColumns={
 ManagementPosTerminal:['id','companyId','bankId','name','tid','paymentMethodCode','iris','helperField1','deferredCode','helperField3','ipAddress','port','onlineMiddleware','notes','active','createdAt','updatedAt'],ManagementBank:['id','companyId','name','internalCode'],
 ManagementModifierGroup:['id','companyId','legacyId','description','active'],ManagementModifier:['id','companyId','groupId','sequence','description','price','costNet','active'],ModifierInventoryPrice:['companyId','storeId','modifierId','productId'],
 Product:['id','companyId','sku','name','active','salePrice'],Store:['id','companyId','name','active'],StoreProduct:['storeId','productId','active','salePrice'],
 PreparationProductSettings:['companyId','productId','preparationEnabled','environmentalFee','productionStation','autoPrint'],PreparationRecipeLine:['id','companyId','productId','ingredientProductId','quantity','unit','automatic'],PreparationProductModifierGroup:['id','companyId','productId','groupId','required','minSelections','maxSelections','sequence'],PreparationModifierConsumption:['id','companyId','modifierId','ingredientProductId','quantity','unit','multiplierMode'],ManagementParameters:['companyId','settings','woltPasswordEnc','efoodPasswordEnc','aadePasswordEnc','managerPinEnc']
};
async function relations(db,tables){
 const rows=await db.$queryRaw`SELECT table_name AS "tableName",column_name AS "columnName" FROM information_schema.columns WHERE table_schema=current_schema() AND table_name=ANY(${tables}::text[])`;
 if(!Array.isArray(rows)||tables.some(table=>relationColumns[table].some(column=>!rows.some(row=>row.tableName===table&&row.columnName===column))))throw staffError(503,'STAFF_CONFIGURATION_SCHEMA_UNAVAILABLE');
}
export function companyConfigurationFilters(query,route){
 if(!route||!query||typeof query!=='object'||Array.isArray(query))invalid();const keys=Reflect.ownKeys(query);
 if(route.capability==='modifier-inventory-prices.read'){if(keys.length!==1||keys[0]!=='storeId'||typeof query.storeId!=='string'||!query.storeId||query.storeId.length>160||query.storeId.trim()!==query.storeId||/[\u0000-\u001f\u007f]/.test(query.storeId))invalid();return {storeId:query.storeId}}
 if(keys.length)invalid();return {};
}
export async function readCompanyConfiguration(db,companyId,capability,path,query={}){
 const route=companyConfigurationRequest('GET',path);if(route?.capability!==capability)throw staffError();const f=companyConfigurationFilters(query,route);let data;
 try{
  if(capability==='pos-terminals.read')data=await terminals(db,companyId);
  else if(capability==='modifiers.read')data=route.groupId?await modifiers(db,companyId,route.groupId):await groups(db,companyId);
  else if(capability==='modifier-inventory-prices.read')data=await inventoryPrices(db,companyId,route.groupId,f.storeId);
  else if(capability==='preparation-catalog.read')data=await catalog(db,companyId);
  else if(capability==='preparation-product.read')data=await productPreparation(db,companyId,route.productId);
  else if(capability==='modifier-consumption.read')data=await consumption(db,companyId,route.modifierId);
  else if(capability==='license-status.read')data=await license(db,companyId);
  else data=await parameters(db,companyId,route.section);
 }catch(error){if(['42P01','42703'].includes(error.code)||['42P01','42703'].includes(error.meta?.code))throw staffError(503,'STAFF_CONFIGURATION_SCHEMA_UNAVAILABLE');throw error}
 return {scope:'COMPANY',companyId,...data};
}
async function terminals(db,c){
 await relations(db,['ManagementPosTerminal','ManagementBank']);
 const rows=await db.$queryRaw`SELECT t."id",t."name",b."id" AS "bankId",b."name" AS "bankName",b."internalCode" AS "bankInternalCode",(b."id" IS NULL) AS "bankUnavailable",t."tid",t."paymentMethodCode",t."iris",t."deferredCode",t."ipAddress",t."port",t."onlineMiddleware",(COALESCE(t."helperField1",'')<>'') AS "helperField1Configured",(COALESCE(t."helperField3",'')<>'') AS "helperField3Configured",(COALESCE(t."notes",'')<>'') AS "notesConfigured",t."active",t."createdAt",t."updatedAt" FROM "ManagementPosTerminal" t LEFT JOIN "ManagementBank" b ON b."id"=t."bankId" AND b."companyId"=t."companyId" WHERE t."companyId"=${c} AND t."active"=true ORDER BY COALESCE(b."name",''),t."name",t."id" LIMIT 10001`;
 const items=bound(rows).map(r=>{const address=text(r.ipAddress,true,120),v={id:text(r.id),name:text(r.name),bankId:text(r.bankId,true),bankName:text(r.bankName,true),bankInternalCode:text(r.bankInternalCode,true),bankUnavailable:bool(r.bankUnavailable),tid:text(r.tid,true,80),paymentMethodCode:text(r.paymentMethodCode),iris:bool(r.iris),deferredCode:text(r.deferredCode,true,80),ipAddress:address&&isIP(address)?address:null,ipAddressConfigured:Boolean(address),port:number(r.port,{integer:true,min:1,max:65535,nullable:true}),onlineMiddleware:bool(r.onlineMiddleware),helperField1Configured:bool(r.helperField1Configured),helperField3Configured:bool(r.helperField3Configured),notesConfigured:bool(r.notesConfigured),active:bool(r.active),createdAt:iso(r.createdAt),updatedAt:iso(r.updatedAt)};if(!v.active||v.bankUnavailable&&(v.bankId!==null||v.bankName!==null||v.bankInternalCode!==null))bad();return v});return {items,count:items.length,window:{limit:10000}};
}
async function groups(db,c){
 await relations(db,['ManagementModifierGroup','ManagementModifier']);
 const rows=await db.$queryRaw`SELECT g."id",g."legacyId",g."description",g."active",COUNT(m."id") FILTER(WHERE m."active"=true)::int AS "modifierCount" FROM "ManagementModifierGroup" g LEFT JOIN "ManagementModifier" m ON m."groupId"=g."id" AND m."companyId"=g."companyId" WHERE g."companyId"=${c} GROUP BY g."id" ORDER BY COALESCE(g."legacyId",2147483647),g."description",g."id" LIMIT 10001`;
 const items=bound(rows).map(r=>({...group(r),legacyId:number(r.legacyId,{integer:true,min:0,max:999999,nullable:true}),modifierCount:number(r.modifierCount,{integer:true,min:0})}));return {items,count:items.length,window:{limit:10000}};
}
async function ownedGroup(db,c,id){const rows=await db.$queryRaw`SELECT "id","description","active" FROM "ManagementModifierGroup" WHERE "id"=${id} AND "companyId"=${c} LIMIT 2`;if(rows.length!==1||rows[0].id!==id)throw staffError(404,'STAFF_CONFIGURATION_GROUP_NOT_FOUND');return group(rows[0])}
async function modifierRows(db,c,id){const rows=await db.$queryRaw`SELECT m."id",m."sequence",m."description",m."price"::double precision AS price,m."costNet"::double precision AS "costNet",m."active" FROM "ManagementModifier" m JOIN "ManagementModifierGroup" g ON g."id"=m."groupId" AND g."companyId"=m."companyId" WHERE m."groupId"=${id} AND m."companyId"=${c} ORDER BY m."sequence",m."description",m."id" LIMIT 10001`;return bound(rows).map(item)}
async function modifiers(db,c,id){await relations(db,['ManagementModifierGroup','ManagementModifier']);const selected=await ownedGroup(db,c,id),items=await modifierRows(db,c,id);await ownedGroup(db,c,id);return {group:selected,items,count:items.length,window:{limit:10000}}}
async function ownedStore(db,c,id){const rows=await db.$queryRaw`SELECT "id","name" FROM "Store" WHERE "id"=${id} AND "companyId"=${c} AND "active"=true LIMIT 2`;if(rows.length!==1||rows[0].id!==id)throw staffError(404,'STAFF_CONFIGURATION_STORE_NOT_FOUND');return {id:text(rows[0].id),name:text(rows[0].name)}}
async function inventoryPrices(db,c,id,storeId){
 await relations(db,['ManagementModifierGroup','ManagementModifier','ModifierInventoryPrice','Product','Store','StoreProduct']);const selected=await ownedGroup(db,c,id),store=await ownedStore(db,c,storeId),base=await modifierRows(db,c,id);
 const raw=await db.$queryRaw`SELECT l."modifierId",p."id" AS "productId",p."name",p."sku",CASE WHEN p."active"=true AND sp."active"=true THEN COALESCE(sp."salePrice",p."salePrice") END::double precision AS "inventoryPrice" FROM "ModifierInventoryPrice" l JOIN "ManagementModifier" m ON m."id"=l."modifierId" AND m."companyId"=l."companyId" AND m."groupId"=${id} JOIN "ManagementModifierGroup" g ON g."id"=m."groupId" AND g."companyId"=m."companyId" LEFT JOIN "Product" p ON p."id"=l."productId" AND p."companyId"=l."companyId" LEFT JOIN "StoreProduct" sp ON sp."productId"=p."id" AND sp."storeId"=l."storeId" WHERE l."companyId"=${c} AND l."storeId"=${storeId} ORDER BY l."modifierId" LIMIT 10001`;
 const links=new Map();for(const row of bound(raw)){text(row.modifierId);if(links.has(row.modifierId)||!base.some(m=>m.id===row.modifierId))bad();links.set(row.modifierId,row)}
 const items=base.map(m=>{const link=links.get(m.id),unavailable=Boolean(link&&(link.productId===null||link.inventoryPrice===null||typeof link.inventoryPrice!=='number'||!Number.isFinite(link.inventoryPrice)||link.inventoryPrice<0));return {id:m.id,sequence:m.sequence,description:m.description,costNet:m.costNet,active:m.active,fixedPrice:m.price,price:link?(unavailable?null:number(link.inventoryPrice)):m.price,priceSource:link?'INVENTORY':'FIXED',inventoryUnavailable:unavailable,inventoryProductId:link?text(link.productId,true):null,inventoryProductName:link&&link.productId!==null?text(link.name,true):null,inventoryProductSku:link&&link.productId!==null?text(link.sku,true):null}});
 await ownedGroup(db,c,id);await ownedStore(db,c,storeId);return {group:selected,store,items,count:items.length,window:{limit:10000}};
}
async function catalog(db,c){
 await relations(db,['ManagementModifierGroup','ManagementModifier','Product']);
 const groupRows=await db.$queryRaw`SELECT "id","description","active" FROM "ManagementModifierGroup" WHERE "companyId"=${c} AND "active"=true ORDER BY "description","id" LIMIT 10001`;
 const modifierData=await db.$queryRaw`SELECT m."id",m."groupId",m."description",m."price"::double precision AS price,m."sequence",m."active" FROM "ManagementModifier" m JOIN "ManagementModifierGroup" g ON g."id"=m."groupId" AND g."companyId"=m."companyId" AND g."active"=true WHERE m."companyId"=${c} AND m."active"=true ORDER BY m."sequence",m."description",m."id" LIMIT 10001`;
 const ingredientData=await db.$queryRaw`SELECT "id","sku","name" FROM "Product" WHERE "companyId"=${c} AND "active"=true AND "sku" LIKE 'MWS-PREP-%' ORDER BY "name","id" LIMIT 10001`;
 const groups=bound(groupRows).map(r=>({...group(r),items:[]})),byId=new Map(groups.map(g=>[g.id,g]));for(const g of groups)if(!g.active)bad();
 for(const r of bound(modifierData)){const selected=byId.get(r.groupId);if(!selected)bad();const v={id:text(r.id),description:text(r.description),price:number(r.price,{min:-999999,max:999999}),sequence:number(r.sequence,{integer:true,min:0,max:999999}),active:bool(r.active)};if(!v.active)bad();selected.items.push(v)}
 const ingredients=bound(ingredientData).map(r=>{const v={id:text(r.id),sku:text(r.sku),name:text(r.name)};if(!v.sku.startsWith('MWS-PREP-'))bad();return v});return {groups,ingredients,window:{groupLimit:10000,itemLimit:10000,ingredientLimit:10000}};
}
async function ownedProduct(db,c,id){const rows=await db.$queryRaw`SELECT "id","name","sku" FROM "Product" WHERE "id"=${id} AND "companyId"=${c} LIMIT 2`;if(rows.length!==1||rows[0].id!==id)throw staffError(404,'STAFF_CONFIGURATION_PRODUCT_NOT_FOUND');return {id:text(rows[0].id),name:text(rows[0].name),sku:text(rows[0].sku,true)}}
const units=new Set(['PCS','GR','ML']);
function ingredient(r){const unavailable=r.ingredientProductId===null,v={id:text(r.id),ingredientProductId:text(r.ingredientProductId,true),ingredientName:unavailable?null:text(r.ingredientName),ingredientSku:unavailable?null:text(r.ingredientSku,true),ingredientUnavailable:unavailable,quantity:number(r.quantity,{min:0}),unit:text(r.unit)};if(!units.has(v.unit))bad();return v}
async function productPreparation(db,c,id){
 await relations(db,['Product','PreparationProductSettings','PreparationRecipeLine','PreparationProductModifierGroup','ManagementModifierGroup']);const product=await ownedProduct(db,c,id);
 const settingsRows=await db.$queryRaw`SELECT "preparationEnabled","environmentalFee"::double precision AS "environmentalFee","productionStation","autoPrint" FROM "PreparationProductSettings" WHERE "companyId"=${c} AND "productId"=${id} LIMIT 2`;
 if(settingsRows.length>1)bad();const raw=settingsRows[0],settings=raw?{preparationEnabled:bool(raw.preparationEnabled),environmentalFee:number(raw.environmentalFee,{min:0,max:100}),productionStation:text(raw.productionStation,true,120),autoPrint:bool(raw.autoPrint)}:{preparationEnabled:false,environmentalFee:0,productionStation:null,autoPrint:true};
 const recipeData=await db.$queryRaw`SELECT r."id",p."id" AS "ingredientProductId",p."name" AS "ingredientName",p."sku" AS "ingredientSku",r."quantity"::double precision AS quantity,r."unit",r."automatic" FROM "PreparationRecipeLine" r LEFT JOIN "Product" p ON p."id"=r."ingredientProductId" AND p."companyId"=r."companyId" WHERE r."companyId"=${c} AND r."productId"=${id} ORDER BY p."name",r."id" LIMIT 10001`;
 const groupData=await db.$queryRaw`SELECT pg."id",g."id" AS "groupId",g."description" AS "groupName",pg."required",pg."minSelections",pg."maxSelections",pg."sequence" FROM "PreparationProductModifierGroup" pg LEFT JOIN "ManagementModifierGroup" g ON g."id"=pg."groupId" AND g."companyId"=pg."companyId" WHERE pg."companyId"=${c} AND pg."productId"=${id} ORDER BY pg."sequence",g."description",pg."id" LIMIT 10001`;
 const recipe=bound(recipeData).map(r=>({...ingredient(r),automatic:bool(r.automatic)}));const groups=bound(groupData).map(r=>{const unavailable=r.groupId===null,v={id:text(r.id),groupId:text(r.groupId,true),groupName:unavailable?null:text(r.groupName),groupUnavailable:unavailable,required:bool(r.required),minSelections:number(r.minSelections,{integer:true,min:0,max:20}),maxSelections:number(r.maxSelections,{integer:true,min:1,max:20}),sequence:number(r.sequence,{integer:true,min:0,max:999})};if(v.minSelections>v.maxSelections)bad();return v});
 await ownedProduct(db,c,id);return {product,settings,settingsConfigured:Boolean(raw),recipe,groups,window:{recipeLimit:10000,groupLimit:10000}};
}
async function ownedModifier(db,c,id){const rows=await db.$queryRaw`SELECT m."id",m."description",g."id" AS "groupId",g."description" AS "groupName" FROM "ManagementModifier" m JOIN "ManagementModifierGroup" g ON g."id"=m."groupId" AND g."companyId"=m."companyId" WHERE m."id"=${id} AND m."companyId"=${c} LIMIT 2`;if(rows.length!==1||rows[0].id!==id)throw staffError(404,'STAFF_CONFIGURATION_MODIFIER_NOT_FOUND');return {id:text(rows[0].id),description:text(rows[0].description),groupId:text(rows[0].groupId),groupName:text(rows[0].groupName)}}
async function consumption(db,c,id){
 await relations(db,['ManagementModifier','ManagementModifierGroup','PreparationModifierConsumption','Product']);const modifier=await ownedModifier(db,c,id);
 const data=await db.$queryRaw`SELECT r."id",p."id" AS "ingredientProductId",p."name" AS "ingredientName",p."sku" AS "ingredientSku",r."quantity"::double precision AS quantity,r."unit",r."multiplierMode" FROM "PreparationModifierConsumption" r LEFT JOIN "Product" p ON p."id"=r."ingredientProductId" AND p."companyId"=r."companyId" WHERE r."companyId"=${c} AND r."modifierId"=${id} ORDER BY p."name",r."id" LIMIT 10001`;
 const rows=bound(data).map(r=>{const v={...ingredient(r),multiplierMode:text(r.multiplierMode)};if(!['FIXED','MULTIPLIER'].includes(v.multiplierMode))bad();return v});await ownedModifier(db,c,id);return {modifier,rows,count:rows.length,window:{limit:10000}};
}
async function license(db,c){
 const state=await companyModuleState(c,{db});if(!state||state.id!==c)throw staffError(404,'STAFF_CONFIGURATION_COMPANY_NOT_FOUND');if(state.active!==true)throw staffError();
 const allowed=new Set(moduleCatalog.map(m=>m.key)),activeModules=state.activeModules.filter(key=>allowed.has(key)),active=new Set(activeModules);
 return {company:{id:text(state.id),name:text(state.name)},licenseStatus:text(state.licenseStatus),licenseAllowed:bool(state.licenseAllowed),subscriptionEndsAt:state.subscriptionEndsAt===null?null:iso(state.subscriptionEndsAt),activeModules,superAdminBypass:false,modules:moduleCatalog.map(m=>({key:m.key,name:m.name,active:active.has(m.key)}))};
}
function settingValue(value,spec){
 if(spec.type==='boolean')return bool(value);
 if(spec.type==='number')return number(value,{min:spec.min,max:spec.max});
 if(spec.type==='enum'){if(!spec.values.includes(value))bad();return value}
 if(spec.type==='text'){const result=text(value,spec.nullable,spec.max);if(result!==null&&(result.trim()!==result||result.length<(spec.min??0)))bad();return result}
 if(spec.type==='bank-accounts'){if(!Array.isArray(value)||value.length>spec.maxItems)bad();return value.map(v=>{object(v);const result={};for(const [key,max]of [['name',180],['iban',80]])if(Object.hasOwn(v,key)){const descriptor=Object.getOwnPropertyDescriptor(v,key);if(!Object.hasOwn(descriptor,'value'))bad();result[key]=text(descriptor.value,false,max);if(result[key].trim()!==result[key])bad()}return result})}
 bad();
}
function urlStatus(raw,max){if(raw!==null&&typeof raw!=='string')bad();if(raw!==null&&raw.length>max)bad();const configured=typeof raw==='string'&&raw.length>0;let origin=null;if(configured){try{const url=new URL(raw);if(['http:','https:'].includes(url.protocol))origin=url.origin}catch{}}return {configured,origin}}
async function parameters(db,c,section){
 const contract=companyParameterFields[section];if(!contract)throw staffError();await relations(db,['ManagementParameters']);
 const rows=await db.$queryRaw`SELECT "settings"->${section} AS "sectionSettings",CASE WHEN ${section}='edelivery' THEN COALESCE("woltPasswordEnc",'')<>'' ELSE NULL END AS "woltPasswordConfigured",CASE WHEN ${section}='edelivery' THEN COALESCE("efoodPasswordEnc",'')<>'' ELSE NULL END AS "efoodPasswordConfigured",CASE WHEN ${section}='pos' THEN COALESCE("managerPinEnc",'')<>'' ELSE NULL END AS "managerPinConfigured",CASE WHEN ${section}='other' THEN COALESCE("aadePasswordEnc",'')<>'' ELSE NULL END AS "aadePasswordConfigured" FROM "ManagementParameters" WHERE "companyId"=${c} LIMIT 2`;
 if(rows.length>1)bad();const row=rows[0],source=row?.sectionSettings,configured=source!==undefined&&source!==null;if(configured)object(source);const settings={};
 for(const [key,spec]of Object.entries(contract)){if(!configured||!Object.hasOwn(source,key))continue;const descriptor=Object.getOwnPropertyDescriptor(source,key);if(!Object.hasOwn(descriptor,'value'))bad();const value=descriptor.value;
  if(spec.type==='url-status'){const status=urlStatus(value,spec.max);settings[key+'Configured']=status.configured;settings[key+'Origin']=status.origin}
  else if(spec.type==='configured-status'){if(value!==null)text(value,false,spec.max);settings[key+'Configured']=typeof value==='string'&&value.length>0}
  else settings[key]=settingValue(value,spec);
 }
 const secrets={};for(const key of companyParameterSecretFields[section]||[])secrets[key]=row?bool(row[key]):false;
 let companyDefaults={};
 if(section==='business'){
  const source=await db.$queryRaw`SELECT "name","taxId","city","phone" FROM "Company" WHERE "id"=${c} LIMIT 2`;
  if(source.length!==1)throw staffError(404,'STAFF_CONFIGURATION_COMPANY_NOT_FOUND');const company=source[0];
  companyDefaults={name:text(company.name),taxId:text(company.taxId,true),city:text(company.city,true),phone:text(company.phone,true)};
 }else if(section==='email'){
  const source=await db.$queryRaw`SELECT "email" FROM "Company" WHERE "id"=${c} LIMIT 2`;
  if(source.length!==1)throw staffError(404,'STAFF_CONFIGURATION_COMPANY_NOT_FOUND');companyDefaults={businessEmail:text(source[0].email,true)};
 }
 return {section,rowExists:Boolean(row),configured,settings,secrets,companyDefaults};
}
