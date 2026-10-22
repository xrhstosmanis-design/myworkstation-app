import {randomUUID} from 'node:crypto';
import {meteredUsage,reserveAmount,tariffFor,walletError} from './ai-owner-wallet-contract.js';

// Composed only around an already authorized provider call, never around sales,
// invoice settlement or normal request middleware. Existing disabled tenants
// retain their exact provider request and do not initialize wallet tables.
export function createWalletProvider({repository,enabled=()=>process.env.AI_OWNER_WALLET_ENABLED==='true',tariffs=()=>process.env.AI_OWNER_WALLET_TARIFFS}={}){
  return async function walletProvider(scope,settings,invoke){
    if(!enabled())return invoke(settings);
    if(!scope?.companyId||!scope?.storeId)throw walletError('AI_WALLET_SCOPE_DENIED',403);
    if(!await repository.enabledFor(scope.companyId))return invoke(settings);
    const tariff=tariffFor(settings.model,tariffs());
    const max=settings.max_output_tokens??tariff.maxOutputTokens;
    if(!Number.isInteger(max)||max<1||max>tariff.maxOutputTokens)throw walletError('AI_WALLET_TARIFF_REQUIRED',503);
    const reservation=await repository.reserve({...scope,tariff,amountMicros:reserveAmount(tariff),reference:randomUUID()});
    // Configuration can be disabled while authorization is in flight. The
    // repository lock is authoritative; a disabled wallet has no reservation.
    if(!reservation)return invoke(settings);
    try{
      const result=await invoke({...settings,max_output_tokens:max});
      if(!result?.response?.ok)throw walletError('AI_WALLET_USAGE_REVIEW',503);
      const measured=meteredUsage(result.raw,tariff);
      await repository.settle(scope.companyId,reservation.id,{amountMicros:measured.amount,usage:measured.usage});
      return result;
    }catch(error){
      // A lost provider reply may still have incurred cost. Retain the hold
      // durably for an explicit reviewed resolution, never silently refund.
      try{await repository.review(scope.companyId,reservation.id)}catch{
        // The original RESERVED hold is already durable. If marking REVIEW
        // also fails, preserve the billing error so callers cannot pay again.
      }
      if(error?.code?.startsWith('AI_WALLET_'))throw error;
      throw walletError('AI_WALLET_USAGE_REVIEW',503);
    }
  };
}
