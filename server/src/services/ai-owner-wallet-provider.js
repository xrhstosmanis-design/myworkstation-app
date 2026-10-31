import {walletReviewEvidence} from './ai-owner-wallet-review-evidence.js';
import {randomUUID} from 'node:crypto';
import {requestCacheWritePolicy} from './ai-owner-wallet-cache-policy.js';
import {meteredUsage,reserveAmount,reserveRequestAmount,tariffFor,walletError} from './ai-owner-wallet-contract.js';

// Composed only around an already authorized provider call, never around sales,
// invoice settlement or normal request middleware. Existing disabled tenants
// retain their exact provider request and do not initialize wallet tables.
export function createWalletProvider({repository,enabled=()=>process.env.AI_OWNER_WALLET_ENABLED==='true',tariffs=()=>process.env.AI_OWNER_WALLET_TARIFFS}={}){
  return async function walletProvider(scope,settings,invoke,measureInput){
    if(!enabled())return invoke(settings);
    if(!scope?.companyId||!scope?.storeId)throw walletError('AI_WALLET_SCOPE_DENIED',403);
    if(!await repository.enabledFor(scope.companyId))return invoke(settings);
    const configuredTariff=tariffFor(settings.model,tariffs());
    // The original reservation carries policy provenance alongside the exact
    // price snapshot; tariff version and all reserve rates stay unchanged.
    const tariff=configuredTariff.cacheWriteMicrosPerMillion?
      {...configuredTariff,requestCacheWritePolicy:requestCacheWritePolicy(settings)}:configuredTariff;
    const max=settings.max_output_tokens??tariff.maxOutputTokens;
    if(!Number.isInteger(max)||max<1||max>tariff.maxOutputTokens)throw walletError('AI_WALLET_TARIFF_REQUIRED',503);
    // Optional internal invoice preflight. Legacy/Owner callers retain their
    // original conservative full-model hold and perform no counting request.
    const inputTokens=measureInput?await measureInput(settings):null;
    const limits=inputTokens===null?null:{inputTokens,maxOutputTokens:max};
    const reservation=await repository.reserve({...scope,tariff,amountMicros:limits?reserveRequestAmount(tariff,limits):reserveAmount(tariff),reference:randomUUID()});
    // Configuration can be disabled while authorization is in flight. The
    // repository lock is authoritative; a disabled wallet has no reservation.
    if(!reservation)return invoke(settings);
    let result,stage='PROVIDER';
    try{
      result=await invoke({...settings,max_output_tokens:max});
      stage='RESPONSE';
      if(!result?.response?.ok)throw walletError('AI_WALLET_USAGE_REVIEW',503);
      stage='USAGE';
      const measured=meteredUsage(result.raw,tariff);
      stage='BOUNDS';
      if(limits&&(measured.usage.inputTokens>limits.inputTokens||measured.usage.outputTokens>limits.maxOutputTokens))throw walletError('AI_WALLET_USAGE_REVIEW',503);
      stage='SETTLEMENT';
      await repository.settle(scope.companyId,reservation.id,{amountMicros:measured.amount,usage:measured.usage});
      return result;
    }catch(error){
      // A lost provider reply may still have incurred cost. Retain the hold
      // durably for an explicit reviewed resolution, never silently refund.
      try{const reason=({PROVIDER:'PROVIDER_UNAVAILABLE',RESPONSE:'PROVIDER_RESPONSE_INVALID',USAGE:'USAGE_INVALID',BOUNDS:'REQUEST_BOUNDS_EXCEEDED',SETTLEMENT:'SETTLEMENT_FAILED'})[stage];await repository.review(scope.companyId,reservation.id,walletReviewEvidence(result,{stage,reason,limits,tariff,maxOutputTokens:max}))}catch{
        // The original RESERVED hold is already durable. If marking REVIEW
        // also fails, preserve the billing error so callers cannot pay again.
      }
      if(error?.code?.startsWith('AI_WALLET_'))throw error;
      throw walletError('AI_WALLET_USAGE_REVIEW',503);
    }
  };
}


