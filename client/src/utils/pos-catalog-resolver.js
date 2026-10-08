const META_SEP="::MWSMETA::",CHILD_SEP="::MWSCHILD::";
export const decodeStored=value=>{const raw=String(value||"");const [base,meta=""]=raw.split(META_SEP);return{base,codes:meta?meta.split(",").filter(Boolean).map(code=>{try{return decodeURIComponent(code)}catch{return code}}):[]}};
export const storedChildren=button=>{if(Array.isArray(button?.children)&&button.children.length)return button.children;const raw=String(button?.categoryName||button?.productQuery||"");const index=raw.indexOf(CHILD_SEP);if(index<0)return[];try{const parsed=JSON.parse(decodeURIComponent(raw.slice(index+CHILD_SEP.length)));return Array.isArray(parsed)?parsed:[]}catch{return[]}};
export const storedCodes=button=>{if(Array.isArray(button?.productCodes)&&button.productCodes.length)return button.productCodes;return decodeStored(button?.categoryName||button?.productQuery||"").codes};
export const storedCategoryName=button=>{const raw=String(button?.categoryName||button?.productQuery||"");const childIndex=raw.indexOf(CHILD_SEP);return decodeStored(childIndex>=0?raw.slice(0,childIndex):raw).base};
const identifierVariants=value=>{const raw=String(value??"").trim();if(!raw)return[];const variants=new Set(),addPart=part=>{const clean=String(part||"").trim();if(!clean)return;const upper=clean.toLocaleUpperCase("el-GR"),compact=clean.replace(/[^0-9A-Za-zΑ-Ωα-ω]/g,"").toLocaleUpperCase("el-GR");variants.add(upper);variants.add(compact);if(/^\d+$/.test(compact))variants.add(compact.replace(/^0+(?=\d)/,""))};addPart(raw);raw.split("~").forEach(addPart);return[...variants].filter(Boolean)};
const productIdentifiers=product=>[product?.id,product?.sku,product?.sourceCode,product?.masterCode,...(product?.barcodes||[])].flatMap(identifierVariants);
export const productMatchesCodes=(product,codes)=>{const wanted=new Set((codes||[]).flatMap(identifierVariants));return wanted.size>0&&productIdentifiers(product).some(value=>wanted.has(value))};
export const matchingStoredCodes=(product,codes)=>{const ids=new Set(productIdentifiers(product));return (codes||[]).filter(code=>identifierVariants(code).some(value=>ids.has(value)))};

// Each resolver belongs to one immutable POS catalog/layout. No cross-store cache.
export function createPosCatalogResolver(products, companyCatalog) {
  const byId = new Map();
  const identifiers = new WeakMap(), names = new WeakMap();
  const categoryCache = new WeakMap(), countCache = new WeakMap(), quickCache = new WeakMap();
  for (const product of products) {
    const rows = byId.get(product.id) || [];
    rows.push(product);
    byId.set(product.id, rows);
  }
  const identifiersFor = product => {
    if (!identifiers.has(product)) identifiers.set(product, productIdentifiers(product));
    return identifiers.get(product);
  };
  const nameFor = product => {
    if (!names.has(product)) names.set(product, product.name.toLocaleLowerCase("el-GR"));
    return names.get(product);
  };
  const matches = codes => {
    const wanted = new Set(codes.flatMap(identifierVariants));
    return product => wanted.size > 0 && identifiersFor(product).some(value => wanted.has(value));
  };
  const categoryProducts = button => {
    if (categoryCache.has(button)) return categoryCache.get(button);
    const codes = storedCodes(button);
    let rows;
    if (codes.length) {
      rows = companyCatalog
        ? [...new Map(codes.flatMap(code => byId.get(code) || []).map(product => [product.id, product])).values()]
        : products.filter(matches(codes));
    } else {
      const name = String(storedCategoryName(button) || button?.label || "").toLocaleLowerCase("el-GR");
      rows = products.filter(product => String(product.categoryName || "").toLocaleLowerCase("el-GR") === name);
    }
    categoryCache.set(button, rows);
    return rows;
  };
  const categoryCount = button => {
    if (countCache.has(button)) return countCache.get(button);
    const children = storedChildren(button);
    const count = children.length
      ? new Set(children.flatMap(child => categoryProducts(child).map(product => product.id))).size
      : categoryProducts(button).length;
    countCache.set(button, count);
    return count;
  };
  const quickProduct = button => {
    if (quickCache.has(button)) return quickCache.get(button);
    const needle = decodeStored(button.productQuery || button.label || "").base.trim();
    const lower = needle.toLocaleLowerCase("el-GR"), match = matches([needle]);
    // Keep catalog-first precedence: an earlier name match can precede an exact ID.
    const product = products.find(product => match(product) || nameFor(product).includes(lower));
    quickCache.set(button, product);
    return product;
  };
  return {categoryProducts, categoryCount, quickProduct};
}
