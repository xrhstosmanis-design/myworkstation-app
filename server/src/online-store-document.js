import {readFile} from "node:fs/promises";
import path from "node:path";

const canonical = "https://myworkstation-app.onrender.com/online/daily-bite";
const title = "DAILY BITE - Online Παραγγελίες";
const description = "DAILY BITE — Σωστή διατροφή… κάθε μέρα! Καφές και αγαπημένες γεύσεις, με παραλαβή ή delivery.";
const image = "https://myworkstation-app.onrender.com/kat/brand-daily-bite.png";

// Crawlers need the store identity in the initial response, before scripts run.
// Keep the shared storefront body and every other store's response unchanged.
export function dailyBiteDocument(html) {
  return html.replace(/<title>[\s\S]*?<\/title>/i, `<title>${title}</title>
<meta name="description" content="${description}" />
<link rel="canonical" href="${canonical}" />
<meta property="og:type" content="website" />
<meta property="og:site_name" content="DAILY BITE" />
<meta property="og:title" content="${title}" />
<meta property="og:description" content="${description}" />
<meta property="og:url" content="${canonical}" />
<meta property="og:image" content="${image}" />
<meta property="og:image:type" content="image/png" />
<meta property="og:image:width" content="825" />
<meta property="og:image:height" content="774" />
<meta property="og:image:alt" content="DAILY BITE" />
<meta name="twitter:card" content="summary" />
<meta name="twitter:title" content="${title}" />
<meta name="twitter:description" content="${description}" />
<meta name="twitter:image" content="${image}" />`);
}

export function onlineStoreDocumentHandler(dist) {
  const file = path.join(dist, "kat/app.html");
  return async (req, res, next) => {
    if (req.params.publicSlug !== "daily-bite") return res.sendFile(file);
    try {
      const html = await readFile(file, "utf8");
      res.set("Cache-Control", "no-cache").type("html").send(dailyBiteDocument(html));
    } catch (error) {
      next(error);
    }
  };
}
