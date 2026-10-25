import {getMailConfig} from './mail.js';
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

// Explicit allowlist: operational metadata for authenticated SuperAdmin only.
// Credential values, endpoints, email addresses and arbitrary environment keys
// are never included. Configured does not imply verified delivery/provider access.
export function walletServiceConfiguration(env=process.env){
  const mail=getMailConfig(env);
  const modelKeys=['OPENAI_INVOICE_MODEL','OPENAI_INVOICE_FAST_MODEL','OPENAI_INVOICE_FULL_MODEL','OPENAI_INVOICE_ASSISTANT_MODEL'];
  return {
    email:{enabled:env.AI_OWNER_WALLET_EMAIL_ENABLED==='true',configured:Boolean(mail.host&&mail.user&&mail.password&&mail.from)},
    invoices:{enabled:env.AI_OWNER_WALLET_INVOICES_ENABLED==='true',openaiConfigured:Boolean(env.OPENAI_API_KEY),azureConfigured:Boolean(env.AZURE_DOCUMENT_INTELLIGENCE_ENDPOINT&&env.AZURE_DOCUMENT_INTELLIGENCE_KEY),
      modelOverrides:modelKeys.map(key=>({key,model:typeof env[key]==='string'&&/^[a-zA-Z0-9._:-]{1,160}$/.test(env[key])?env[key]:null})),
      azureModel:'prebuilt-invoice',azureApiVersion:'2024-11-30'}
  };
}
