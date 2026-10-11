// Display only: preserve the original stored description and never infer missing notes.
const declarations = [
  "Δηλώνω υπεύθυνα ότι ανοίγω το συρτάρι, καταβάλλω το ποσό από τα μετρητά της βάρδιας και αναλαμβάνω την ευθύνη της καταχώρισης.",
  "Δηλώνω υπεύθυνα ότι παρέλαβα το ποσό σε μετρητά και το κατέθεσα στο συρτάρι της ενεργής βάρδιας.",
  "Δηλώνω υπεύθυνα ότι πραγματοποιώ την εξωτερική πληρωμή και αναλαμβάνω την ευθύνη της καταχώρισης.",
];

export function auditExpenseReason(item) {
  if (item?.eventType !== "OTHER_EXPENSE") return "";
  const description = String(item.description ?? "").trim();
  const marker = "ΧΩΡΙΣ ΠΑΡΑΣΤΑΤΙΚΟ — ";
  if (!description.startsWith("ΧΩΡΙΣ ΠΑΡΑΣΤΑΤΙΚΟ")) return description;
  for (const declaration of declarations) {
    const prefix = marker + declaration;
    if (description.startsWith(prefix) &&
        (description.length === prefix.length || /\s/.test(description[prefix.length]))) {
      return description.slice(prefix.length).trim();
    }
  }
  return "";
}
