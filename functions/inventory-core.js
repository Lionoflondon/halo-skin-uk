'use strict';

function reserveInventory(products, items) {
  const byId = new Map(products.map(product => [product.id, product]));
  return items.map(item => {
    const product = byId.get(item.id);
    const stockQuantity = product?.stockQuantity;
    if (!Number.isSafeInteger(stockQuantity) || stockQuantity < 0 || stockQuantity < item.quantity) {
      throw new Error(`Stock is unavailable for ${item.title}.`);
    }
    const reservedQuantity = product.reservedQuantity ?? 0;
    if (!Number.isSafeInteger(reservedQuantity) || reservedQuantity < 0 ||
        !Number.isSafeInteger(reservedQuantity + item.quantity)) {
      throw new Error(`Stock reservation is inconsistent for ${item.title}.`);
    }
    return { id: item.id, quantity: item.quantity, stockQuantityAfter: stockQuantity - item.quantity,
      reservedQuantityAfter: reservedQuantity + item.quantity };
  });
}

function releaseInventory(product, quantity) {
  if (!Number.isSafeInteger(product?.stockQuantity) || product.stockQuantity < 0 ||
      !Number.isSafeInteger(product?.reservedQuantity) || product.reservedQuantity < quantity ||
      !Number.isSafeInteger(quantity) || quantity < 1 || !Number.isSafeInteger(product.stockQuantity + quantity)) {
    throw new Error('Inventory count is missing or inconsistent; reconcile stock before release.');
  }
  return { stockQuantity: product.stockQuantity + quantity, reservedQuantity: product.reservedQuantity - quantity };
}

function inventoryCountAdjustment(currentAvailable, reservedQuantity, physicalCount) {
  const counted = Number(physicalCount);
  if (!Number.isSafeInteger(counted) || counted < 0) throw new Error('Enter a verified non-negative stock count.');
  const reserved = Number(reservedQuantity);
  if (!Number.isSafeInteger(reserved) || reserved < 0 || counted < reserved) {
    throw new Error('Physical count cannot be less than units reserved for open checkouts.');
  }
  if (currentAvailable !== null && currentAvailable !== undefined && (!Number.isSafeInteger(currentAvailable) || currentAvailable < 0)) {
    throw new Error('Current inventory count is inconsistent.');
  }
  const previousPhysicalCount = Number.isSafeInteger(currentAvailable) ? currentAvailable + reserved : null;
  return { previousPhysicalCount, physicalCount: counted, availableQuantity: counted - reserved,
    delta: previousPhysicalCount === null ? null : counted - previousPhysicalCount };
}

module.exports = { inventoryCountAdjustment, releaseInventory, reserveInventory };
