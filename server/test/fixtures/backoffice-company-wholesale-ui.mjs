import * as c from '../../../shared/backoffice-staff-company-wholesale.mjs';
import {scalar} from './backoffice-company-party-control-ui.mjs';
const allWindow={limit:10000,kind:'COMPLETE_SOURCE'};
export function wholesaleFixture(path){const u=new URL(path,'https://isolated.invalid'),p=u.searchParams,s=u.pathname.slice(c.companyWholesalePrefix.length),root={scope:'COMPANY',companyId:'a'},page=Number(p.get('page')||1),paged={page,pageSize:50,total:1};
 if(s==='/stores')return{...root,items:[{id:'store',name:'Named wholesale store'}],count:1,window:allWindow};
 if(s==='/site')return{...root,site:{slug:'named-site',name:'Named wholesale site',enabled:false}};
 if(s==='/customers')return{...root,items:[scalar(c.wholesaleCustomerFields,{id:'customer',name:'Named wholesale customer',creditLimit:25,priceListId:'list',priceListName:'Named wholesale list',priceListActive:false})],count:1,window:allWindow};
 if(s==='/price-lists')return{...root,items:[scalar(c.wholesalePriceListFields,{id:'list',code:'B2B',name:'Named wholesale list',discountPercent:5})],count:1,window:allWindow};
 if(s==='/portal-accounts')return{...root,items:[scalar(c.wholesaleAccountFields,{id:'account',login:'visible-customer-login',customerId:'customer',storeId:'store',customerName:'Named wholesale customer',storeName:'Named wholesale store'})],count:1,window:allWindow};
 if(s==='/sellers')return{...root,q:p.get('q')||'',items:page===1?[scalar(c.wholesaleSellerFields,{id:'seller',fullName:'Named wholesale seller',email:'seller@example.invalid',role:'EMPLOYEE',memberActive:false})]:[],...paged};
 if(s.includes('/assignments'))return{...root,userId:'seller',storeId:p.get('storeId'),items:page===1?[scalar(c.wholesaleAssignmentFields,{id:'assignment',userId:'seller',storeId:'store',customerId:'customer',customerName:'Named wholesale customer',storeName:'Named wholesale store',active:false,revision:2})]:[],...paged};
 if(s==='/publications')return{...root,storeId:p.get('storeId'),q:p.get('q')||'',items:page===1?[scalar(c.wholesalePublicationFields,{id:'product',name:'Named published product',sku:'SKU',unit:'PCS',published:false})]:[],...paged};
 if(s.includes('/products'))return{...root,priceListId:'list',items:page===1?[scalar(c.wholesaleTierFields,{id:'tier',productId:'product',name:'Named tier product',minimumQuantity:1,unitPrice:1.2345,discountPercent:null,priceBasis:null,version:1})]:[],...paged};
 throw Error('Unexpected '+path)
}
