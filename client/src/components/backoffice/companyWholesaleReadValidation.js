import * as c from '../../../../shared/backoffice-staff-company-wholesale.mjs';
import {exact,shape} from './companyInventoryReportValidation.js';
import {financialScalarValid} from './ownerFinancialReadValidation.js';
const rows=(items,fields,max=10000)=>Array.isArray(items)&&items.length<=max&&items.every(row=>financialScalarValid(row,fields)&&row.id)&&new Set(items.map(row=>row.id)).size===items.length;
const root=(d,ctx,keys)=>exact(d,['scope','companyId',...keys])&&d.scope==='COMPANY'&&d.companyId===ctx.companyId;
const full=(d,ctx,fields)=>root(d,ctx,['items','count','window'])&&shape(d.window,{limit:'i',kind:'s'})&&d.window.limit===10000&&d.window.kind==='COMPLETE_SOURCE'&&rows(d.items,fields)&&d.count===d.items.length;
const paged=(d,ctx,fields,echoes)=>root(d,ctx,[...echoes,'items','total','page','pageSize'])&&shape({total:d.total,page:d.page,pageSize:d.pageSize},{total:'i',page:'i',pageSize:'i'})&&d.page===ctx.page&&d.pageSize===50&&rows(d.items,fields,50)&&d.items.length===Math.min(50,Math.max(0,d.total-(ctx.page-1)*50));
export function companyWholesaleReadValid(d,ctx){switch(ctx.kind){
 case 'customers':return full(d,ctx,c.wholesaleCustomerFields)&&d.items.every(row=>row.creditLimit>=0&&row.paymentTermsDays>=0&&(row.priceListId===null?row.priceListName===null&&row.priceListActive===null:row.priceListName!==null&&row.priceListActive!==null));
 case 'lists':return full(d,ctx,c.wholesalePriceListFields)&&d.items.every(row=>row.discountPercent>=0&&row.discountPercent<=100);
 case 'accounts':return full(d,ctx,c.wholesaleAccountFields);
 case 'stores':return full(d,ctx,{id:'text',name:'text'});
 case 'site':return root(d,ctx,['site'])&&(d.site===null||financialScalarValid(d.site,c.wholesaleSiteFields)&&/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(d.site.slug)&&d.site.slug.length>=3&&d.site.slug.length<=63);
 case 'tiers':return paged(d,ctx,c.wholesaleTierFields,['priceListId'])&&d.priceListId===ctx.priceListId&&d.items.every(row=>row.minimumQuantity>0&&row.version>=1&&(row.unitPrice===null||row.unitPrice>=0)&&(row.discountPercent===null||row.discountPercent>=0&&row.discountPercent<=100)&&[null,'NET','GROSS'].includes(row.priceBasis));
 case 'publications':return paged(d,ctx,c.wholesalePublicationFields,['storeId','q'])&&d.storeId===ctx.storeId&&d.q===ctx.q;
 case 'sellers':return paged(d,ctx,c.wholesaleSellerFields,['q'])&&d.q===ctx.q;
 case 'assignments':return paged(d,ctx,c.wholesaleAssignmentFields,['userId','storeId'])&&d.userId===ctx.userId&&d.storeId===ctx.storeId&&d.items.every(row=>row.userId===ctx.userId&&row.storeId===ctx.storeId);
 default:return false;
}}
