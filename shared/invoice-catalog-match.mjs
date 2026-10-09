// Suggestions only: a name score never authorizes a product mapping.
const groups=[
 ['HALLS','HLS'],['7DAYS','7D'],['ΚΡΟΥΑΣΑΝ','ΚΡΣΝ','CROISSANT'],
 ['ΜΕΛΙ','ΜΕΛ','HONEY'],['ΛΕΜΟΝΙ','LEMON'],['ΚΑΚΑΟ','ΚΑΚ','COCOA'],
 ['ΒΑΝΙΛΙΑ','ΒΑΝ','VANILLA'],['ΧΖ','SUGARFREE','ΧΩΡΙΣΖΑΧΑΡΗ'],
];
export const plain=value=>String(value||'').normalize('NFD').replace(/\p{M}/gu,'').toUpperCase();
const canonical=new Map(groups.flatMap(group=>group.map(word=>[plain(word),plain(group[0])])));
const words=value=>plain(value).replace(/Χ\s*\/\s*Ζ|ΧΩΡΙΣ\s+ΖΑΧΑΡΗ|SUGAR\s+FREE/g,' ΧΖ ').replace(/[^\p{L}\p{N}]+/gu,' ').trim().split(/\s+/).filter(Boolean);
export function catalogTokens(value){return [...new Set(words(value).filter(w=>w.length>=3||canonical.has(w)).filter(w=>!/^\d+(?:G|GR|GX\d+|ML|LT|KG)?$/.test(w)&&!['ΚΑΡ','KAP','ΚΑΡΑΜΕΛΕΣ'].includes(w)).map(w=>canonical.get(w)||w))].slice(0,12)}
export function catalogPatterns(value){
 const tokens=catalogTokens(value),out=[];
 for(const token of tokens){const aliases=groups.find(g=>plain(g[0])===token)||[token];for(const alias of aliases)out.push(`%${alias.replace(/[%_\\]/g,'\\$&')}%`)}
 return [...new Set(out)].slice(0,36);
}
const sizes=value=>[...plain(value).matchAll(/(\d+(?:[.,]\d+)?)\s*(KG|GR|G|ML|LT|L)(?=\b|X|\d)/g)].map(m=>`${Number(m[1].replace(',','.'))*(m[2]==='KG'?1000:m[2]==='LT'||m[2]==='L'?1000:1)}${['ML','LT','L'].includes(m[2])?'ML':'G'}`);
export function rankCatalogMatches(rows,query){
 const queryTokens=catalogTokens(query),querySizes=sizes(query);
 return rows.map(row=>{const tokens=catalogTokens(row.name),matched=queryTokens.filter(token=>tokens.includes(token));let score=matched.length*10;
  if(queryTokens.length&&matched.length===queryTokens.length)score+=15;
  if(plain(row.name)===plain(query)||plain(row.sku)===plain(query))score+=100;
  const productSizes=sizes(row.name);if(querySizes.length&&productSizes.length)score+=querySizes.some(s=>productSizes.includes(s))?5:-5;
  return {...row,matchScore:score,matchedTerms:matched};
 }).sort((a,b)=>b.matchScore-a.matchScore||a.name.localeCompare(b.name,'el')||a.id.localeCompare(b.id));
}
