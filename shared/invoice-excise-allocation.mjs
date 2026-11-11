// The caller supplies only the confirmed eligible lines and their resolved
// stock quantities. Allocate cents cumulatively so every cent is accounted for.
export function allocateInvoiceExcisePerPiece(exciseTotal, lines) {
  const cents = Math.round(exciseTotal * 100);
  if (!Number.isFinite(exciseTotal) || !Number.isSafeInteger(cents) || cents <= 0 ||
      Math.abs(exciseTotal - cents / 100) > 1e-9 || !Array.isArray(lines) || !lines.length) {
    throw new Error("Χρειάζεται επιβεβαιωμένο συνολικό ποσό ΕΦΚ.");
  }

  let totalPieces = 0;
  for (const line of lines) {
    if (!Number.isSafeInteger(line?.stockQuantity) || line.stockQuantity <= 0 ||
        !Number.isFinite(line.netAmount) || line.netAmount < 0 ||
        (line.exciseTotal != null && line.exciseTotal !== 0)) {
      throw new Error("Έλεγξε τα τεμάχια, την καθαρή αξία και τον υπάρχοντα ΕΦΚ ανά γραμμή.");
    }
    totalPieces += line.stockQuantity;
  }
  if (!Number.isSafeInteger(totalPieces)) throw new Error("Μη έγκυρο σύνολο τεμαχίων.");

  let cumulativePieces = 0n;
  let allocated = 0n;
  const pieces = BigInt(totalPieces);
  return lines.map(line => {
    cumulativePieces += BigInt(line.stockQuantity);
    const cumulativeCents = (BigInt(cents) * cumulativePieces * 2n + pieces) / (pieces * 2n);
    const lineExcise = Number(cumulativeCents - allocated) / 100;
    allocated = cumulativeCents;
    return {
      ...line,
      exciseTotal: lineExcise,
      netUnitCostWithExcise: (line.netAmount + lineExcise) / line.stockQuantity
    };
  });
}
