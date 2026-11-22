import {createHash,randomUUID} from 'node:crypto';
import {createWalletProvider} from './ai-owner-wallet-provider.js';
import {variableServiceTariff} from './ai-variable-service-tariffs.js';
import {walletError} from './ai-owner-wallet-contract.js';

// Compose AFTER the route's existing authorization. verify repeats the native
// session/scope/module checks immediately before reserving any paid request.
export function createCustomerCostMeter({repository,env=process.env}={}){
  const active=()=>env.AI_OWNER_WALLET_ENABLED==='true';
  const openai=createWalletProvider({repository,enabled:active,tariffs:()=>env.AI_OWNER_WALLET_TARIFFS});
  async function billed(scope,verify){
    if(!active())return false;
    if(!scope?.companyId)throw walletError('AI_WALLET_SCOPE_DENIED',403);
    if(!await repository.enabledFor(scope.companyId))return false;
    if(!scope.storeId||typeof verify!=='function')throw walletError('AI_WALLET_SCOPE_DENIED',403);
    await verify();return true;
  }
  return {
    async responses(scope,settings,invoke,verify){
      if(!await billed(scope,verify))return invoke(settings);
      // These model prices already include the agreed margin: do not mark up.
      return openai(scope,settings,invoke);
    },
    async query(scope,provider,invoke,verify){
      if(!await billed(scope,verify))return invoke();
      const tariff=variableServiceTariff(provider,env.AI_OWNER_WALLET_EXTERNAL_COST_TARIFFS);
      const reservation=await repository.reserve({...scope,feature:provider,tariff,reference:randomUUID(),amountMicros:BigInt(tariff.unitMicros)});
      if(!reservation)return invoke();
      try{
        // Parse inside invoke. A timeout, malformed reply or provider error is
        // ambiguous spend, never permission to refund/retry a second provider.
        const result=await invoke();
        if(!result||typeof result!=='object'||Array.isArray(result)||result.error)throw walletError('AI_WALLET_USAGE_REVIEW',409);
        const responseDigest=createHash('sha256').update(JSON.stringify(result)).digest('hex');
        await repository.settle(scope.companyId,reservation.id,{amountMicros:BigInt(tariff.unitMicros),usage:{provider,queries:1,responseDigest,providerUnitCostMicros:tariff.providerUnitCostMicros,markupBps:5000,tariffVersion:tariff.version}});
        return result;
      }catch{
        try{await repository.review(scope.companyId,reservation.id);}catch{/* Durable original hold survives. */}
        throw walletError('AI_WALLET_USAGE_REVIEW',409);
      }
    }
  };
}
