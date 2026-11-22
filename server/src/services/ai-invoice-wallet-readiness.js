import {z} from 'zod';
import {tariffFor,walletError} from './ai-owner-wallet-contract.js';

const pageSchema=z.object({model:z.string().min(1).max(160),apiVersion:z.string().min(1).max(50),unitMicros:z.number().int().positive().max(1000000000),maxPages:z.number().int().min(1).max(5)}).strict();
export function invoicePageTariff(env,model,apiVersion){
  let rows;
  try{rows=z.array(pageSchema).max(20).parse(JSON.parse(env.AI_OWNER_WALLET_INVOICE_AZURE_TARIFFS??env.AI_OWNER_WALLET_AZURE_TARIFFS??'[]'))}catch{throw walletError('AI_WALLET_TARIFF_REQUIRED',409)}
  const matches=rows.filter(row=>row.model===model&&row.apiVersion===apiVersion);
  if(matches.length!==1)throw walletError('AI_WALLET_TARIFF_REQUIRED',409);
  return matches[0];
}
export function invoiceWalletReadiness(env=process.env){
  const globalEnabled=env.AI_OWNER_WALLET_ENABLED==='true'&&env.AI_OWNER_WALLET_INVOICES_ENABLED==='true';
  const providerConfigured=Boolean(env.OPENAI_API_KEY&&env.AZURE_DOCUMENT_INTELLIGENCE_ENDPOINT&&env.AZURE_DOCUMENT_INTELLIGENCE_KEY);
  const models=[...new Set([env.OPENAI_INVOICE_MODEL||'gpt-5',env.OPENAI_INVOICE_FAST_MODEL||env.OPENAI_INVOICE_MODEL||'gpt-5-mini',env.OPENAI_INVOICE_FULL_MODEL||env.OPENAI_INVOICE_FAST_MODEL||'gpt-5-mini',env.OPENAI_INVOICE_ASSISTANT_MODEL||'gpt-5.6-sol'])];
  let tariffConfigured=false;
  try{
    const schedule=env.AI_OWNER_WALLET_INVOICE_TARIFFS??env.AI_OWNER_WALLET_TARIFFS;
    for(const model of models)tariffFor(model,schedule);
    // Existing POS assistant requests 30,000 output tokens. A configuration
    // switch must never silently reduce that accepted request capacity.
    if(tariffFor(env.OPENAI_INVOICE_ASSISTANT_MODEL||'gpt-5.6-sol',schedule).maxOutputTokens<30000)throw walletError('AI_WALLET_TARIFF_REQUIRED',409);
    invoicePageTariff(env,'prebuilt-invoice','2024-11-30');tariffConfigured=true;
  }catch{}
  const code=!globalEnabled?'AI_WALLET_INVOICE_DISABLED':!providerConfigured?'AI_WALLET_INVOICE_PROVIDER_REQUIRED':!tariffConfigured?'AI_WALLET_INVOICE_TARIFF_REQUIRED':null;
  return {ready:!code,globalEnabled,providerConfigured,tariffConfigured,models:models.map(model=>typeof model==='string'&&/^[a-zA-Z0-9._:-]{1,160}$/.test(model)?model:null),code};
}
export function requireInvoiceWalletReady(env=process.env){const result=invoiceWalletReadiness(env);if(!result.ready)throw walletError(result.code,409);return result}
