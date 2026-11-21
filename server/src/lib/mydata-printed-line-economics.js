// Deliberately layout-specific. Values absent from the printed original are never
// inferred from catalogue prices or the already discounted XML unit value.
const PROFILE = 'E_INVOICING_DETAILED_LINE_AMOUNT_V1';
const POW = n => 10n ** BigInt(n);
const money = n => fixed(n, 2);
function fixed(n, scale) {
  const s = n.toString().padStart(scale + 1, '0');
  return scale ? `${s.slice(0, -scale)}.${s.slice(-scale)}` : s;
}
function decimal(value, scale, printed = false) {
  if (typeof value !== 'string' && typeof value !== 'number') throw new Error('decimal');
  let s = String(value).trim();
  if (printed) {
    if (!/^(?:\d{1,3}(?:\.\d{3})*|\d+),\d{2,6}$/.test(s)) throw new Error('printed decimal');
    s = s.replace(/\./g, '').replace(',', '.');
  }
  if (!/^\d{1,9}(?:\.\d{1,8})?$/.test(s)) throw new Error('decimal');
  const [whole, fraction = ''] = s.split('.');
  if (fraction.length > scale && /[1-9]/.test(fraction.slice(scale))) throw new Error('precision');
  return BigInt(whole) * POW(scale) + BigInt(fraction.slice(0, scale).padEnd(scale, '0') || '0');
}
const round = (numerator, denominator) => (numerator + denominator / 2n) / denominator;
export function printedEconomicsProfileForUrl(value) {
  if (typeof value !== 'string' || value.length > 500) return null;
  try {
    const url = new URL(value);
    return url.href === value && url.protocol === 'https:' && url.hostname === 'e-invoicing.gr' && !url.port && !url.username && !url.password && !url.search && !url.hash &&
      /^\/edocuments\/ViewInvoice\/-1\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}_[A-Za-z0-9]{6,8}\/pdf$/.test(url.pathname)
      ? PROFILE : null;
  } catch { return null; }
}

export function parseMyDataPrintedLineEconomics(input) {
  try { return parse(input); } catch { return null; }
}
function parse(input) {
  const { text, xmlLines, totalNet, totalVat, totalGross, pageCount, profile } = input || {};
  if (profile !== PROFILE || pageCount !== 1 || typeof text !== 'string' || text.length < 100 || text.length > 200000 ||
      !Array.isArray(xmlLines) || xmlLines.length < 1 || xmlLines.length > 250) return null;
  // Filled only from the captured original's exact token sequence. Unsupported
  // headers remain UNKNOWN rather than accepting a generic numeric-row guess.
  const tokens = text.split(/\r?\n/).map(s => s.trim()).filter(Boolean);
  return parseTokens(tokens, xmlLines, {totalNet, totalVat, totalGross});
}
const HEADERS = ['ΚΩΔΙΚΟΣ','ΠΕΡΙΓΡΑΦΗ','ΜΜ','ΠΟΣΟΤΗΤΑ','ΤΙΜΗ ΜΟΝ.','ΑΞΙΑ ΠΡΟ ΕΚΠΤ.','ΕΚΠΤ.','ΚΑΘΑΡΗ ΑΞΙΑ','ΦΠΑ%'];
const FOOTERS = ['Αξία προ έκπτωσης','Έκπτωση','Επιβάρυνση','Καθαρή Αξία','Φ.Π.Α','ΤΕΛΙΚΗ ΑΞΙΑ'];
const VAT = new Map([[1,24],[2,13],[3,6],[4,17],[5,9],[6,4],[7,0]]);
function parseTokens(tokens, xmlLines, totals) {
  const starts = tokens.flatMap((v, i) => v === HEADERS[0] && HEADERS.every((h, n) => tokens[i+n] === h) ? [i] : []);
  if (starts.length !== 1 || FOOTERS.some(label => tokens.filter(token => token === label).length !== 1)) return null;
  let i = starts[0] + HEADERS.length;
  const rows = [], codes = new Set();
  let sumInitial = 0n, sumDiscount = 0n, sumNet = 0n, sumVat = 0n;
  while (tokens[i] !== FOOTERS[0]) {
    if (rows.length >= xmlLines.length || !/^[A-Za-z0-9][A-Za-z0-9._-]{0,49}$/.test(tokens[i] || '')) return null;
    const itemCode = tokens[i++];
    if (codes.has(itemCode)) return null;
    codes.add(itemCode);
    const description = [];
    while (tokens[i] && tokens[i] !== 'ΤΕΜ' && description.length < 12) description.push(tokens[i++]);
    if (tokens[i++] !== 'ΤΕΜ' || !description.length || description.join(' ').length > 500) return null;
    const quantity = decimal(tokens[i++], 6, true), price = decimal(tokens[i++], 6, true);
    const initial = decimal(tokens[i++], 2, true), discount = decimal(tokens[i++], 2, true), net = decimal(tokens[i++], 2, true);
    const rateToken = tokens[i++];
    if (!/^(?:0|4|6|9|13|17|24)%$/.test(rateToken || '') || quantity <= 0n || price <= 0n) return null;
    const rate = Number(rateToken.slice(0,-1)), xml = xmlLines[rows.length];
    if (xml.lineNumber !== rows.length + 1 || xml.itemCode !== itemCode || xml.measurementUnit !== 1 ||
        decimal(xml.quantity,6) !== quantity || decimal(xml.netValue,2) !== net || VAT.get(xml.vatCategory) !== rate) return null;
    const base = quantity * price;
    if (round(base, POW(10)) !== initial || discount > initial || initial - discount !== net) return null;
    const percent = round(discount * POW(20), base);
    if (percent > POW(10) || round(base * (POW(10)-percent),POW(20)) !== net) return null;
    const vat = round(net * BigInt(rate),100n);
    if (decimal(xml.vatAmount,2) !== vat) return null;
    rows.push({lineNumber:rows.length+1,itemCode,quantity:fixed(quantity,6),unitCost:fixed(price,6),initialUnitCost:fixed(price,6),
      discount1:fixed(percent,8),discount2:'0.00000000',discount3:'0.00000000',printedInitialAmount:money(initial),
      printedDiscountSteps:[{kind:'LINE_AMOUNT',amount:money(discount)}],netValue:money(net),vatRate:rate,vatAmount:money(vat)});
    sumInitial += initial; sumDiscount += discount; sumNet += net; sumVat += vat;
  }
  if (rows.length !== xmlLines.length) return null;
  const footer = [];
  for (const label of FOOTERS) {
    if (tokens[i++] !== label || !/^(?:\d{1,3}(?:\.\d{3})*|\d+),\d{2}EUR$/.test(tokens[i] || '')) return null;
    footer.push(decimal(tokens[i++].slice(0,-3),2,true));
  }
  if (footer[0] !== sumInitial || footer[1] !== sumDiscount || footer[2] !== 0n || footer[3] !== sumNet ||
      footer[4] !== sumVat || footer[5] !== sumNet+sumVat || decimal(totals.totalNet,2) !== sumNet ||
      decimal(totals.totalVat,2) !== sumVat || decimal(totals.totalGross,2) !== sumNet+sumVat) return null;
  return {version:'PRINTED_LINE_ECONOMICS_V1',profile:PROFILE,rows,
    totals:{initial:money(sumInitial),discount:money(sumDiscount),net:money(sumNet),vat:money(sumVat),gross:money(sumNet+sumVat)}};
}
