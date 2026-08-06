import test from "node:test";
import assert from "node:assert/strict";

process.env.JWT_SECRET="test-only-jwt-secret-with-sufficient-length";

const {
  consumeRecoveryCode,
  decryptTotpSecret,
  encryptTotpSecret,
  hashRecoveryCodes,
  verifyTotp
}=await import("../src/security/totp.js");

test("verifies RFC 6238 SHA-1 six digit sample",()=>{
  const secret="GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ";
  assert.equal(verifyTotp(secret,"287082",{window:0,now:59000}),true);
  assert.equal(verifyTotp(secret,"287083",{window:0,now:59000}),false);
});

test("encrypts and decrypts TOTP secrets",()=>{
  const secret="JBSWY3DPEHPK3PXP";
  const encrypted=encryptTotpSecret(secret);
  assert.notEqual(encrypted,secret);
  assert.equal(decryptTotpSecret(encrypted),secret);
});

test("recovery codes are single use",async()=>{
  const codes=["ABCDE-23456","FGHJK-789AB"];
  const stored=JSON.stringify(await hashRecoveryCodes(codes));
  const first=await consumeRecoveryCode(stored,"ABCDE-23456");
  assert.equal(first.matched,true);
  const reused=await consumeRecoveryCode(first.remaining,"ABCDE-23456");
  assert.equal(reused.matched,false);
  const second=await consumeRecoveryCode(first.remaining,"FGHJK-789AB");
  assert.equal(second.matched,true);
});
