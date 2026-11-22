function csvText(value) {
  const text = String(value ?? "");
  const safe = /^[\s\u0000-\u001f]*[=+@-]/.test(text) ? "'" + text : text;
  return '"' + safe.replaceAll('"', '""') + '"';
}

function quantity(value) {
  if (typeof value === "string" && value.trim() !== "") value = Number(value);
  return Number.isFinite(value) ? value : null;
}

export function buildStaffStocktakeCsv(lines, showExpected) {
  const headers = ["Barcode", "SKU", "Περιγραφή", "Καταμέτρηση"];
  if (showExpected) headers.push("Θεωρητικό απόθεμα", "Διαφορά");
  const rows = lines.map(line => {
    const counted = quantity(line.countedQuantity);
    const row = [csvText(line.barcodes?.join(" / ")), csvText(line.sku), csvText(line.name), counted ?? ""];
    if (showExpected) {
      const expected = quantity(line.expectedQuantity);
      row.push(expected ?? "", counted === null || expected === null ? "" : Number((counted - expected).toPrecision(15)));
    }
    return row;
  });
  return "\uFEFF" + [headers.map(csvText), ...rows].map(row => row.join(";")).join("\r\n") + "\r\n";
}
