import {assertWholesaleEntitlement} from "./wholesale-entitlement.js";
const MANAGERS=new Set(['SUPER_ADMIN','OWNER','ADMIN','MANAGER']);
const portalPrincipals=new WeakMap();
const sellerPrincipals=new WeakMap();

export function wholesaleError(status,code,message){return Object.assign(new Error(message),{status,code})}
export function assertWholesaleManager(ctx){
  if(!ctx||!MANAGERS.has(ctx.role)||ctx.tokenType!=='BACKOFFICE_USER'||ctx.channel!=='BACKOFFICE'||!String(ctx.companyId||'').trim()||!String(ctx.actorId||'').trim())throw wholesaleError(403,'WHOLESALE_ACCESS_DENIED','Wholesale management access required.');
}

// Only the opaque-session verifier supplies these server-owned callbacks. JSON,
// object spreading and a customer-shaped token cannot recreate the WeakMap brand.
export function createWholesalePortalPrincipal(scope,{authorize,authorizeProducts}={}){
  const fields=['companyId','accountId','sessionId','siteId','customerId','storeId'];
  if(!scope||fields.some(key=>typeof scope[key]!=='string'||!scope[key]||scope[key]!==scope[key].trim()||scope[key].length>200)||typeof authorize!=='function'||typeof authorizeProducts!=='function')throw wholesaleError(403,'WHOLESALE_ACCESS_DENIED','Verified wholesale portal session required.');
  const ctx=Object.freeze({...Object.fromEntries(fields.map(key=>[key,scope[key]])),actorId:'b2b:'+scope.accountId,tokenType:'B2B_CUSTOMER',channel:'B2B_SITE'});
  portalPrincipals.set(ctx,{authorize,authorizeProducts});
  return ctx;
}

export function isWholesalePortalPrincipal(ctx){return Boolean(ctx&&typeof ctx==='object'&&portalPrincipals.has(ctx))}
export function createWholesaleSellerPrincipal(scope,{authorize}={}){
  const fields=['companyId','userId','sessionId'];
  if(!scope||fields.some(key=>typeof scope[key]!=='string'||!scope[key]||scope[key]!==scope[key].trim()||scope[key].length>200)||typeof authorize!=='function')throw wholesaleError(403,'WHOLESALE_ACCESS_DENIED','Verified wholesale seller session required.');
  const ctx=Object.freeze({...Object.fromEntries(fields.map(key=>[key,scope[key]])),actorId:'seller:'+scope.userId,tokenType:'WHOLESALE_SELLER',channel:'FIELD_SALES'});
  sellerPrincipals.set(ctx,{authorize});return ctx;
}
export function isWholesaleSellerPrincipal(ctx){return Boolean(ctx&&typeof ctx==='object'&&sellerPrincipals.has(ctx))}
export function assertWholesalePrincipal(ctx){if(!isWholesalePortalPrincipal(ctx)&&!isWholesaleSellerPrincipal(ctx))assertWholesaleManager(ctx)}

function portalScope(ctx,input){
  if(input?.customerId!==ctx.customerId||input?.storeId!==ctx.storeId)throw wholesaleError(403,'WHOLESALE_PORTAL_SCOPE_DENIED','This portal session cannot access that customer or store.');
}

export async function authorizeWholesalePrincipal(db,ctx,input,{lock=false}={}){
  assertWholesalePrincipal(ctx);
  if(isWholesaleSellerPrincipal(ctx)){
    // Selection is validated against current assignments by the verifier, not by
    // a client-supplied role or a cached list of customer/store permissions.
    if(await sellerPrincipals.get(ctx).authorize(db,ctx,input,{lock})!==true)throw wholesaleError(403,'WHOLESALE_SELLER_ACCESS_DENIED','Wholesale seller access is no longer available.');
    return;
  }
  if(!isWholesalePortalPrincipal(ctx)){await assertWholesaleEntitlement(db,ctx.companyId,{lock});return;}
  portalScope(ctx,input);
  // Recheck current session/account/site/license/customer/store in the caller's
  // transaction, including accepted retries. Never cache successful validation.
  if(await portalPrincipals.get(ctx).authorize(db,ctx,{lock})!==true)throw wholesaleError(403,'WHOLESALE_PORTAL_ACCESS_DENIED','Wholesale portal access is no longer available.');
}

export async function authorizeWholesaleQuoteProducts(db,ctx,input,{lock=false}={}){
  assertWholesalePrincipal(ctx);
  if(!isWholesalePortalPrincipal(ctx))return;
  portalScope(ctx,input);
  // Publication is a new-quote rule. A previously accepted own snapshot remains
  // readable/replayable after withdrawal; it is never repriced or republished.
  if(await portalPrincipals.get(ctx).authorizeProducts(db,ctx,input,{lock})!==true)throw wholesaleError(403,'WHOLESALE_PORTAL_PRODUCTS_DENIED','These products are not published for this wholesale site.');
}
