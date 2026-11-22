// Keep actual product IDs for checkout, holds, preparation and stock operations.
const links = row => row?.isSet ? row.setItems || [] : [];
const requireUnsent = row => {
  if (row?.productionSent) throw new Error('Το είδος έχει ήδη σταλεί στην παραγωγή. Ολοκλήρωσε την τρέχουσα συναλλαγή πριν προσθέσεις ξανά το ίδιο είδος ή αλλάξεις την ποσότητά του. Για ακύρωση απαιτείται έλεγχος στην παραγωγή.');
};
export const isSetCartChild = (cart, row) => cart.some(parent => parent !== row && links(parent).some(item => item.id === row.id));
const multiplier = item => {
  const value = Number(item.quantity);
  if (!Number.isFinite(value) || value <= 0) throw new Error('Μη έγκυρη ποσότητα συνοδευτικού SET.');
  return value;
};
function changeLinked(cart, parent, delta) {
  let next = cart;
  for (const item of links(parent)) {
    const rate = multiplier(item), existing = next.find(row => row.id === item.id);
    if (delta !== 0) requireUnsent(existing);
    if (existing && Number(existing.salePrice) !== Number(item.salePrice)) throw new Error('Η τιμή του συνοδευτικού SET διαφέρει. Διατήρησε το υπάρχον καλάθι και ολοκλήρωσέ το πρώτα.');
    const quantity = Number(existing?.quantity || 0) + delta * rate;
    if (quantity < -0.000001) throw new Error('Η σύνθεση SET του υπάρχοντος καλαθιού χρειάζεται έλεγχο.');
    if (quantity <= 0.000001) next = next.filter(row => row.id !== item.id);
    else if (existing) next = next.map(row => row.id === item.id ? {...row, quantity} : row);
    else next = [...next, {...item, productId: item.productId || item.id, quantity, setParentId: parent.productId || parent.id, setParentName: parent.name}];
  }
  return next;
}
function validateLinked(cart) {
  const required = new Map();
  for (const parent of cart) for (const item of links(parent)) required.set(item.id, (required.get(item.id) || 0) + Number(parent.quantity) * multiplier(item));
  for (const [id, quantity] of required) if (Number(cart.find(row => row.id === id)?.quantity || 0) + 0.000001 < quantity) throw new Error('Η σύνθεση SET άλλαξε. Διατήρησε το υπάρχον καλάθι και ολοκλήρωσέ το πριν χρησιμοποιήσεις τη νέα σύνθεση.');
}
export function addSetCartProduct(cart, product) {
  const id = product.cartKey || product.id, existing = cart.find(row => row.id === id);
  requireUnsent(existing);
  if (product.isSet && existing && !existing.isSet) throw new Error('Η σύνθεση SET άλλαξε. Διατήρησε το υπάρχον καλάθι και ολοκλήρωσέ το πρώτα.');
  if (product.isSet) validateLinked(cart);
  const parent = existing ? {...existing, quantity: Number(existing.quantity) + 1} : {...product, id, productId: product.productId || product.id, quantity: 1};
  const next = existing ? cart.map(row => row.id === id ? parent : row) : [...cart, parent];
  return changeLinked(next, parent, 1);
}
export function setCartProductQuantity(cart, id, quantity) {
  const parent = cart.find(row => row.id === id);
  if (!parent || isSetCartChild(cart, parent)) return cart;
  if (Number(quantity) !== Number(parent.quantity)) requireUnsent(parent);
  if (parent.isSet) validateLinked(cart);
  const next = cart.map(row => row.id === id ? {...row, quantity} : row);
  return changeLinked(next, parent, quantity - Number(parent.quantity));
}
export function removeSetCartProduct(cart, id) {
  const parent = cart.find(row => row.id === id);
  if (!parent || isSetCartChild(cart, parent)) return cart;
  requireUnsent(parent);
  if (parent.isSet) validateLinked(cart);
  return changeLinked(cart.filter(row => row.id !== id), parent, -Number(parent.quantity));
}
