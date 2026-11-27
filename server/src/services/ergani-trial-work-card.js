import {greeceDateTimeInput, greeceRangeDate} from "../../../shared/greece-time.mjs";

const TRIAL_API = "https://trialv2eservices.yeka.gr/WebServicesApi/api/";
const TRIAL_ENDPOINT = TRIAL_API + "Documents/WRKCardSE";
const uncertain = () => ({status:"UNKNOWN", reference:null, error:"Το ΕΡΓΑΝΗ δεν επέστρεψε επιβεβαιωμένο αποτέλεσμα."});

function cardPayload({employerTaxId, branchNumber, employeeTaxId, firstName, lastName, type, referenceDate, occurredAt}) {
  if (!/^\d{9}$/.test(employerTaxId ?? "") || !/^\d{9}$/.test(employeeTaxId ?? "")
    || !/^\d+$/.test(branchNumber ?? "") || !firstName?.trim() || !lastName?.trim()
    || !["IN", "OUT"].includes(type) || !/^\d{4}-\d{2}-\d{2}$/.test(referenceDate ?? "")
    || !(occurredAt instanceof Date) || !Number.isFinite(occurredAt.getTime())) {
    throw new Error("Λείπουν έγκυρα στοιχεία για την υποβολή στο ΕΡΓΑΝΗ.");
  }
  greeceRangeDate(referenceDate);
  const wallTime = greeceDateTimeInput(occurredAt, true);
  const offsetMinutes = Math.round((Date.parse(wallTime + "Z") - occurredAt.getTime()) / 60_000);
  const offsetHours = String(offsetMinutes / 60).padStart(2, "0");

  return {Cards:{Card:[{
    f_afm_ergodoti:employerTaxId,
    f_aa:String(branchNumber),
    f_comments:null,
    Details:{CardDetails:[{
      f_afm:employeeTaxId,
      f_eponymo:lastName.trim(),
      f_onoma:firstName.trim(),
      f_type:type === "IN" ? "0" : "1",
      f_reference_date:referenceDate,
      f_date:`${wallTime}+${offsetHours}:00`,
      f_aitiologia:null
    }]}
  }]}};
}

export function prepareErganiTrialWorkCard({token, card, fetchImpl = fetch}) {
  if (typeof token !== "string" || !token.trim()) throw new Error("Λείπει η πρόσβαση στο δοκιμαστικό ΕΡΓΑΝΗ.");
  const body = JSON.stringify(cardPayload(card));
  return () => sendTrialCard({token, body, fetchImpl});
}

async function sendTrialCard({token, body, fetchImpl}) {
  try {
    const response = await fetchImpl(TRIAL_ENDPOINT, {
      method:"POST",
      headers:{Authorization:`Bearer ${token}`, "Content-Type":"application/json", Accept:"application/json"},
      body,
      redirect:"error",
      signal:AbortSignal.timeout(8_000)
    });
    if (response.status === 400) {
      return {status:"REJECTED", reference:null, error:"Το δοκιμαστικό ΕΡΓΑΝΗ απέρριψε τη σήμανση."};
    }
    if (response.status !== 200) return uncertain();
    const receipts = await response.json();
    if (!Array.isArray(receipts) || receipts.length !== 1) return uncertain();
    const receipt = receipts[0];
    if (typeof receipt?.id !== "string" || !receipt.id.trim()
      || typeof receipt.protocol !== "string" || !receipt.protocol.trim()) return uncertain();
    return {status:"ACCEPTED", reference:receipt.protocol.trim(), error:null};
  } catch {
    return uncertain();
  }
}

export async function submitErganiTrialWorkCard(options) {
  return prepareErganiTrialWorkCard(options)();
}

export async function authenticateErganiTrial({username, password, fetchImpl = fetch}) {
  if (typeof username !== "string" || !username.trim() || typeof password !== "string" || !password) {
    throw new Error("Λείπουν τα στοιχεία σύνδεσης στο δοκιμαστικό ΕΡΓΑΝΗ.");
  }

  try {
    const response = await fetchImpl(TRIAL_API + "Authentication", {
      method:"POST",
      headers:{"Content-Type":"application/json", Accept:"application/json"},
      body:JSON.stringify({Username:username.trim(), Password:password, Usertype:"02"}),
      redirect:"error",
      signal:AbortSignal.timeout(8_000)
    });
    if (response.status === 200) {
      const result = await response.json();
      if (typeof result?.accessToken === "string" && result.accessToken.trim()) return result.accessToken.trim();
    }
  } catch {
    // Provider errors can contain authentication details.
  }
  throw new Error("Η δοκιμαστική σύνδεση στο ΕΡΓΑΝΗ δεν επιβεβαιώθηκε.");
}

export async function listErganiTrialEmployerServices({token, fetchImpl = fetch}) {
  if (typeof token !== "string" || !token.trim()) throw new Error("Λείπει η πρόσβαση στο δοκιμαστικό ΕΡΓΑΝΗ.");

  try {
    const response = await fetchImpl(TRIAL_API + "WebServices/ServicesList", {
      method:"GET",
      headers:{Authorization:`Bearer ${token.trim()}`, Accept:"application/json"},
      redirect:"error",
      signal:AbortSignal.timeout(8_000)
    });
    if (response.status === 200) {
      const services = await response.json();
      if (Array.isArray(services) && services.every(service =>
        typeof service?.name === "string" && service.name.trim() && Array.isArray(service.parameters)
      )) return services;
    }
  } catch {
    // Authentication and response details stay inside the provider boundary.
  }
  throw new Error("Δεν επιβεβαιώθηκε ο κατάλογος υπηρεσιών του δοκιμαστικού ΕΡΓΑΝΗ.");
}
