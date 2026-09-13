import crypto from "crypto";

function encryptionKey(){
  const source=String(process.env.INTEGRATION_CREDENTIALS_KEY||process.env.PARAMETERS_ENCRYPTION_KEY||"");
  if(!source)throw Object.assign(new Error("Δεν έχει οριστεί το INTEGRATION_CREDENTIALS_KEY στον server."),{status:503});
  return crypto.createHash("sha256").update(source,"utf8").digest();
}

export function encryptStoreIntegrationValue(value){
  const iv=crypto.randomBytes(12);
  const cipher=crypto.createCipheriv("aes-256-gcm",encryptionKey(),iv);
  const ciphertext=Buffer.concat([cipher.update(JSON.stringify(value),"utf8"),cipher.final()]);
  return `v1:${iv.toString("base64")}:${cipher.getAuthTag().toString("base64")}:${ciphertext.toString("base64")}`;
}

export function decryptStoreIntegrationValue(value){
  const [version,iv,tag,ciphertext]=String(value||"").split(":");
  if(version!=="v1"||!iv||!tag||!ciphertext)throw new Error("Μη έγκυρη κρυπτογραφημένη διασύνδεση.");
  const decipher=crypto.createDecipheriv("aes-256-gcm",encryptionKey(),Buffer.from(iv,"base64"));
  decipher.setAuthTag(Buffer.from(tag,"base64"));
  return JSON.parse(Buffer.concat([decipher.update(Buffer.from(ciphertext,"base64")),decipher.final()]).toString("utf8"));
}

export function constantTimeSecretEquals(received,expected){
  const left=Buffer.from(String(received||""),"utf8");
  const right=Buffer.from(String(expected||""),"utf8");
  if(!left.length||left.length!==right.length)return false;
  return crypto.timingSafeEqual(left,right);
}
