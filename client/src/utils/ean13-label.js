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
