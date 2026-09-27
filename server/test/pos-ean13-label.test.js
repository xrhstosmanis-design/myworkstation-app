import test from "node:test";
import assert from "node:assert/strict";
import {encodeEan13,isValidEan13,writeEan13Label} from "../../client/src/utils/ean13-label.js";

test("EAN-13 label encodes a verified retail code into 95 scanner modules",()=>{
  const code="4006381333931";
  assert.equal(isValidEan13(code),true);
  const bits=encodeEan13(code);
  assert.equal(bits.length,95);
  assert.equal(bits.slice(0,24),"101000110101001110101111");
  assert.equal(bits.slice(45,50),"01010");
  assert.equal(bits.slice(-3),"101");
});

test("EAN-13 labels reject a wrong checksum and non EAN input",()=>{
  for(const code of ["4006381333932","400638133393","abc4006381333","40063813339310"]){
    assert.equal(isValidEan13(code),false);
    assert.throws(()=>encodeEan13(code),/EAN-13/);
  }
});

test("invalid EAN never writes a printable label",()=>{
  let writes=0;
  const printWindow={document:{open(){writes++},write(){writes++},close(){writes++}}};
  assert.throws(()=>writeEan13Label(printWindow,{barcode:"4006381333932",productName:"LAB",price:1}),/EAN-13/);
  assert.equal(writes,0);
});
