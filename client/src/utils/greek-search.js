export function normalizeGreekSearch(value) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[ςΣ]/g, "σ")
    .toLocaleLowerCase("el-GR")
    .replace(/\s+/g, " ")
    .trim();
}

export function matchesGreekSearch(query, values) {
  const terms = normalizeGreekSearch(query).split(" ").filter(Boolean);
  if (!terms.length) return true;
  const haystack = normalizeGreekSearch(Array.isArray(values) ? values.flat(Infinity).join(" ") : values);
  return terms.every((term) => haystack.includes(term));
}
