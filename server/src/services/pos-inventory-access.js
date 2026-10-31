import {assertLifecycleMutation,readLifecycleGeneration} from './store-lifecycle-generation.js';

export function inventoryDenied(message='Δεν έχεις δικαίωμα για αυτή την ενέργεια της Αποθήκης.',code='POS_INVENTORY_ACTION_DENIED',status=403){
 return Object.assign(new Error(message),{status,code});
}
export function inventoryCapabilities(rights={}){
 return {
  read:rights.inventoryPos===true,edit:rights.editDescription===true,
  prices:rights.changeRetail===true,barcodes:rights.addBarcode===true,
  create:rights.newProduct===true,lookup:rights.onlineBarcode===true,
  print:rights.hidePrinter!==true,orders:false,stock:false
 };
}
// STORE_OPERATOR remains a credential identity. No Owner role, User id or
// permission from a request/header is accepted as an inventory authorization.
export async function authorizePosInventory(db,user,storeId,{lock=true}={}){
 if(user?.tokenType!=='STORE_OPERATOR'||!user.operatorSessionId||!user.employeeId||
    !user.companyId||!storeId||user.storeId!==storeId){
  throw inventoryDenied('Η Αποθήκη POS ισχύει μόνο για τον συνδεδεμένο χειριστή και το κατάστημά του.','POS_INVENTORY_ACCESS_DENIED');
 }
 const sql=[
  'SELECT c."id",c."displayName",c."employeeId",p."permissions",p."terminalPos"',
  'FROM "StoreOperatorCredential" c',
  'JOIN "StoreOperatorProfile" p ON p."companyId"=c."companyId" AND p."storeId"=c."storeId" AND p."employeeId"=c."employeeId"',
  'JOIN "StoreOperatorSession" os ON os."operatorId"=c."id"',
  'JOIN "Employee" e ON e."id"=c."employeeId" AND e."storeId"=c."storeId"',
  'JOIN "Store" s ON s."id"=c."storeId" AND s."companyId"=c."companyId"',
  'JOIN "Company" co ON co."id"=c."companyId"',
  'WHERE c."id"=$1 AND c."companyId"=$2 AND c."storeId"=$3 AND c."employeeId"=$4',
  'AND os."id"=$5 AND c."role"::text=$6 AND c."active"=true',
  'AND e."active"=true AND s."active"=true AND co."active"=true',
  'AND os."revokedAt" IS NULL AND os."expiresAt">clock_timestamp() AND p."posAccess" IS DISTINCT FROM false',
  lock?'FOR SHARE OF c,p,os,e,s,co':''
 ].join(' ');
 const row=(await db.$queryRawUnsafe(sql,user.operatorId||user.id,user.companyId,storeId,user.employeeId,user.operatorSessionId,user.role))[0];
 if(row&&user.terminalId){
  const terminal=await db.$queryRawUnsafe('SELECT "id" FROM "StoreInstallationTerminal" WHERE "id"=$1 AND "storeId"=$2 AND "terminalPos"=$3 AND "active"=true'+(lock?' FOR SHARE':''),user.terminalId,storeId,user.terminalPos);
  if(!terminal.length)throw inventoryDenied('Το τερματικό έχει απενεργοποιηθεί.','POS_INVENTORY_ACCESS_DENIED');
 }
 const capabilities=inventoryCapabilities(row?.permissions);
 if(!row||!capabilities.read)throw inventoryDenied('Δεν έχεις δικαίωμα «Αποθήκη από POS» ή η πρόσβαση έχει ανακληθεί.','POS_INVENTORY_ACCESS_DENIED');
 return {kind:'POS_INVENTORY',schemaReady:true,companyId:user.companyId,storeId,
  actorId:row.id,employeeId:row.employeeId,actorName:row.displayName,
  terminalPos:user.terminalPos||row.terminalPos||'POS',capabilities,rights:row.permissions||{}};
}
const need=(scope,key)=>{if(!scope.capabilities[key])throw inventoryDenied();};
const decode=value=>{try{const result=decodeURIComponent(value);if(!result||result.length>200||/[\/\\\0]/.test(result))throw Error();return result}catch{throw inventoryDenied('Μη έγκυρη ενέργεια Αποθήκης.')}};
export function inventoryAction(method,path){
 const m=String(method).toUpperCase(),p=String(path).replace(/\/$/,'')||'/';
 if(m==='GET'&&p==='/access')return {kind:'access'};
 if(m==='GET'&&p==='/archive')return {kind:'archive',family:'archive',path:'/'};
 if(m==='GET'&&p==='/suppliers')return {kind:'suppliers'};
 if(m==='POST'&&/^\/archive\/import(?:-preview)?$/.test(p))return {kind:p.endsWith('-preview')?'import-preview':'import',family:'import',path:p.slice(8),write:!p.endsWith('-preview')};
 if(m==='GET'&&['/products/stores','/products/catalog','/products/new-card/options','/products/smart-entry/options'].includes(p))return {kind:p.split('/').at(-1),family:'products',path:p.slice(9)};
 let match=p.match(/^\/products\/smart-entry\/barcode\/([^/]+)$/);
 if(m==='GET'&&match)return {kind:'lookup',family:'products',path:p.slice(9),barcode:decode(match[1])};
 if(m==='POST'&&p==='/products/new-card')return {kind:'create',family:'products',path:'/new-card',write:true};
 if(m==='PATCH'&&p==='/products/bulk-card')return {kind:'bulk',family:'products',path:'/bulk-card',write:true};
 match=p.match(/^\/products\/([^/]+)\/(details|composition|delivery|price-history|movements|purchases|barcode-owner)$/);
 if(m==='GET'&&match)return {kind:match[2],family:'products',path:p.slice(9),productId:decode(match[1])};
 match=p.match(/^\/products\/([^/]+)\/(card|prices|delivery|set-items|recipe-items|barcode-transfer)(?:\/([^/]+))?$/);
 if(match&&((m==='PATCH'&&['card','prices','delivery'].includes(match[2])&&!match[3])||
    (m==='POST'&&['set-items','recipe-items','barcode-transfer'].includes(match[2])&&!match[3])||
    (m==='DELETE'&&['set-items','recipe-items'].includes(match[2])&&match[3]))){
  return {kind:match[2],family:'products',path:p.slice(9),productId:decode(match[1]),write:true};
 }
 // No prefix delegation: stocktake, merge, adjustment, destruction, returns,
 // transfer and every unknown action stay outside this namespace.
 throw inventoryDenied('Αυτή η ενέργεια δεν επιτρέπεται από την Αποθήκη POS.');
}
export function assertInventoryPayload(scope,action,query={},body={}){
 const own=scope.storeId;
 for(const value of [query.storeId,body.storeId,query.sourceStoreId,body.sourceStoreId]){
  if(value!==undefined&&value!==own)throw inventoryDenied('Η ενέργεια αφορά άλλο κατάστημα.');
 }
 if(body.companyId!==undefined&&body.companyId!==scope.companyId)throw inventoryDenied();
 if(body.stores!==undefined&&(!Array.isArray(body.stores)||body.stores.some(row=>row?.storeId!==own)))throw inventoryDenied('Δεν επιτρέπεται αλλαγή σε άλλο κατάστημα.');
 if(body.storeIds!==undefined&&(!Array.isArray(body.storeIds)||body.storeIds.some(id=>id!==own)))throw inventoryDenied();
 if(body.destinationStoreId!==undefined||body.applyStock===true||body.openingStock!==undefined&&Number(body.openingStock)!==0)throw inventoryDenied('Το στοκ είναι μόνο για προβολή στην Αποθήκη POS.','POS_INVENTORY_STOCK_DENIED');
 const forbid=(value)=>{
  if(!value||typeof value!=='object')return;
  for(const [key,child] of Object.entries(value)){
   if(['currentStock','editStock','countedQuantity','stockAdjustment','stockQuantity','initialStock','stock'].includes(key))throw inventoryDenied('Το στοκ είναι μόνο για προβολή.','POS_INVENTORY_STOCK_DENIED');
   if(child&&typeof child==='object')forbid(child);
  }
 };
 forbid(body);
 if(action.kind==='lookup')need(scope,'lookup');
 if(action.kind==='create')need(scope,'create');
 if(action.kind==='prices')need(scope,'prices');
 if(action.kind==='barcode-transfer')need(scope,'barcodes');
 if(['set-items','recipe-items'].includes(action.kind)&&action.write)need(scope,'edit');
 if(['import','import-preview'].includes(action.kind)){
  for(const key of ['create','edit','prices','barcodes'])need(scope,key);
 }
 if(action.kind==='bulk'){
  if(body.priceMode!==undefined||body.priceValue!==undefined||body.allowPosPriceChange!==undefined)need(scope,'prices');
  if(Object.keys(body).some(key=>!['storeId','requestId','productIds','allProducts','priceMode','priceValue','expectedPrices','allowPosPriceChange'].includes(key)))need(scope,'edit');
 }
 if(action.kind==='delivery'&&action.write)need(scope,'edit');
}
export function inventoryObjectIds(action,body={}){
 const result=new Set(action.productId?[action.productId]:[]);
 const visit=value=>{
  if(!value||typeof value!=='object')return;
  for(const [key,child] of Object.entries(value)){
   if(['productId','relatedProductId','ingredientProductId','sourceProductId','targetProductId'].includes(key)&&child)result.add(String(child));
   else if(key==='productIds'&&Array.isArray(child))child.forEach(id=>result.add(String(id)));
   else if(child&&typeof child==='object')visit(child);
  }
 };
 visit(body);return [...result].sort();
}
export async function assertInventoryObjects(db,scope,ids,{lock=false}={}){
 if(!ids.length)return;
 if(ids.length>10000||ids.some(id=>typeof id!=='string'||!id||id.length>200))throw inventoryDenied();
 const rows=await db.$queryRawUnsafe(
  'SELECT p."id" FROM "Product" p JOIN "StoreProduct" sp ON sp."productId"=p."id" AND sp."storeId"=$1 WHERE p."companyId"=$2 AND p."id"=ANY($3::text[]) ORDER BY p."id"'+(lock?' FOR KEY SHARE OF p,sp':''),
  scope.storeId,scope.companyId,ids);
 if(new Set(rows.map(row=>row.id)).size!==ids.length)throw inventoryDenied('Το είδος δεν είναι διαθέσιμο στο δικό σου κατάστημα.','POS_INVENTORY_OBJECT_DENIED',404);
}
export async function inventoryStockSnapshot(db,scope){
 const rows=await db.$queryRawUnsafe('SELECT "productId","currentStock"::text AS qty FROM "StoreProduct" WHERE "storeId"=$1 ORDER BY "productId"',scope.storeId);
 const movement=await db.$queryRawUnsafe('SELECT COUNT(*)::text AS count FROM "StockMovement" WHERE "storeId"=$1',scope.storeId);
 return {rows,movements:movement[0]?.count};
}
export function assertInventoryStockUnchanged(before,after){
 const old=new Map(before.rows.map(row=>[row.productId,row.qty])),current=new Map(after.rows.map(row=>[row.productId,row.qty]));
 if(before.movements!==after.movements||[...old].some(([id,qty])=>!current.has(id)||current.get(id)!==qty)||
    [...current].some(([id,qty])=>!old.has(id)&&!(typeof qty==='string'&&/^0(?:\.0+)?$/.test(qty)))){
  throw inventoryDenied('Η ενέργεια θα άλλαζε στοκ και ακυρώθηκε ολόκληρη.','POS_INVENTORY_STOCK_DENIED');
 }
}
export async function inventoryLifecycle(db,scope,write,generation){
 return write?assertLifecycleMutation(db,scope,generation):readLifecycleGeneration(db,scope);
}

