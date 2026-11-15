import XLSX from "xlsx";
import PDFDocument from "pdfkit";
import {fileURLToPath} from "node:url";
import {installationSupportRows, installationSupportTitle} from "../../../shared/installation-support-profile.mjs";

export async function installationSupportExport(company, store, format) {
  const rows = installationSupportRows(company, store);
  if (format === "xlsx") {
    const sheet = XLSX.utils.aoa_to_sheet([["Πεδίο", "Τιμή"], ...rows]);
    sheet["!cols"] = [{wch: 34}, {wch: 64}];
    const book = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(book, sheet, "Καρτέλα καταστήματος");
    return XLSX.write(book, {bookType: "xlsx", type: "buffer"});
  }

  const document = new PDFDocument({size: "A4", margin: 40, info: {Title: installationSupportTitle}});
  const chunks = [];
  const output = new Promise((resolve, reject) => {
    document.on("data", chunk => chunks.push(chunk));
    document.on("end", () => resolve(Buffer.concat(chunks)));
    document.on("error", reject);
  });
  document.font(fileURLToPath(new URL("../../assets/fonts/DejaVuSans.ttf", import.meta.url)));
  document.fontSize(16).text(installationSupportTitle).moveDown();
  for (const [label, value] of rows) {
    document.fontSize(10).text(label).fontSize(12).text(value).moveDown(0.65);
  }
  document.end();
  return output;
}
