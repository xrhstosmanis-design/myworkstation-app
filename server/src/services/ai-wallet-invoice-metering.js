import {AsyncLocalStorage} from 'node:async_hooks';
import {createHash,randomUUID} from 'node:crypto';
import {createWalletProvider} from './ai-owner-wallet-provider.js';
import {aiOwnerWalletRepository} from './ai-owner-wallet-runtime.js';
import {walletError,MAX_WALLET_MICROS} from './ai-owner-wallet-contract.js';
import {invoiceAssistantPageCount} from '../lib/invoice-assistant-page-count.js';
import {countInvoiceInput} from './ai-invoice-input-count.js';
import {invoiceWalletCompanyAllowed,resolvedInvoiceWalletCompany} from './ai-invoice-company-scope.js';
import {invoicePageTariff} from './ai-invoice-wallet-readiness.js';
import {reservationWalletActivity} from './ai-wallet-activity.js';

export function throwIfWalletError(error){
  if(String(error?.code||'').startsWith('AI_WALLET_')){
    // Invoice background workers retry ordinary provider503 errors. A wallet
    // hold/configuration issue needs review or funding, never a paid retry.
    if(![400,402,403,404,409].includes(error.status))error.status=409;
    throw error;
  }
}
export function invoiceWalletFeatures(env=process.env,companyId,invoiceEnabled){return ['OWNER_ASSISTANT',...(env.AI_OWNER_WALLET_INVOICES_ENABLED==='true'&&(invoiceEnabled??invoiceWalletCompanyAllowed(companyId,env))?['INVOICE_OPENAI','INVOICE_AZURE']:[])]}

// Canonical scope is supplied only AFTER existing route/job authorization, not
// from headers/body inside a provider helper. AsyncLocalStorage keeps parallel
// requests and background jobs isolated without altering provider signatures.
export function createInvoiceWalletMeter({repository=aiOwnerWalletRepository,env=process.env,transport=(...args)=>globalThis.fetch(...args),countPages=invoiceAssistantPageCount}={}){
  const context=new AsyncLocalStorage();
  const active=()=>env.AI_OWNER_WALLET_ENABLED==='true'&&env.AI_OWNER_WALLET_INVOICES_ENABLED==='true';
  const requiredScope=()=>{const scope=context.getStore();if(!scope)throw walletError('AI_WALLET_SCOPE_DENIED',403);return scope};
  // Dedicated invoice schedules can be installed without replacing the Owner
  // assistant's already accepted tariff. Legacy configuration stays compatible.
  const meter=createWalletProvider({repository,enabled:active,tariffs:()=>env.AI_OWNER_WALLET_INVOICE_TARIFFS??env.AI_OWNER_WALLET_TARIFFS});
  function run(scope,work){
    if(!active())return work();
    if(!scope||!['companyId','storeId'].every(k=>typeof scope[k]==='string'&&scope[k].trim()&&scope[k].length<=160))throw walletError('AI_WALLET_SCOPE_DENIED',403);
    if(scope.invoiceDocumentId!==undefined&&(typeof scope.invoiceDocumentId!=='string'||!scope.invoiceDocumentId.trim()||scope.invoiceDocumentId.length>160))throw walletError('AI_WALLET_SCOPE_DENIED',403);
    const activity=reservationWalletActivity(scope.activity,scope);
    return context.run(Object.freeze({companyId:scope.companyId,storeId:scope.storeId,feature:'INVOICE_AI',...(activity?{activity}:{}),...(scope.invoiceDocumentId===undefined?{}:{invoiceDocumentId:scope.invoiceDocumentId})}),async()=>{try{return await work()}catch(error){throwIfWalletError(error);throw error}});
  }
  async function responsesFetch(url,options){
    if(!active())return transport(url,options);
    const scope=requiredScope();
    if(!await resolvedInvoiceWalletCompany(repository,scope.companyId,env))return transport(url,options);
    if(!await repository.enabledFor(scope.companyId))return transport(url,options);
    if(url!=='https://api.openai.com/v1/responses'||options?.method!=='POST'||typeof options.body!=='string')throw walletError('AI_WALLET_SCOPE_DENIED',403);
    options.signal?.throwIfAborted();
    let settings;try{settings=JSON.parse(options.body)}catch{throw walletError('AI_WALLET_INVALID_INPUT',400)}
    const result=await meter({...scope,feature:'INVOICE_OPENAI',invoicePolicyFallback:invoiceWalletCompanyAllowed(scope.companyId,env)},settings,async billed=>{
      const response=await transport(url,{...options,body:JSON.stringify(billed)});
      const raw=await response.clone().json();
      return {response,raw};
    },env.AI_OWNER_WALLET_INVOICE_REQUEST_RESERVE_ENABLED==='true'?settings=>countInvoiceInput(settings,options,transport):undefined);
    return result.response;
  }
  async function azure({contentData,mimeType,model,apiVersion},invoke){
    if(!active())return invoke(()=>{});
    const scope=requiredScope();if(!await resolvedInvoiceWalletCompany(repository,scope.companyId,env)||!await repository.enabledFor(scope.companyId))return invoke(()=>{});
    const tariff={...invoicePageTariff(env,model,apiVersion),billingUnit:'PAGES',currency:'EUR'},pages=await countPages([{contentData,mimeType}]);
    if(!Number.isInteger(pages)||pages<1||pages>tariff.maxPages)throw walletError('AI_WALLET_INVALID_INPUT',400);
    const amount=BigInt(pages)*BigInt(tariff.unitMicros);if(amount>MAX_WALLET_MICROS)throw walletError('AI_WALLET_INVALID_AMOUNT',400);
    tariff.version=createHash('sha256').update(JSON.stringify(tariff)).digest('hex');
    const reservation=await repository.reserve({...scope,feature:'INVOICE_AZURE',tariff,amountMicros:amount,reference:randomUUID(),invoicePolicyFallback:invoiceWalletCompanyAllowed(scope.companyId,env)});
    if(!reservation)return invoke(()=>{});
    try{
      let operation;
      const payload=await invoke(value=>{if(operation||typeof value!=='string'||!value||value.length>4096)throw walletError('AI_WALLET_USAGE_REVIEW',409);operation=value});
      const result=payload?.analyzeResult,seen=result?.pages;
      if(!operation||payload.status!=='succeeded'||result?.modelId!==model||result?.apiVersion!==apiVersion||!Array.isArray(seen)||seen.length!==pages||seen.some((p,i)=>p.pageNumber!==i+1))throw walletError('AI_WALLET_USAGE_REVIEW',409);
      const usage={providerResponseId:'AZURE:'+createHash('sha256').update(operation).digest('hex'),model,apiVersion,pages};
      await repository.settle(scope.companyId,reservation.id,{amountMicros:amount,usage});
      return payload;
    }catch(error){
      try{await repository.review(scope.companyId,reservation.id)}catch{
        // Keep the durable RESERVED hold and the fail-stop even if DB review
        // persistence is unavailable; abandoned holds remain admin-reviewable.
      }
      throw walletError('AI_WALLET_USAGE_REVIEW',409);
    }
  }
  return {run,responsesFetch,azure};
}
const invoiceMeter=createInvoiceWalletMeter();
export const withInvoiceWalletScope=invoiceMeter.run;
export const invoiceWalletResponsesFetch=invoiceMeter.responsesFetch;
export const meterInvoiceAzure=invoiceMeter.azure;



