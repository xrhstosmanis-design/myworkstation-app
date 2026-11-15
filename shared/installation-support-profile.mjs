const present = value => typeof value === "string" && value.trim() ? value.trim() : "Μη καταχωρημένο";

export const installationSupportTitle = "Στοιχεία υποστήριξης καταστήματος";

export function installationSupportRows(company, store) {
  return [
    ["Εταιρεία", present(company.name)],
    ["Κατάστημα", present(store.name)],
    ["Πόλη", present(store.city)],
    ["Διεύθυνση", present(store.address)],
    ["Email υπευθύνου", present(store.responsibleEmail)],
    ...["Υπολογιστές και εξοπλισμός", "Τεχνικός", "Απομακρυσμένη σύνδεση", "Αντίγραφα ασφαλείας"]
      .map(label => [label, "Δεν έχει ελεγχθεί"]),
  ];
}
