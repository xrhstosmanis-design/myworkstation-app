import PDFDocument from "pdfkit";
import { fileURLToPath } from "node:url";

const currency = new Intl.NumberFormat("el-GR", { style: "currency", currency: "EUR" });
const unitPrice = new Intl.NumberFormat("el-GR", { minimumFractionDigits: 2, maximumFractionDigits: 6 });
const quantity = new Intl.NumberFormat("el-GR", { maximumFractionDigits: 4 });
const date = new Intl.DateTimeFormat("el-GR", { timeZone: "Europe/Athens", dateStyle: "short", timeStyle: "short", hourCycle: "h23" });

export function internalTransferPdf(transfer, lines, totals) {
  const doc = new PDFDocument({ size: "A4", margin: 42, info: { Title: "Εσωτερική διακίνηση" } });
  const chunks = [];
  const result = new Promise((resolve, reject) => {
    doc.on("data", chunk => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
  });
  doc.font(fileURLToPath(new URL("../../assets/fonts/DejaVuSans.ttf", import.meta.url)));
  doc.fontSize(19).text("Εσωτερική διακίνηση");
  doc.fontSize(10).text(`Κωδικός: ${transfer.id}`).text(date.format(new Date(transfer.createdAt)));
  doc.text(`Αποστολέας: ${transfer.sourceName}`).text(`Παραλήπτης: ${transfer.destinationName}`);
  doc.moveDown().text("Κατάσταση: " + ({ CASH: "Εξοφλήθηκε με μετρητά", BANK_TRANSFER: "Εξοφλήθηκε τραπεζικά" }[transfer.method] ?? "Επί πιστώσει")).moveDown();
  for (const [index, line] of lines.entries()) {
    const name = `${index + 1}. ${line.name}`;
    const code = [line.sku, line.barcode].filter(Boolean).join(" / ");
    const price = `${quantity.format(line.quantity)} × ${unitPrice.format(line.unitCost)} € · καθαρή αξία ${currency.format(line.net)}`;
    const tax = `ΦΠΑ ${quantity.format(line.vatRate)}%: ${currency.format(line.vat)} · Σύνολο ${currency.format(line.payable)}`;
    const height = [name, code, price, tax].reduce((sum, value) => sum + doc.heightOfString(value), 12);
    if (doc.y + height > doc.page.height - doc.page.margins.bottom) doc.addPage();
    doc.text(name);
    if (code) doc.text(code);
    doc.text(price).text(tax).moveDown(0.65);
  }
  if (doc.y + 65 > doc.page.height - doc.page.margins.bottom) doc.addPage();
  doc.moveDown().text(`Καθαρή αξία: ${currency.format(totals.net)}`)
    .text(`ΦΠΑ: ${currency.format(totals.vat)}`)
    .fontSize(13).text(`Σύνολο: ${currency.format(totals.payable)}`)
    .fontSize(9).moveDown().text("Αντίγραφο καταχώρισης MyWorkStation για τον παραλήπτη.");
  doc.end();
  return result;
}
