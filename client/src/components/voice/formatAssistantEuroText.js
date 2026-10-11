// Presentation only: canonical evidence and the provider response stay unchanged.
const currency = new Intl.NumberFormat("el-GR", {
  style: "currency", currency: "EUR", minimumFractionDigits: 2, maximumFractionDigits: 2,
});
function formatLongEuroToken(amount, original) {
  const separator = Math.max(amount.lastIndexOf("."), amount.lastIndexOf(","));
  if (separator < 0) return original;
  const fraction = amount.slice(separator + 1);
  // Three digits can be a thousands group. Never reinterpret ambiguous money.
  if (!/^\d{4,}$/.test(fraction)) return original;
  const decimal = amount[separator];
  const grouping = decimal === "," ? "." : ",";
  const signedInteger = amount.slice(0, separator);
  const sign = /^[+-]/.test(signedInteger) ? signedInteger[0] : "";
  const integer = signedInteger.slice(sign.length);
  if (!/^\d+$/.test(integer)) {
    const groups = integer.split(grouping);
    if (groups.length < 2 || !/^\d{1,3}$/.test(groups[0]) ||
        !groups.slice(1).every(group => /^\d{3}$/.test(group))) return original;
  }
  const normalized = sign + integer.split(grouping).join("") + "." + fraction;
  const value = Number(normalized);
  if (!Number.isFinite(value) || Math.abs(value) > Number.MAX_SAFE_INTEGER / 100) return original;
  return currency.format(value);
}
export function formatAssistantEuroText(text) {
  if (typeof text !== "string") return text;
  return text
    .replace(/€[ \t\u00a0\u202f]*([+-]?\d+(?:[.,]\d+)*)/g,
      (token, amount) => formatLongEuroToken(amount, token))
    .replace(/([+-]?\d+(?:[.,]\d+)*)[ \t\u00a0\u202f]*€/g,
      (token, amount) => formatLongEuroToken(amount, token));
}
