import {walletError} from './ai-owner-wallet-contract.js';

// Optional rollout boundary: permits an isolated LAB acceptance while the
// already-enabled real-company Owner wallet keeps its existing behavior.
export function invoiceWalletCompanyAllowed(companyId,env=process.env){
  const source=env.AI_OWNER_WALLET_INVOICE_COMPANIES;
  if(source===undefined)return true; // existing installations remain compatible
  let ids;
  try{ids=JSON.parse(source)}catch{throw walletError('AI_WALLET_TARIFF_REQUIRED',409)}
  if(!Array.isArray(ids)||ids.length>500||ids.some(id=>typeof id!=='string'||!id||id.trim()!==id||id.length>160)||new Set(ids).size!==ids.length)throw walletError('AI_WALLET_TARIFF_REQUIRED',409);
  return ids.includes(companyId);
}

// Explicit, audited company choices override only the legacy rollout list.
// The global runtime kill switches remain independent and authoritative.
export async function resolvedInvoiceWalletCompany(repository,companyId,env=process.env){
  const fallback=env.AI_OWNER_WALLET_INVOICES_ENABLED==='true'?invoiceWalletCompanyAllowed(companyId,env):false;
  return repository.invoiceEnabledFor?repository.invoiceEnabledFor(companyId,fallback):fallback;
}

