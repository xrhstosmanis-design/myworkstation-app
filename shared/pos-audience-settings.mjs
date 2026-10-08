export const AUDIENCE_KEYS = Object.freeze(["NORMAL", "DOCTOR", "NURSE", "STAFF", "CUSTOMER"]);
export const DEFAULT_AUDIENCE_LABELS = Object.freeze({
  NORMAL: "Κανονική τιμή", DOCTOR: "Ιατρός", NURSE: "Νοσηλευτής / Νοσοκόμος",
  STAFF: "Προσωπικό", CUSTOMER: "Πελάτης",
});

export function normalizeAudienceSettings(value) {
  const labels = Object.fromEntries(AUDIENCE_KEYS.map(key => {
    const text = typeof value?.labels?.[key] === "string" ? value.labels[key].trim() : "";
    return [key, text && text.length <= 60 ? text : DEFAULT_AUDIENCE_LABELS[key]];
  }));
  return {enabled: value?.enabled === true, labels};
}

export const audienceLabelFor = (audience, settings) =>
  normalizeAudienceSettings(settings).labels[audience] || DEFAULT_AUDIENCE_LABELS.NORMAL;
