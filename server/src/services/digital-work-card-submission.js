import {prepareErganiTrialWorkCard} from "./ergani-trial-work-card.js";

const fields = {
  IN: {status:"entryStatus", time:"entryAt", requestId:"entryRequestId", reference:"entryErganiReference", error:"entryError"},
  OUT: {status:"departureStatus", time:"departureAt", requestId:"departureRequestId", reference:"departureErganiReference", error:"departureError"}
};

export async function sendRecordedDigitalWorkCard({
  db, storeId, employeeId, sessionId, requestId, type, token, identity, referenceDate, fetchImpl
}) {
  const event = Object.hasOwn(fields, type) ? fields[type] : null;
  if (!event || !storeId || !employeeId || !sessionId || !requestId) {
    throw new Error("Λείπουν τα στοιχεία της καταγεγραμμένης σήμανσης.");
  }
  const scope = {id:sessionId, storeId, employeeId, [event.requestId]:requestId};
  const record = await db.digitalWorkSession.findFirst({
    where:scope,
    select:{[event.time]:true, [event.status]:true, entryStatus:true}
  });
  if (!record || record[event.status] !== "PENDING" || !record[event.time] || (type === "OUT" && record.entryStatus !== "ACCEPTED")) {
    return {sent:false};
  }

  const send = prepareErganiTrialWorkCard({
    token, fetchImpl,
    card:{...identity, type, referenceDate, occurredAt:record[event.time]}
  });

  // A crash after reserving the send leaves an uncertain result for reconciliation.
  // Never resend automatically when the request may have reached ERGANI.
  const reserved = await db.digitalWorkSession.updateMany({
    where:{...scope, [event.status]:"PENDING", ...(type === "OUT" ? {entryStatus:"ACCEPTED"} : {})},
    data:{[event.status]:"UNKNOWN", [event.error]:"Η επιβεβαίωση της σήμανσης εκκρεμεί."}
  });
  if (reserved.count !== 1) return {sent:false};

  const result = await send();
  await db.digitalWorkSession.updateMany({
    where:{...scope, [event.status]:"UNKNOWN"},
    data:{[event.status]:result.status, [event.reference]:result.reference, [event.error]:result.error}
  });
  return {sent:true, ...result};
}
