const MANAGERS=new Set(['SUPER_ADMIN','OWNER','ADMIN','MANAGER']);
const portalPrincipals=new WeakMap();

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
export function assertWholesalePrincipal(ctx){if(!isWholesalePortalPrincipal(ctx))assertWholesaleManager(ctx)}

function portalScope(ctx,input){
  if(input?.customerId!==ctx.customerId||input?.storeId!==ctx.storeId)throw wholesaleError(403,'WHOLESALE_PORTAL_SCOPE_DENIED','This portal session cannot access that customer or store.');
}

export async function authorizeWholesalePrincipal(db,ctx,input,{lock=false}={}){
  assertWholesalePrincipal(ctx);
  if(!isWholesalePortalPrincipal(ctx))return;
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
