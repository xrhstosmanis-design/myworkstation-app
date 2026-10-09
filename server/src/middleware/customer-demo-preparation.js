// Reserved namespace: preparation never enters general activation, provisioning,
// impersonation or provider/settings paths, even when the feature flag is off.
const reserved = /^customer-demo-(?:store-)?[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}(?:$|-)/;
function contains(value) {
  const pending = [value];
  while (pending.length) {
    const current = pending.pop();
    if (typeof current === "string" && reserved.test(current)) return true;
    if (current && typeof current === "object") for (const nested of Object.values(current)) pending.push(nested);
  }
  return false;
}
export function blockPreparedDemoMutation(req, res, next) {
  if (["GET", "HEAD", "OPTIONS"].includes(req.method)) return next();
  const path = String(req.originalUrl || "").split("?")[0];
  if (/^\/api\/platform\/customer-demos(?:\/|$)/.test(path)) return next();
  let parts;
  try { parts = path.split("/").map(decodeURIComponent); } catch { return res.status(400).json({ error: "Μη έγκυρος σύνδεσμος." }); }
  if (contains(parts) || contains(req.body) || contains(req.query)) return res.status(409).json({ error: "Το demo διαχειρίζεται μόνο από την Προετοιμασία Demo και παραμένει ανενεργό.", code: "DEMO_PREPARATION_LOCKED" });
  next();
}
