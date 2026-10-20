// Unknown remuneration is not a zero wage and must never become a payroll line.
export function assertNoPendingRemuneration(employees) {
  if (employees.some(employee => employee.paymentType === "UNSET")) {
    throw Object.assign(new Error("Υπάρχουν εργαζόμενοι με αμοιβή που δεν έχει οριστεί. Συμπλήρωσε τις αμοιβές πριν από τη μισθοδοσία."), {
      status: 409, code: "WORKFORCE_REMUNERATION_PENDING"
    });
  }
}

export function assertRemunerationCanBeDeferred(employee) {
  if (employee.paymentType !== "UNSET") {
    throw Object.assign(new Error("Η ήδη ορισμένη αμοιβή δεν μπορεί να αντικατασταθεί με εκκρεμότητα."), {status: 409});
  }
}
