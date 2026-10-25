import {tariffFor,reserveAmount,walletError} from './ai-owner-wallet-contract.js';
import {ASSISTANT_OUTPUT_TOKENS,ASSISTANT_RECOVERY_TOKENS} from './assistant-answer-response.js';

// Platform-admin metadata only. Never return the environment or credentials.
export function ownerWalletReadiness(env=process.env,availableMicros='0'){
  const model=env.OPENAI_COMMAND_CENTER_MODEL||'gpt-5-mini';
  const providerConfigured=Boolean(env.OPENAI_API_KEY);
  let tariff=null,maxReservationMicros=null;
  try{
    tariff=tariffFor(model,env.AI_OWNER_WALLET_TARIFFS);
    if(tariff.maxOutputTokens<Math.max(1200,ASSISTANT_OUTPUT_TOKENS,ASSISTANT_RECOVERY_TOKENS))throw walletError('AI_WALLET_TARIFF_REQUIRED',503);
    maxReservationMicros=String(reserveAmount(tariff));
  }catch{tariff=null}
  const ready=providerConfigured&&Boolean(tariff);
  return {model,providerConfigured,tariffConfigured:Boolean(tariff),ready,
    code:!providerConfigured?'AI_WALLET_PROVIDER_REQUIRED':!tariff?'AI_WALLET_TARIFF_REQUIRED':null,
    maxReservationMicros,availableEnough:Boolean(tariff)&&BigInt(availableMicros)>=BigInt(maxReservationMicros),
    tariff:tariff?{...tariff}:null};
}

export function requireOwnerWalletReady(env=process.env){
  const readiness=ownerWalletReadiness(env);
  if(!readiness.ready)throw walletError(readiness.code,503);
  return readiness;
}
