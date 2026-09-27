const left = ["0001101", "0011001", "0010011", "0111101", "0100011", "0110001", "0101111", "0111011", "0110111", "0001011"];
const even = ["0100111", "0110011", "0011011", "0100001", "0011101", "0111001", "0000101", "0010001", "0001001", "0010111"];
const right = ["1110010", "1100110", "1101100", "1000010", "1011100", "1001110", "1010000", "1000100", "1001000", "1110100"];
const parity = ["LLLLLL", "LLGLGG", "LLGGLG", "LLGGGL", "LGLLGG", "LGGLLG", "LGGGLL", "LGLGLG", "LGLGGL", "LGGLGL"];

export function isValidEan13(value) {
  if (typeof value !== "string" || !/^\d{13}$/.test(value)) return false;
  const sum = [...value.slice(0, 12)].reduce((total, digit, index) => total + Number(digit) * (index % 2 ? 3 : 1), 0);
  return (10 - (sum % 10)) % 10 === Number(value[12]);
}

export function encodeEan13(value) {
  if (!isValidEan13(value)) throw new Error("Το EAN-13 δεν έχει έγκυρο ψηφίο ελέγχου.");
  const mode = parity[Number(value[0])];
  let bits = "101";
  for (let index = 0; index < 6; index += 1) {
    const digit = Number(value[index + 1]);
    bits += mode[index] === "L" ? left[digit] : even[digit];
  }
  bits += "01010";
  for (let index = 7; index < 13; index += 1) bits += right[Number(value[index])];
  return bits + "101";
}

export function writeEan13Label(printWindow,{barcode,productName,price,storeName,settings}) {
  if (!isValidEan13(barcode)) throw new Error("Η ετικέτα απαιτεί έγκυρο EAN-13.");
  const escapeHtml=text=>String(text??"").replace(/[&<>"']/g,char=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[char]));
  const bits=encodeEan13(barcode);
  const bars=[...bits].map((bit,index)=>bit==="1"?`<rect x="${20+index*2}" y="0" width="2" height="${index<3||index>=45&&index<50||index>=92?58:52}"/>`:"").join("");
  const widthMm=Number(settings?.widthMm)||60,heightMm=Number(settings?.heightMm)||38;
  const priceText=Number(price||0).toLocaleString("el-GR",{style:"currency",currency:"EUR"});
  printWindow.opener=null;
  printWindow.document.open();
  printWindow.document.write(`<!doctype html><html lang="el"><head><meta charset="utf-8"><title>Ετικέτα ${escapeHtml(barcode)}</title><style>@page{size:${widthMm}mm ${heightMm}mm;margin:0}body{font-family:Arial,sans-serif;margin:0;color:#000}.label{box-sizing:border-box;width:${widthMm}mm;height:${heightMm}mm;padding:1.5mm 2mm;text-align:center;overflow:hidden;display:flex;flex-direction:column;align-items:center;justify-content:space-between}.store{font-size:6pt;line-height:1.1;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;width:100%}.name{font-size:9pt;line-height:1.1;font-weight:bold;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;width:100%}.barcode{display:block;width:100%;height:42%;min-height:9mm}.digits{font-size:9pt;line-height:1;letter-spacing:1px}.price{font-size:11pt;line-height:1.1;font-weight:bold}.action{margin:16px;font-size:16px}@media print{.action{display:none}}</style></head><body><div class="label"><div class="store">${escapeHtml(storeName)}</div><div class="name">${escapeHtml(productName)}</div><svg class="barcode" viewBox="0 0 230 62" preserveAspectRatio="none" xmlns="http://www.w3.org/2000/svg" aria-label="EAN-13 ${escapeHtml(barcode)}" shape-rendering="crispEdges"><g fill="#000">${bars}</g></svg><div class="digits">${escapeHtml(barcode)}</div><div class="price">${escapeHtml(priceText)}</div></div><button class="action" onclick="window.print()">Εκτύπωση ετικέτας</button><p class="action">Προτεινόμενος εκτυπωτής: ${escapeHtml(settings?.printerName||"επιλέξτε εκτυπωτή")} · Χαρτί ${widthMm} × ${heightMm} mm · Κλίμακα 100% · Χωρίς περιθώρια</p></body></html>`);
  printWindow.document.close();
}
