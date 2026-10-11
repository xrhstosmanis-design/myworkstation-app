import test from "node:test";
import assert from "node:assert/strict";
import {formatAssistantEuroText} from "../../client/src/components/voice/formatAssistantEuroText.js";
const visible = text => text.replace(/[\u00a0\u202f]/g, " ");
test("real Owner provider net and VAT fractions display as two-decimal Greek euro amounts", () => {
  const raw = "SKU2269 01/10/2026–10/10/2026, 5 τεμάχια. Καθαρή αξία: €2,2123893805309733 ΦΠΑ: €0,28761061946902655";
  assert.equal(visible(formatAssistantEuroText(raw)), "SKU2269 01/10/2026–10/10/2026, 5 τεμάχια. Καθαρή αξία: 2,21 € ΦΠΑ: 0,29 €");
  assert.match(raw, /€2,2123893805309733/);
});
test("euro prefix/suffix, decimal separators and signed reversals", () => {
  for (const [raw, expected] of [["€-0,287610619469", "-0,29 €"], ["-2.21238938053 €", "-2,21 €"], ["2,21238938053€", "2,21 €"], ["€ 0.0050001", "0,01 €"]])
    assert.equal(visible(formatAssistantEuroText(raw)), expected);
  assert.equal(visible(formatAssistantEuroText("€1.234,56789 / 1,234.56789€")), "1.234,57 € / 1.234,57 €");
});
test("keep non-currency values and ambiguous or already formatted euro tokens unchanged", () => {
  for (const raw of ["01/10/2026 SKU2269 5 τεμάχια 2.21238938053 79,66%", "€2,50 / 2,21 € / €1.234 / 1,234 €", "€1.234,56 / 1,234.56 €", "€12.34,56789", "€99999999999999999999.12345"])
    assert.equal(formatAssistantEuroText(raw), raw);
  assert.equal(formatAssistantEuroText(undefined), undefined);
  assert.equal(formatAssistantEuroText(null), null);
});
