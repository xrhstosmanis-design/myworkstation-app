import {companyConfigurationPrefix as prefix,companyParameterFields,companyParameterSecretFields} from '../../../shared/backoffice-staff-company-configuration.mjs';
const stamp='2026-01-02T12:00:00.000Z';
const root={scope:'COMPANY',companyId:'a'};
export function parameterConfigurationFixture(section,{configured=true,rowExists=true}={}){
 const settings={};if(configured)for(const [key,f]of Object.entries(companyParameterFields[section])){
  if(f.type==='text')settings[key]=key==='name'?'Company <img onerror=bad>':key==='ccEmails'?'owner@company.invalid':null;
  if(f.type==='boolean')settings[key]=false;
  if(f.type==='number')settings[key]=f.min;
  if(f.type==='enum')settings[key]=f.values[0];
  if(f.type==='bank-accounts')settings[key]=[{name:'Bank',iban:'GR123456'}];
  if(f.type==='url-status'){settings[key+'Configured']=true;settings[key+'Origin']='https://example.invalid'}
  if(f.type==='configured-status')settings[key+'Configured']=true;
 }
 const secrets=Object.fromEntries((companyParameterSecretFields[section]??[]).map(key=>[key,false]));
 const companyDefaults=section==='business'?{name:'Company fallback',taxId:'123456',city:'Athens fallback',phone:'2100000000'}:section==='email'?{businessEmail:'fallback@company.invalid'}:{};
 return{...root,section,rowExists,configured,settings,secrets,companyDefaults};
}
export function configurationFixture(path){
 const u=new URL(path,'https://isolated.invalid'),suffix=u.pathname.slice(prefix.length),group={id:u.pathname.includes('/g2/')?'g2':'g',description:u.pathname.includes('/g2/')?'Other group':'Named group',active:true};
 if(u.pathname==='/api/owner-products/stores')return{...root,items:[{id:'s',name:'Named store',city:'Athens',active:true},{id:'inactive',name:'Inactive store',city:null,active:false}]};
 if(u.pathname==='/api/commerce/products')return{...root,query:u.searchParams.get('q')||'',items:[{id:'p',sku:'P1',name:'Named product',unit:'PIECE',vatRate:24,salePrice:0,costPrice:0,trackStock:true,active:true,categoryName:null,barcodes:[]}],window:{limit:500,kind:'NATIVE_LIST_OR_SEARCH'}};
 if(suffix.startsWith('/parameters/'))return parameterConfigurationFixture(suffix.split('/').at(-1));
 if(suffix==='/license')return{...root,company:{id:'a',name:'Named company'},licenseStatus:'EXPIRED',licenseAllowed:false,subscriptionEndsAt:stamp,activeModules:['CORE'],superAdminBypass:false,modules:[{key:'CORE',name:'Core module',active:true},{key:'INVENTORY',name:'Inventory module',active:false}]};
 if(suffix==='/pos-terminals')return{...root,items:[{id:'terminal',name:'Named terminal',paymentMethodCode:'CARD',bankId:'bank',bankName:'Named bank',bankInternalCode:'B1',tid:'1234',deferredCode:null,ipAddress:'192.0.2.1',bankUnavailable:false,iris:false,ipAddressConfigured:true,onlineMiddleware:false,helperField1Configured:true,helperField3Configured:false,notesConfigured:true,port:9100,active:true,createdAt:stamp,updatedAt:stamp}],count:1,window:{limit:10000}};
 if(suffix==='/modifiers/groups')return{...root,items:[{id:'g',description:'Named group',active:true,legacyId:null,modifierCount:1},{id:'g2',description:'Other group',active:false,legacyId:0,modifierCount:1}],count:2,window:{limit:10000}};
 if(suffix.endsWith('/items'))return{...root,group,items:[{id:group.id==='g'?'m':'m2',sequence:0,description:group.id==='g'?'Named modifier':'Other modifier',price:0,costNet:0,active:true}],count:1,window:{limit:10000}};
 if(suffix.endsWith('/inventory-prices'))return{...root,group,store:{id:u.searchParams.get('storeId'),name:'Named store'},items:[{id:'m',sequence:0,description:'Fixed modifier',costNet:0,active:true,fixedPrice:0,price:0,priceSource:'FIXED',inventoryUnavailable:false,inventoryProductId:null,inventoryProductName:null,inventoryProductSku:null},{id:'linked',sequence:1,description:'Linked modifier',costNet:0,active:true,fixedPrice:1,price:null,priceSource:'INVENTORY',inventoryUnavailable:true,inventoryProductId:null,inventoryProductName:null,inventoryProductSku:null}],count:2,window:{limit:10000}};
 if(suffix==='/preparation/catalog')return{...root,groups:[{id:'g',description:'Named group',active:true,items:[{id:'m',description:'Named modifier',price:0,sequence:0,active:true}]}],ingredients:[{id:'ingredient',sku:'MWS-PREP-1',name:'Named ingredient'}],window:{groupLimit:10000,itemLimit:10000,ingredientLimit:10000}};
 if(suffix.startsWith('/preparation/products/'))return{...root,product:{id:'p',name:'Named product',sku:'P1'},settings:{preparationEnabled:false,environmentalFee:0,productionStation:null,autoPrint:true},settingsConfigured:false,recipe:[{id:'recipe',ingredientProductId:null,ingredientName:null,ingredientSku:null,ingredientUnavailable:true,quantity:0,unit:'PCS',automatic:false}],groups:[{id:'mapping',groupId:null,groupName:null,groupUnavailable:true,required:false,minSelections:0,maxSelections:1,sequence:0}],window:{recipeLimit:10000,groupLimit:10000}};
 if(suffix.endsWith('/consumption'))return{...root,modifier:{id:'m',description:'Named modifier',groupId:'g',groupName:'Named group'},rows:[{id:'consumption',ingredientProductId:null,ingredientName:null,ingredientSku:null,ingredientUnavailable:true,quantity:0,unit:'PCS',multiplierMode:'FIXED'}],count:1,window:{limit:10000}};
 throw Error('Unexpected configuration fixture path '+path);
}
