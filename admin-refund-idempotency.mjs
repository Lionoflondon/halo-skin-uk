const fallbackKeys = new Map();

function storageKey(orderId, refundedPence) {
  if (!/^[a-f0-9]{32}$/.test(String(orderId || '')) || !Number.isSafeInteger(refundedPence) || refundedPence < 0) {
    throw new Error('HALO refund order snapshot is invalid.');
  }
  return `halo-refund-v1:${orderId}:${refundedPence}`;
}

export function getRefundRequestKey(orderId, refundedPence, {
  storage,
  createKey = () => globalThis.crypto.randomUUID()
} = {}) {
  const key = storageKey(orderId, refundedPence);
  try {
    const activeStorage = storage === undefined ? globalThis.localStorage : storage;
    if (!activeStorage) throw new Error('Browser storage is unavailable.');
    const existing = activeStorage.getItem(key);
    if (typeof existing === 'string' && existing.length >= 16 && existing.length <= 128) return existing;
    const requestKey = createKey();
    if (typeof requestKey !== 'string' || requestKey.length < 16 || requestKey.length > 128) {
      throw new Error('Generated HALO refund idempotency key is invalid.');
    }
    activeStorage.setItem(key, requestKey);
    return requestKey;
  } catch (error) {
    const existingFallbackKey = fallbackKeys.get(key);
    if (existingFallbackKey) return existingFallbackKey;
    const requestKey = createKey();
    if (typeof requestKey !== 'string' || requestKey.length < 16 || requestKey.length > 128) {
      throw new Error('Generated HALO refund idempotency key is invalid.', { cause: error });
    }
    fallbackKeys.set(key, requestKey);
    return requestKey;
  }
}
