import {storedCategoryName} from "./pos-catalog-resolver.js";

const normalize = value => String(value ?? "").normalize("NFD")
  .replace(/\p{M}/gu, "").toLocaleUpperCase("el-GR");
const words = value => normalize(value).match(/[\p{L}\p{N}]+/gu) || [];
const beverageCategories = new Set([
  "ΜΠΥΡΕΣ", "ΜΠΙΡΕΣ", "ΜΠΥΡΑ", "ΜΠΙΡΑ", "BEER", "BEERS",
  "ΑΝΑΨΥΚΤΙΚΑ", "ΑΝΑΨΥΚΤΙΚΟ", "SOFTDRINKS", "SOFTDRINK"
]);
const brandAliases = new Map([
  ["ALFA", "ΑΛΦΑ"], ["AMSTEL", "ΑΜΣΤΕΛ"], ["HEINEKEN", "ΧΑΙΝΕΚΕΝ"],
  ["KAISER", "ΚΑΙΖΕΡ"], ["MYTHOS", "ΜΥΘΟΣ"], ["MAMOS", "ΜΑΜΟΣ"],
  ["FIX", "ΦΙΞ"], ["FANTA", "ΦΑΝΤΑ"], ["PEPSI", "ΠΕΨΙ"],
  ["SPRITE", "ΣΠΡΑΙΤ"], ["LOUX", "ΛΟΥΞ"], ["VIKOS", "ΒΙΚΟΣ"]
]);

function isBeverageCategory(category) {
  for (const button of [category, category?.parentCategory]) {
    for (const value of [button?.label, storedCategoryName(button)]) {
      const tokens = words(value);
      if (tokens.some(token => beverageCategories.has(token)) ||
          tokens.some((token, i) => token === "SOFT" && /^DRINKS?$/.test(tokens[i + 1] || ""))) return true;
    }
  }
  return false;
}

function brandKey(name, index) {
  const tokens = words(name);
  if (!tokens.length) return `unnamed:${index}`;
  const pair = tokens.slice(0, 2).join("");
  if (["COCACOLA", "ΚΟΚΑΚΟΛΑ"].includes(pair) || ["COCACOLA", "ΚΟΚΑΚΟΛΑ"].includes(tokens[0])) return "COCACOLA";
  if (pair === "7UP" || pair === "SEVENUP" || tokens[0] === "7UP") return "7UP";
  // A name's leading brand stays together even when the following flavour differs.
  return brandAliases.get(tokens[0]) || tokens[0];
}

function volumeMl(name) {
  const match = name.match(/(?:^|[^\d.,])(\d+(?:[.,]\d+)?)\s*(ML|ΜΛ|CL|LT|ΛΤ|L|ΛΙΤΡΑ|ΛΙΤΡΟ)(?!\p{L})/u);
  if (!match) return Infinity;
  const amount = Number(match[1].replace(",", "."));
  const factor = /^(ML|ΜΛ)$/.test(match[2]) ? 1 : match[2] === "CL" ? 10 : 1000;
  return amount > 0 ? Math.round(amount * factor) : Infinity;
}

function packageRank(name) {
  if (/(?:^|[^\p{L}])(ΚΟΥΤΙ|ΚΟΥΤΑΚΙ|CAN|CANS)(?!\p{L})/u.test(name)) return 0;
  if (/(?:^|[^\p{L}])(ΦΙΑΛΗ|ΦΙΑΛΕΣ|ΜΠΟΥΚΑΛΙ|BOTTLE|PET)(?!\p{L})/u.test(name)) return 1;
  return 2;
}

// Presentation only: preserve resolver arrays, product identities and all other categories.
export function orderPosBeverageDisplay(products, category) {
  if (!isBeverageCategory(category) || products.length < 2) return products;
  const groups = new Map();
  for (const [index, product] of products.entries()) {
    const name = normalize(product.name);
    const key = brandKey(name, index);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push({product, index, volume: volumeMl(name), pack: packageRank(name)});
  }
  return [...groups.values()].flatMap(group => group
    .sort((a, b) => a.volume === Infinity && b.volume === Infinity
      ? a.index - b.index
      : (a.volume === b.volume ? 0 : a.volume < b.volume ? -1 : 1) || a.pack - b.pack || a.index - b.index)
    .map(row => row.product));
}
