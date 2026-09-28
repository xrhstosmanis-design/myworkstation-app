import crypto from "crypto";

export function tableOrderPayloadHash(body){
  return crypto.createHash("sha256").update(JSON.stringify({tableId:body.tableId,notes:body.notes||null,items:body.items})).digest("hex");
}

export function tableOrderReplay(existing,actorId,payloadHash){
  if(!existing)return null;
  if(existing.actorId!==actorId||existing.payloadHash!==payloadHash){
    const error=new Error("Αυτό το αναγνωριστικό αποστολής χρησιμοποιήθηκε για διαφορετικό γύρο. Έλεγξε το τραπέζι και την ουρά πριν από νέα αποστολή.");
    error.status=409;
    throw error;
  }
  return existing.resultJson;
}
