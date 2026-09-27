import fs from 'fs';

// Preserve the product-specific modifier lookup verified in the LAB.
const file='client/src/components/store/StorePreparationModal.jsx';
const src=fs.readFileSync(file,'utf8');
const filtered='api(`/api/store-pos/stores/${store.id}/modifiers?productId=${encodeURIComponent(line.id)}`)';
if(!src.includes(filtered)){
  throw new Error('Product-specific POS modifiers are missing; refusing to build.');
}
console.log('[build] Product-specific POS preparation modifiers preserved.');
