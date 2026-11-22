import { assertEfoodLabContext, normalizeEfoodWebhook } from './foundation.js';

function requireCondition(condition, message) {
  if (!condition) throw new Error(message);
}

// This planner accepts only synthetic LAB payment data. It makes no external calls.
export function planEfoodLabOrder({ context, vendorId, payload, order, appliedEvent, product, syntheticPayment }) {
  assertEfoodLabContext(context);
  const event = normalizeEfoodWebhook(payload);
  requireCondition(context.environment === 'SANDBOX' && vendorId && event.providerStoreId === vendorId,
    'Expected the configured SANDBOX vendor');
  requireCondition(!order || order.externalOrderId === event.externalOrderId, 'Unexpected order identity');

  if (appliedEvent) {
    requireCondition(appliedEvent.idempotencyKey === event.idempotencyKey &&
      appliedEvent.payloadHash === event.payloadHash, 'Conflicting event replay');
    return { action: 'NONE', stockDelta: 0, chargeCents: 0 };
  }

  const receipt = { idempotencyKey: event.idempotencyKey, payloadHash: event.payloadHash };
  if (event.status === 'CANCELLED') {
    requireCondition(order?.status === 'ACCEPTED' || order?.status === 'CANCELLED',
      'Cancellation requires a recorded LAB order');
    const alreadyCancelled = order.status === 'CANCELLED';
    return {
      action: alreadyCancelled ? 'NONE' : 'CANCEL',
      receipt,
      order: { ...order, status: 'CANCELLED' },
      stockDelta: alreadyCancelled ? 0 : order.quantity,
      chargeCents: 0,
    };
  }

  requireCondition(event.status === 'READY_FOR_PICKUP' && !order, 'Unsupported LAB order transition');
  const [item] = event.productRefs;
  requireCondition(event.productRefs.length === 1 && product?.id && item.externalProductId &&
    item.externalProductId === product.externalProductId, 'Expected one explicitly mapped LAB product');
  requireCondition(Number.isSafeInteger(item.quantity) && item.quantity > 0 &&
    Number.isSafeInteger(product.availableStock) && product.availableStock >= item.quantity,
  'Invalid quantity or insufficient LAB stock');

  const grossCents = product.unitGrossCents * item.quantity;
  requireCondition(Number.isSafeInteger(product.unitGrossCents) && Number.isSafeInteger(grossCents) &&
    grossCents > 0 && syntheticPayment?.state === 'PREPAID' && syntheticPayment.grossCents === grossCents,
  'Synthetic prepaid amount does not match the LAB order');

  return {
    action: 'ACCEPT',
    receipt,
    order: {
      externalOrderId: event.externalOrderId,
      productId: product.id,
      quantity: item.quantity,
      grossCents,
      paymentState: 'PREPAID',
      status: 'ACCEPTED',
    },
    stockDelta: -item.quantity,
    chargeCents: 0,
  };
}