// Compare authoritative values, not field presence: the existing card submits
// its complete form even when the actor only edits one permitted section.
export async function assertInventoryCardRights(db,scope,product,body){
 const equal=(a,b)=>JSON.stringify(a??null)===JSON.stringify(b??null);
 const number=value=>value==null||value===''?null:Number(value);
 const [barcodes,suppliers,stores]=await Promise.all([
  db.$queryRaw`SELECT "barcode","unitMultiplier","salePrice","name" FROM "ProductBarcode" WHERE "productId"=${product.id}`,
  db.$queryRaw`SELECT "supplierId","supplierCode" FROM "SupplierProductLink" WHERE "companyId"=${scope.companyId} AND "productId"=${product.id} AND "active"=true`,
  db.$queryRaw`SELECT "storeId","salePrice","minStock","active" FROM "StoreProduct" WHERE "productId"=${product.id} AND "storeId"=${scope.storeId}`
 ]);
 const normalized=(rows,keys)=>rows.map(row=>keys.map(key=>['unitMultiplier','salePrice'].includes(key)?number(row[key]):row[key]||null)).map(row=>JSON.stringify(row)).sort();
 if(!scope.capabilities.barcodes&&!equal(normalized(barcodes,['barcode','unitMultiplier','salePrice','name']),normalized(body.barcodes,['barcode','unitMultiplier','salePrice','name'])))throw inventoryDenied();
 const store=stores[0];
 if(!scope.capabilities.prices){
  if(body.barcodes.some(row=>number(row.salePrice)!==number(barcodes.find(old=>old.barcode===row.barcode)?.salePrice)))throw inventoryDenied();
  for(const key of ['staffPrice','deliveryPrice','discountA','discountB','discountC'])if(!equal(number(product[key]),number(body[key])))throw inventoryDenied();
  for(const key of ['allowDiscount','allowPosPriceChange','freeSalePrice'])if(Boolean(product[key])!==Boolean(body[key]))throw inventoryDenied();
  if(body.stores.some(row=>number(row.salePrice)!==number(store?.salePrice??product.salePrice))||number(body.salePrice)!==number(store?.salePrice??product.salePrice)&&number(body.salePrice)!==number(product.salePrice))throw inventoryDenied();
 }
 if(!scope.capabilities.edit){
  if(body.categoryName&&!equal(product.categoryName||null,body.categoryName))throw inventoryDenied();
  for(const key of ['name','sku','description','categoryId','subcategoryId','unit'])if(!equal(product[key]||null,body[key]||null))throw inventoryDenied();
  for(const key of ['costPrice','vatRate','minOrderQuantity','capacity'])if(!equal(number(product[key]),number(body[key])))throw inventoryDenied();
  if(body.vatDepartmentId!==undefined&&!equal(product.vatDepartmentId,body.vatDepartmentId))throw inventoryDenied();
  for(const key of ['vatVerified','trackStock','negativeStockWarning','isSet','isRecipe'])if(Boolean(product[key])!==Boolean(body[key]))throw inventoryDenied();
  if(!equal(normalized(suppliers,['supplierId','supplierCode']),normalized(body.supplierCodes,['supplierId','supplierCode'])))throw inventoryDenied();
  if(body.stores.some(row=>row.active!==store?.active||number(row.minStock)!==number(store?.minStock)))throw inventoryDenied();
 }
}
