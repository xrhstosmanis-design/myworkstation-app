const issuedStatuses=new Set(["ISSUED"]);

export function validFiscalReceipt(document){
  return Boolean(
    document&&
    issuedStatuses.has(String(document.status||"").trim().toUpperCase())&&
    String(document.fiscalNumber||"").trim()&&
    document.issuedAt
  );
}

export function fiscalReceiptError(){
  const error=new Error("Η κάρτα και το PIN εκδίδονται μόνο αφού επιβεβαιωθεί επιτυχώς η φορολογική απόδειξη από την ταμειακή.");
  error.status=409;
  error.code="NETLINK_FISCAL_RECEIPT_REQUIRED";
  return error;
}
