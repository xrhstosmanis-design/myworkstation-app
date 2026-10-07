// Only standardized error names are exposed; provider messages may contain sensitive URLs.
const names=new Set(["AbortError","NotAllowedError","InvalidStateError","NotSupportedError","InvalidAccessError","SecurityError","NetworkError","OperationError","TypeError"]);
const safeName=error=>names.has(error?.name)?error.name:"UnknownError";
export const pushSubscriptionFailure=(firstError,retryError)=>
  `Δεν ολοκληρώθηκε η εγγραφή Push. Κωδικός διάγνωσης: PUSH_SUBSCRIBE / ${safeName(firstError)} / ${safeName(retryError)}. Κράτησε αυτόν τον κωδικό για τον έλεγχο.`;
