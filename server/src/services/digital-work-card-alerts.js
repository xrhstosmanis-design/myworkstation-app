import {greeceExportValue} from "../../../shared/greece-time.mjs";
import {sendEmail} from "./mail.js";
import {normalizeReportRecipients, reportRecipientListSchema} from "./report-recipients.js";

const kinds = {
  REST_DAY:"Έναρξη εργασίας σε δηλωμένο ρεπό",
  NO_SCHEDULE:"Έναρξη εργασίας χωρίς δηλωμένη βάρδια",
  IN_REJECTED:"Το ΕΡΓΑΝΗ απέρριψε την προσέλευση",
  OUT_REJECTED:"Το ΕΡΓΑΝΗ απέρριψε την αποχώρηση",
  IN_UNKNOWN:"Εκκρεμεί επιβεβαίωση προσέλευσης από το ΕΡΓΑΝΗ",
  OUT_UNKNOWN:"Εκκρεμεί επιβεβαίωση αποχώρησης από το ΕΡΓΑΝΗ",
  DUPLICATE_ENTRY:"Πιθανό διπλό χτύπημα προσέλευσης",
  OVERTIME:"Υπέρβαση δηλωμένου ωραρίου",
  CLOSE_PENDING:"Εκκρεμεί αποχώρηση στο κλείσιμο ταμείου"
};

export function digitalWorkCardAlertKinds({type, status, declaredRestDay, declaredStartAt, declaredEndAt, departureAt, overtimeThresholdMinutes}) {
  const alerts = [];
  if (type === "IN" && status === "ACCEPTED") {
    if (declaredRestDay) alerts.push("REST_DAY");
    else if (!declaredStartAt || !declaredEndAt) alerts.push("NO_SCHEDULE");
  }
  if (["IN","OUT"].includes(type) && ["REJECTED","UNKNOWN"].includes(status)) alerts.push(`${type}_${status}`);
  if (type === "OUT" && status === "ACCEPTED" && declaredEndAt && departureAt
    && Number.isInteger(overtimeThresholdMinutes) && overtimeThresholdMinutes >= 0) {
    const overrunMs = new Date(departureAt) - new Date(declaredEndAt);
    if (overrunMs > overtimeThresholdMinutes * 60_000) alerts.push("OVERTIME");
  }
  return alerts;
}

async function alertRecipients({db, companyId, session, audience, trialRecipients}) {
  if (audience === "LAB") {
    const parsed = reportRecipientListSchema.safeParse(trialRecipients ?? "");
    return parsed.success ? normalizeReportRecipients(parsed.data) : [];
  }
  if (audience !== "STORE_MANAGEMENT") return [];

  const owners = await db.user.findMany({where:{companyId, role:"OWNER"}, select:{email:true}});
  return normalizeReportRecipients([...owners.map(owner => owner.email), session.store.responsibleEmail])
    .filter(email => reportRecipientListSchema.safeParse(email).success);
}

export async function sendDigitalWorkCardAlert({db, companyId, storeId, sessionId, kind, audience, trialRecipients, mail = sendEmail}) {
  if (!Object.hasOwn(kinds, kind) || !["LAB","STORE_MANAGEMENT"].includes(audience)) return;
  const session = await db.digitalWorkSession.findFirst({
    where:{id:sessionId, storeId, store:{companyId}},
    select:{entryAt:true, departureAt:true, employee:{select:{fullName:true}}, store:{select:{name:true, responsibleEmail:true}}}
  });
  if (!session) return;

  const recipients = await alertRecipients({db, companyId, session, audience, trialRecipients});
  if (!recipients.length) return;

  const key = {sessionId, kind};
  const reservation = await db.digitalWorkAlert.createMany({data:{...key, status:"UNKNOWN"}, skipDuplicates:true});
  if (!reservation.count) return;
  const subject = `${audience === "LAB" ? "[LAB] " : ""}Ψηφιακή Κάρτα Εργασίας · ${kinds[kind]}`;
  const when = (kind.startsWith("OUT_") || kind === "OVERTIME") ? session.departureAt : ["CLOSE_PENDING","DUPLICATE_ENTRY"].includes(kind) ? new Date() : session.entryAt;
  let status = "UNKNOWN";
  try {
    const receipt = await mail({
      companyId, storeId, to:recipients, subject, includeDeliveryResult:true,
      text:[
        kinds[kind],
        `Κατάστημα · ${session.store.name}`,
        `Εργαζόμενος · ${session.employee.fullName}`,
        `Ώρα · ${greeceExportValue(when)}`,
        `Συμβάν · ${sessionId}`,
        "BackOffice → Ψηφιακή Κάρτα Εργασίας"
      ].join("\n")
    });
    if (receipt.accepted?.length) status = receipt.rejected?.length ? "PARTIAL" : "SENT";
  } catch {
    // An uncertain delivery is retained for review without automatic resending.
  }
  await db.digitalWorkAlert.update({
    where:{sessionId_kind:key},
    data:{status, sentAt:status === "UNKNOWN" ? null : new Date()}
  });
}
