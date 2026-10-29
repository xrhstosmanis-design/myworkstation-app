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

// This function runs inside the detached preview window. Keep it self-contained:
// the printable document contains only one decoded PNG, never live SVG/fonts.
async function prepareRasterLabel(data) {
  const image = document.getElementById('label-image');
  const button = document.getElementById('print-label');
  const status = document.getElementById('label-status');
  const nativePrint = window.print.bind(window);
  let ready = false;
  window.print = () => { if (ready) nativePrint(); };
  button.addEventListener('click', () => window.print());
  try {
    const dpi = 300;
    const px = mm => Math.round(mm * dpi / 25.4);
    const canvas = document.createElement('canvas');
    canvas.width = px(data.widthMm);
    canvas.height = px(data.heightMm);
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('CANVAS_UNAVAILABLE');
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#000';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    const paddingX = px(2), paddingY = px(1.5);
    const innerWidth = canvas.width - paddingX * 2;
    const innerHeight = canvas.height - paddingY * 2;
    const textLine = (text, pt, weight, y) => {
      ctx.font = `${weight} ${pt * dpi / 72}px Arial, sans-serif`;
      let value = String(text).replace(/[\r\n\t]/g, ' ');
      if (ctx.measureText(value).width > innerWidth) {
        const chars = Array.from(value);
        let low = 0, high = chars.length;
        while (low < high) {
          const mid = Math.ceil((low + high) / 2);
          if (ctx.measureText(chars.slice(0, mid).join('') + '…').width <= innerWidth) low = mid;
          else high = mid - 1;
        }
        value = chars.slice(0, low).join('') + '…';
      }
      ctx.fillText(value, canvas.width / 2, y);
    };
    // Preserve the existing label's five rows and physical dimensions. Scale
    // text down only for the already-supported smallest (25mm high) labels.
    const fontScale = Math.min(1, innerHeight / px(32));
    const storeHeight = 6 * dpi / 72 * 1.1 * fontScale;
    const nameHeight = 9 * dpi / 72 * 1.1 * fontScale;
    const digitsHeight = 9 * dpi / 72 * fontScale;
    const priceHeight = 11 * dpi / 72 * 1.1 * fontScale;
    const barHeight = Math.round(innerHeight * 0.42);
    const gap = Math.max(0, (innerHeight - storeHeight - nameHeight - digitsHeight - priceHeight - barHeight) / 4);
    let y = paddingY;
    textLine(data.storeName, 6 * fontScale, 'normal', y);
    y += storeHeight + gap;
    textLine(data.productName, 9 * fontScale, 'bold', y);
    y += nameHeight + gap;
    // Integer pixel modules and a >=10-module quiet zone on both sides.
    const moduleWidth = Math.floor(innerWidth / 115);
    if (moduleWidth < 1) throw new Error('BARCODE_TOO_NARROW');
    const start = Math.floor((canvas.width - 95 * moduleWidth) / 2);
    const top = Math.round(y);
    for (let index = 0; index < data.bits.length; index += 1) {
      if (data.bits[index] !== '1') continue;
      const guard = index < 3 || (index >= 45 && index < 50) || index >= 92;
      ctx.fillRect(start + index * moduleWidth, top, moduleWidth, guard ? barHeight : Math.round(barHeight * 52 / 58));
    }
    y += barHeight + gap;
    textLine(data.barcode, 9 * fontScale, 'normal', y);
    y += digitsHeight + gap;
    textLine(data.priceText, 11 * fontScale, 'bold', y);
    const png = canvas.toDataURL('image/png');
    if (!png.startsWith('data:image/png;base64,')) throw new Error('PNG_UNAVAILABLE');
    image.src = png;
    await image.decode();
    if (image.naturalWidth !== canvas.width || image.naturalHeight !== canvas.height) throw new Error('IMAGE_INCOMPLETE');
    image.hidden = false;
    ready = true;
    document.body.dataset.labelReady = 'true';
    status.textContent = 'Η ετικέτα είναι έτοιμη για εκτύπωση ως εικόνα.';
    button.disabled = false;
  } catch {
    image.removeAttribute('src');
    image.hidden = true;
    document.body.dataset.labelReady = 'error';
    status.textContent = 'Δεν δημιουργήθηκε η εικόνα ετικέτας. Κλείστε την προεπισκόπηση και δοκιμάστε ξανά.';
  }
}

export function writeEan13Label(printWindow, {barcode, productName, price, storeName, settings}) {
  if (!isValidEan13(barcode)) throw new Error('Η ετικέτα απαιτεί έγκυρο EAN-13.');
  const dimension = (value, fallback, min, max) => {
    const number = Number(value);
    return Number.isFinite(number) && number >= min && number <= max ? number : fallback;
  };
  const widthMm = dimension(settings?.widthMm, 60, 30, 100);
  const heightMm = dimension(settings?.heightMm, 38, 25, 80);
  const escapeHtml = text => String(text ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;'}[char]));
  const priceText = Number(price || 0).toLocaleString('el-GR', {style:'currency', currency:'EUR'});
  const data = JSON.stringify({barcode, bits:encodeEan13(barcode), productName:String(productName ?? ''), storeName:String(storeName ?? ''), priceText, widthMm, heightMm}).replace(/</g, '\\u003c');
  printWindow.opener = null;
  printWindow.document.open();
  printWindow.document.write(`<!doctype html><html lang="el"><head><meta charset="utf-8"><title>Ετικέτα ${escapeHtml(barcode)}</title><style>
@page{size:${widthMm}mm ${heightMm}mm;margin:0}
html,body{margin:0;padding:0;color:#000;font-family:Arial,sans-serif}
.label{display:block;width:${widthMm}mm;height:${heightMm}mm;margin:0;break-inside:avoid;break-after:avoid}
.label[hidden]{display:none}.action{margin:16px;font-size:16px}button.action{padding:12px}
@media print{html,body{width:${widthMm}mm;height:${heightMm}mm}.action{display:none!important}.label{print-color-adjust:exact;-webkit-print-color-adjust:exact}}
</style></head><body><img id="label-image" class="label" hidden alt="${escapeHtml([storeName, productName, barcode, priceText].join(' · '))}"><button id="print-label" class="action" disabled>Εκτύπωση ετικέτας</button><p id="label-status" class="action" role="status">Προετοιμασία εικόνας ετικέτας…</p><p class="action">Προτεινόμενος εκτυπωτής: ${escapeHtml(settings?.printerName || 'επιλέξτε εκτυπωτή')} · Χαρτί ${widthMm} × ${heightMm} mm · Κλίμακα 100% · Χωρίς περιθώρια</p><script>(${prepareRasterLabel.toString()})(${data});</script></body></html>`);
  printWindow.document.close();
}
