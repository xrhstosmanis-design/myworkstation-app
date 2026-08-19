import fs from 'fs';

const file='client/src/components/store/StorePreparationModal.jsx';
let src=fs.readFileSync(file,'utf8');
const filtered='api(`/api/store-pos/stores/${store.id}/modifiers?productId=${encodeURIComponent(line.id)}`)';
const allGroups='api(`/api/store-pos/stores/${store.id}/modifiers`)';
if(src.includes(filtered)){
  src=src.replace(filtered,allGroups);
}
src=src.replace('Δεν έχουν οριστεί ακόμη ομάδες Modifiers για αυτό το προϊόν στο BackOffice.','Δεν έχουν οριστεί ακόμη ομάδες Modifiers στο BackOffice.');
fs.writeFileSync(file,src);
console.log('[build] POS preparation modifiers restored: all active BackOffice modifier groups are shown in POS');
