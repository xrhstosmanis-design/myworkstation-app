const normalize=value=>String(value||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLocaleLowerCase('el-GR').trim().replace(/\s+/g,' ');

function descriptor(product){
 if(typeof product!=='string'||/[\u0000-\u001f\u007f]/.test(product))return null;
 const match=product.match(/^(.+?)\s+\(SKU\s+([^\s()]{1,64})\)$/iu);
 return match&&match[1].trim()?{name:match[1].trim(),sku:match[2]}:null;
}

// A display label is not a literal catalog query. Read by its name, then
// require BOTH native identity fields before selecting a decorated result.
export const salesProductReportQuery=product=>descriptor(product)?.name??product;

export function matchingSalesProducts(rows,product){
 const query=normalize(product),exact=rows.filter(row=>normalize(row.sku)===query||normalize(row.name)===query);
 // A real product may itself contain '(SKU ...)'; its literal name retains
 // precedence exactly as before. Never silently replace that identity.
 if(exact.length)return exact;
 const pair=descriptor(product);
 if(pair)return rows.filter(row=>normalize(row.name)===normalize(pair.name)&&normalize(row.sku)===normalize(pair.sku));
 return rows.filter(row=>normalize(row.sku).includes(query)||normalize(row.name).includes(query));
}
