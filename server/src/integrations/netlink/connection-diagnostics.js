const settings=new Set(["NETLINK_TOKEN_URL","NETLINK_API_BASE","NETLINK_CLIENT_ID","NETLINK_CLIENT_SECRET","NETLINK_USERNAME","NETLINK_PASSWORD"]);
const networkCodes=new Set(["ENOTFOUND","EAI_AGAIN","ECONNREFUSED","ECONNRESET","ETIMEDOUT","UND_ERR_CONNECT_TIMEOUT","CERT_HAS_EXPIRED","UNABLE_TO_VERIFY_LEAF_SIGNATURE"]);

// Project only known enums/numbers. Provider messages can echo passwords or tokens.
export function netlinkConnectionFailure(error,{stage,diagnosticId}){
  const safeStage=error?.netlinkCheckStage==="AUTH"?"AUTH":["CONFIG","CATALOGUE"].includes(stage)?stage:"CATALOGUE";
  const diagnostic={diagnosticId,stage:safeStage,reason:"UNEXPECTED_RESPONSE"};
  const status=error?.providerStatus;
  if(Number.isInteger(status)&&status>=100&&status<=599)diagnostic.providerStatus=status;
  const networkCode=networkCodes.has(error?.cause?.code)?error.cause.code:networkCodes.has(error?.code)?error.code:null;
  let message;
  if(error?.code==="NETLINK_NOT_CONFIGURED"&&settings.has(error?.setting)){
    diagnostic.reason="MISSING_SERVER_SETTING";diagnostic.setting=error.setting;
    message=`Λείπει η ρύθμιση ${error.setting} από τον server MyWorkStation. Δεν χρειάζεται αλλαγή των στοιχείων καταστήματος.`;
  }else if(error?.name==="TimeoutError"||error?.name==="AbortError"||networkCode==="ETIMEDOUT"||networkCode==="UND_ERR_CONNECT_TIMEOUT"){
    diagnostic.reason="TIMEOUT";message="Η Netlink δεν απάντησε μέσα στον διαθέσιμο χρόνο.";
  }else if(networkCode){
    diagnostic.reason="NETWORK";diagnostic.networkCode=networkCode;message="Αποτυχία επικοινωνίας του server MyWorkStation με τη Netlink (δίκτυο ή πιστοποιητικό).";
  }else if(safeStage==="AUTH"){
    diagnostic.reason=error?.code==="NETLINK_INVALID_TOKEN"?"INVALID_TOKEN":diagnostic.providerStatus?"AUTH_REJECTED":"AUTH_CONNECTION_FAILED";
    message="Απέτυχε η σύνδεση στο API της Netlink. Χρειάζεται έλεγχος της πρόσβασης API και των στοιχείων εφαρμογής/καταστήματος.";
  }else if(safeStage==="CONFIG"){
    diagnostic.reason="SERVER_CONFIGURATION";message="Απέτυχε η προετοιμασία της σύνδεσης Netlink στον server MyWorkStation.";
  }else{
    diagnostic.reason=diagnostic.providerStatus?"CATALOGUE_REJECTED":"CATALOGUE_CONNECTION_FAILED";
    message="Απέτυχε η λήψη του καταλόγου Netlink. Χρειάζεται έλεγχος της διεύθυνσης API και των δικαιωμάτων πρόσβασης.";
  }
  const label={CONFIG:"Ρύθμιση server",AUTH:"Σύνδεση API",CATALOGUE:"Κατάλογος"}[safeStage];
  return {error:`${message} Στάδιο: ${label}${diagnostic.providerStatus?` · HTTP ${diagnostic.providerStatus}`:""}. Αναφορά: ${diagnosticId}`,code:"NETLINK_CONNECTION_CHECK_FAILED",diagnostic};
}
