export const sharedCostReviewDecisions=Object.freeze(['PENDING','APPROVED_DRAFT','WAIVED']);

// Temporary operator review of an immutable preview, never a posting instruction.
// Waiving a share leaves that amount with the platform; it is not redistributed.
export function summarizeSharedCostReview(preview,decisions={}){
  const fail=()=>{throw new Error('Μη έγκυρο προσχέδιο ελέγχου χρέωσης.');};
  const cents=value=>{if(typeof value!=='string'||!/^(0|[1-9]\d{0,8})$/.test(value))fail();return BigInt(value);};
  if(preview?.previewOnly!==true||preview.currency!=='EUR'||!Array.isArray(preview.companies)||!preview.companies.length||preview.companies.length>1000||!decisions||typeof decisions!=='object'||Array.isArray(decisions))fail();
  const ids=new Set(),totals={PENDING:0n,APPROVED_DRAFT:0n,WAIVED:0n};
  const rows=preview.companies.map(row=>{
    if(typeof row?.companyId!=='string'||!row.companyId||ids.has(row.companyId))fail();
    ids.add(row.companyId);
    const decision=Object.hasOwn(decisions,row.companyId)?decisions[row.companyId]:'PENDING';
    if(!sharedCostReviewDecisions.includes(decision))fail();
    totals[decision]+=cents(row.amountCents);
    return {...row,decision};
  });
  if(Object.keys(decisions).some(id=>!ids.has(id)))fail();
  const total=cents(preview.totalCents);
  if(totals.PENDING+totals.APPROVED_DRAFT+totals.WAIVED!==total)fail();
  return {temporary:true,posted:false,totalCents:String(total),approvedCents:String(totals.APPROVED_DRAFT),pendingCents:String(totals.PENDING),waivedCents:String(totals.WAIVED),rows};
}
