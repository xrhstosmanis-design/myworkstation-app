import crypto from "crypto";
import bcrypt from "bcryptjs";

const alphabet="ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

function encryptionKey(){
  if(!process.env.JWT_SECRET)throw new Error("Λείπει το JWT_SECRET.");
  return crypto.createHash("sha256").update(`${process.env.JWT_SECRET}:myworkstation-mfa`).digest();
}

export function base32Encode(buffer){
  let bits="";
  for(const byte of buffer)bits+=byte.toString(2).padStart(8,"0");
  let output="";
  for(let index=0;index<bits.length;index+=5){
    const chunk=bits.slice(index,index+5).padEnd(5,"0");
    output+=alphabet[parseInt(chunk,2)];
  }
  return output;
}

function base32Decode(value){
  const clean=String(value||"").toUpperCase().replace(/[^A-Z2-7]/g,"");
  let bits="";
  for(const char of clean){
    const position=alphabet.indexOf(char);
    if(position<0)throw new Error("Μη έγκυρο μυστικό 2FA.");
    bits+=position.toString(2).padStart(5,"0");
  }
  const bytes=[];
  for(let index=0;index+8<=bits.length;index+=8)bytes.push(parseInt(bits.slice(index,index+8),2));
  return Buffer.from(bytes);
}

export function generateTotpSecret(){
  return base32Encode(crypto.randomBytes(20));
}

export function buildOtpAuthUri({email,secret}){
  const issuer="MyWorkStation";
  const label=encodeURIComponent(`${issuer}:${email}`);
  return `otpauth://totp/${label}?secret=${encodeURIComponent(secret)}&issuer=${encodeURIComponent(issuer)}&algorithm=SHA1&digits=6&period=30`;
}

function hotp(secret,counter){
  const counterBuffer=Buffer.alloc(8);
  counterBuffer.writeBigUInt64BE(BigInt(counter));
  const digest=crypto.createHmac("sha1",base32Decode(secret)).update(counterBuffer).digest();
  const offset=digest[digest.length-1]&15;
  const number=(digest.readUInt32BE(offset)&0x7fffffff)%1000000;
  return String(number).padStart(6,"0");
}

export function verifyTotp(secret,code,{window=1,now=Date.now()}={}){
  const normalized=String(code||"").replace(/\s/g,"");
  if(!/^\d{6}$/.test(normalized))return false;
  const counter=Math.floor(now/30000);
  for(let delta=-window;delta<=window;delta++){
    const expected=hotp(secret,counter+delta);
    const a=Buffer.from(expected),b=Buffer.from(normalized);
    if(a.length===b.length&&crypto.timingSafeEqual(a,b))return true;
  }
  return false;
}

export function encryptTotpSecret(secret){
  const iv=crypto.randomBytes(12);
  const cipher=crypto.createCipheriv("aes-256-gcm",encryptionKey(),iv);
  const ciphertext=Buffer.concat([cipher.update(secret,"utf8"),cipher.final()]);
  const tag=cipher.getAuthTag();
  return `v1.${iv.toString("base64url")}.${tag.toString("base64url")}.${ciphertext.toString("base64url")}`;
}

export function decryptTotpSecret(value){
  const [version,ivText,tagText,cipherText]=String(value||"").split(".");
  if(version!=="v1"||!ivText||!tagText||!cipherText)throw new Error("Μη έγκυρο αποθηκευμένο μυστικό 2FA.");
  const decipher=crypto.createDecipheriv("aes-256-gcm",encryptionKey(),Buffer.from(ivText,"base64url"));
  decipher.setAuthTag(Buffer.from(tagText,"base64url"));
  return Buffer.concat([decipher.update(Buffer.from(cipherText,"base64url")),decipher.final()]).toString("utf8");
}

export function generateRecoveryCodes(count=8){
  const chars="ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  return Array.from({length:count},()=>{
    let raw="";
    for(let index=0;index<10;index++)raw+=chars[crypto.randomInt(chars.length)];
    return `${raw.slice(0,5)}-${raw.slice(5)}`;
  });
}

export async function hashRecoveryCodes(codes){
  return Promise.all(codes.map(code=>bcrypt.hash(code.replace(/[^A-Z0-9]/gi,"").toUpperCase(),10)));
}

export async function consumeRecoveryCode(storedJson,candidate){
  const normalized=String(candidate||"").replace(/[^A-Z0-9]/gi,"").toUpperCase();
  if(normalized.length<8)return {matched:false,remaining:storedJson};
  let hashes=[];
  try{hashes=JSON.parse(storedJson||"[]")}catch{hashes=[]}
  for(let index=0;index<hashes.length;index++){
    if(await bcrypt.compare(normalized,hashes[index])){
      hashes.splice(index,1);
      return {matched:true,remaining:JSON.stringify(hashes)};
    }
  }
  return {matched:false,remaining:storedJson};
}
